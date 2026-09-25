import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AzureDevOpsCommitter, GitHubCommitter } from '@ninjapaw/contracts';
import {
  collectSources,
  createCombinedReport,
  preflightSources,
} from '../../src/reports/combined-report.js';
import { reportStore } from '../../src/reports/report-store.js';
import { acquireAzureDevOpsToken } from '../../src/auth/local-credential.js';
import { acquireGitHubToken } from '../../src/auth/github-cli.js';
import {
  preflightAzureRepositoryAccess,
  collectAzureRepositoryInsights,
} from '../../src/adapters/azure-devops/insights-client.js';
import { fetchAzureDevOpsEstimate } from '../../src/adapters/azure-devops/estimate-client.js';
import {
  fetchGitHubCommitters,
  listGitHubRepositoriesForTarget,
} from '../../src/adapters/github/github-client.js';

vi.mock('../../src/auth/local-credential.js', () => ({
  acquireAzureDevOpsToken: vi.fn(),
  signInWithBrowser: vi.fn(),
}));
vi.mock('../../src/auth/github-cli.js', () => ({
  acquireGitHubToken: vi.fn(),
  selectGitHubAccount: vi.fn(),
  disconnectGitHubAccount: vi.fn(),
}));
vi.mock('../../src/adapters/azure-devops/insights-client.js', () => ({
  collectAzureRepositoryInsights: vi.fn(),
  preflightAzureRepositoryAccess: vi.fn(),
}));
vi.mock('../../src/adapters/github/insights-client.js', () => ({
  gitHubSecurityFeatures: { code_security: 'Code Security' },
  fetchGitHubRepositoryInsight: vi.fn(),
  collectGitHubBilling: vi.fn(),
}));
vi.mock('../../src/adapters/azure-devops/estimate-client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/adapters/azure-devops/estimate-client.js')>()),
  fetchAzureDevOpsEstimate: vi.fn(),
}));
vi.mock('../../src/adapters/github/github-client.js', () => ({
  API_VERSION: '2022-11-28',
  fetchGitHubCommitters: vi.fn(),
  listGitHubRepositoriesForTarget: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(acquireAzureDevOpsToken).mockResolvedValue('azure-token');
  vi.mocked(acquireGitHubToken).mockResolvedValue('github-token');
  vi.mocked(preflightAzureRepositoryAccess).mockRejectedValue(new Error('Permission denied'));
  vi.mocked(fetchAzureDevOpsEstimate).mockReset();
  vi.mocked(fetchGitHubCommitters).mockReset();
  vi.mocked(listGitHubRepositoriesForTarget).mockReset();
  vi.mocked(listGitHubRepositoriesForTarget).mockResolvedValue(['octocat/example']);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const azureRecord: AzureDevOpsCommitter = {
  provider: 'azure-devops',
  organization: 'contoso',
  plan: 'codeSecurity',
  resultType: 'estimated',
  identityId: 'same-id',
  isEstimated: true,
  isLicensed: false,
  collectedAt: '2026-09-23T10:00:00.000Z',
  sourceApiVersion: '7.2-preview.3',
};
const githubRecord: GitHubCommitter = {
  provider: 'github',
  repository: 'octocat/example',
  userId: 'same-id',
  login: 'octocat',
  commitCount: 2,
  lastCommitAt: '2026-09-23T10:00:00.000Z',
  collectedAt: '2026-09-23T10:05:00.000Z',
  sourceApiVersion: '2022-11-28',
};

describe('combined reports', () => {
  it.each([true, false])(
    'reports all Azure dataset failures when estimate access is %s',
    async (estimateReadable) => {
      const actual = await vi.importActual<
        typeof import('../../src/adapters/azure-devops/insights-client.js')
      >('../../src/adapters/azure-devops/insights-client.js');
      vi.mocked(collectAzureRepositoryInsights).mockImplementation(
        actual.collectAzureRepositoryInsights,
      );
      const reads = vi.fn(async () => new Response('private error', { status: 403 }));
      vi.stubGlobal('fetch', reads);
      vi.mocked(fetchAzureDevOpsEstimate).mockImplementation(
        async ({ organization, plan, onEstimate }) => {
          if (!estimateReadable) throw new Error('Permission denied');
          onEstimate?.({
            organization,
            plan: plan === 'all' ? 'codeSecurity' : plan,
            providerCount: 0,
            returnedIdentities: 0,
            status: 'complete',
            collectedAt: new Date().toISOString(),
            sourceUrl: 'https://example.invalid',
            apiVersion: 'test',
            warnings: [],
          });
          return [];
        },
      );
      const [status] = await preflightSources([
        {
          provider: 'azure-devops',
          organization: 'example',
          plans: ['all'],
          includeAzureBilling: true,
        },
      ]);
      expect(status?.status).toBe(estimateReadable ? 'included' : 'skipped');
      if (estimateReadable) expect(status?.reason).toBe('Partial data access');
      expect(reads).toHaveBeenCalledTimes(4);
      for (const dataset of [
        'Security settings',
        'Repository activity',
        'Provider billing snapshot: codeSecurity',
        'Provider billing snapshot: secretProtection',
      ]) {
        expect(status?.accessChecks).toContainEqual(
          expect.objectContaining({
            dataset,
            status: 'unavailable',
            detail: expect.stringContaining('HTTP 403'),
          }),
        );
      }
      expect(status?.accessChecks).toContainEqual(
        expect.objectContaining({
          dataset: 'Security estimate: Code Security',
          status: estimateReadable ? 'complete' : 'unavailable',
        }),
      );
      expect(JSON.stringify(status)).not.toContain('private error');
    },
  );

  it('checks every selected Azure plan and retains access when one succeeds', async () => {
    vi.mocked(fetchAzureDevOpsEstimate).mockImplementation(async ({ plan }) => {
      if (plan === 'secretProtection') throw new Error('Permission denied');
      return [];
    });
    const statuses = await preflightSources([
      {
        provider: 'azure-devops',
        organization: 'contoso',
        plans: ['codeSecurity', 'secretProtection'],
      },
    ]);
    expect(fetchAzureDevOpsEstimate).toHaveBeenCalledTimes(2);
    expect(statuses[0]?.status).toBe('included');
  });

  it('does not save a report when every source fails', async () => {
    const save = vi.spyOn(reportStore, 'put');
    vi.mocked(fetchGitHubCommitters).mockRejectedValue(new Error('Permission denied'));
    await expect(
      createCombinedReport([
        { provider: 'github', targetType: 'organization', target: 'octocat', sinceDays: 90 },
      ]),
    ).rejects.toThrow('None of the selected sources');
    expect(save).not.toHaveBeenCalled();
    save.mockRestore();
  });

  it('skips a source that fails preflight and explains how to fix it', async () => {
    vi.mocked(fetchAzureDevOpsEstimate).mockResolvedValue([]);
    vi.mocked(listGitHubRepositoriesForTarget).mockRejectedValue(
      new Error('GitHub denied access.'),
    );
    const statuses = await preflightSources([
      { provider: 'azure-devops', organization: 'contoso', plans: ['all'] },
      { provider: 'github', targetType: 'organization', target: 'octocat', sinceDays: 90 },
    ]);
    expect(statuses).toEqual([
      expect.objectContaining({ subject: 'contoso', status: 'included' }),
      expect.objectContaining({
        subject: 'octocat',
        status: 'skipped',
        reason: 'Minimum read permission not met',
        remediation: expect.stringContaining('read access'),
      }),
    ]);
  });

  it('deduplicates within each provider without merging cross-provider ID collisions', async () => {
    vi.mocked(fetchAzureDevOpsEstimate).mockImplementation(async ({ plan }) => [
      { ...azureRecord, plan },
    ]);
    vi.mocked(fetchGitHubCommitters).mockResolvedValue([
      githubRecord,
      { ...githubRecord, repository: 'octocat/another', login: 'renamed-login' },
    ]);
    const result = await collectSources([
      { provider: 'azure-devops', organization: 'contoso', plans: ['all'] },
      { provider: 'github', targetType: 'organization', target: 'octocat', sinceDays: 90 },
    ]);
    expect(result.summary).toEqual({
      requestedSources: 2,
      includedSources: 2,
      skippedSources: 0,
      uniqueProviderIdentities: 2,
      azureIdentityRecords: 2,
      gitHubIdentityRecords: 1,
    });
  });

  it('keeps successful sources before and after a collection failure', async () => {
    const visits: string[] = [];
    vi.mocked(fetchAzureDevOpsEstimate).mockImplementation(async ({ organization, plan }) => {
      visits.push(organization);
      return plan === 'codeSecurity' ? [azureRecord] : [];
    });
    vi.mocked(fetchGitHubCommitters).mockImplementation(async ({ repository }) => {
      visits.push(repository);
      if (repository === 'octocat/private') throw new Error('403 permission denied');
      return [githubRecord];
    });
    vi.mocked(listGitHubRepositoriesForTarget).mockImplementation(async ({ target }) => [
      target === 'private-org' ? 'octocat/private' : 'octocat/example',
    ]);
    const report = await createCombinedReport([
      { provider: 'azure-devops', organization: 'contoso', plans: ['all'] },
      { provider: 'github', targetType: 'organization', target: 'private-org', sinceDays: 90 },
      { provider: 'github', targetType: 'organization', target: 'octocat', sinceDays: 90 },
    ]);
    expect(visits).toEqual(['contoso', 'contoso', 'octocat/private', 'octocat/example']);
    expect(report.sourceStatuses?.map(({ status }) => status)).toEqual([
      'included',
      'skipped',
      'included',
    ]);
    expect(report.sourceStatuses?.[1]).toMatchObject({
      subject: 'private-org',
      committerCount: 0,
      reason: 'Minimum read permission not met',
      remediation: expect.stringContaining('read access'),
    });
    expect(report.executiveSummary).toEqual({
      requestedSources: 3,
      includedSources: 2,
      skippedSources: 1,
      azureIdentityRecords: 1,
      gitHubIdentityRecords: 1,
      uniqueProviderIdentities: 2,
    });
    expect(report.azureDevOpsCommitters).toEqual([azureRecord]);
    expect(report.gitHubCommitters).toEqual([
      {
        ...githubRecord,
        contributions: [
          {
            repository: githubRecord.repository,
            commitCount: githubRecord.commitCount,
            lastCommitAt: githubRecord.lastCommitAt,
          },
        ],
      },
    ]);
    expect(reportStore.get(report.reportId)).toBe(report);
  });

  it('keeps successful Azure plan results when another plan fails', async () => {
    vi.mocked(fetchAzureDevOpsEstimate).mockImplementation(async ({ plan }) => {
      if (plan === 'secretProtection') throw new Error('403 permission denied');
      return [azureRecord];
    });
    vi.mocked(fetchGitHubCommitters).mockResolvedValue([githubRecord]);
    const result = await collectSources([
      {
        provider: 'azure-devops',
        organization: 'contoso',
        plans: ['codeSecurity', 'secretProtection'],
      },
      { provider: 'github', targetType: 'organization', target: 'octocat', sinceDays: 90 },
    ]);
    expect(result.azureDevOpsCommitters).toEqual([azureRecord]);
    expect(result.insights.azureEstimates).toContainEqual(
      expect.objectContaining({ plan: 'secretProtection', status: 'unavailable' }),
    );
    expect(result.summary).toMatchObject({
      includedSources: 2,
      skippedSources: 0,
      azureIdentityRecords: 1,
      uniqueProviderIdentities: 2,
    });
  });

  it('reports empty but accessible sources as included', async () => {
    vi.mocked(fetchGitHubCommitters).mockResolvedValue([]);
    const result = await collectSources([
      { provider: 'github', targetType: 'organization', target: 'octocat', sinceDays: 90 },
    ]);
    expect(result.statuses[0]).toMatchObject({ status: 'included', committerCount: 0 });
    expect(result.summary).toMatchObject({
      includedSources: 1,
      skippedSources: 0,
      uniqueProviderIdentities: 0,
    });
  });

  it('gives provider-specific login guidance without calling upstream APIs when credentials fail', async () => {
    vi.mocked(acquireAzureDevOpsToken).mockRejectedValue(new Error('Authentication expired'));
    vi.mocked(acquireGitHubToken).mockRejectedValue(new Error('401 authentication required'));
    const statuses = await preflightSources([
      { provider: 'azure-devops', organization: 'contoso', plans: ['all'] },
      { provider: 'github', targetType: 'organization', target: 'octocat', sinceDays: 90 },
    ]);
    expect(statuses).toEqual([
      expect.objectContaining({
        status: 'skipped',
        reason: 'Authentication required',
        remediation: expect.stringContaining('Sign in with Microsoft'),
      }),
      expect.objectContaining({
        status: 'skipped',
        reason: 'Authentication required',
        remediation: expect.stringContaining('gh auth login'),
      }),
    ]);
    expect(fetchAzureDevOpsEstimate).not.toHaveBeenCalled();
    expect(listGitHubRepositoriesForTarget).not.toHaveBeenCalled();
  });
});
