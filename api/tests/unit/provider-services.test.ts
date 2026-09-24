import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  connectAzureDevOps,
  createAzureReport,
  discoverAzureDevOpsSources,
  summarizeAzureDevOps,
} from '../../src/services/azure-devops.js';
import {
  connectGitHub,
  createGitHubReport,
  discoverGitHubSources,
  summarizeGitHub,
  uniqueGitHubCommitters,
} from '../../src/services/github.js';
import type { AzureDevOpsCommitter, GitHubCommitter, SourceStatus } from '@ninjapaw/contracts';
import { reportStore } from '../../src/reports/report-store.js';
import { buildAzureDevOpsCostEstimates } from '../../src/reports/billing-estimates.js';
import { acquireAzureDevOpsToken, signInWithBrowser } from '../../src/auth/local-credential.js';
import { acquireGitHubToken } from '../../src/auth/github-cli.js';
import { fetchAzureDevOpsEstimate } from '../../src/adapters/azure-devops/estimate-client.js';
import {
  discoverGitHubTargets,
  fetchGitHubCommitters,
  getGitHubViewer,
  listGitHubRepositoriesForTarget,
} from '../../src/adapters/github/github-client.js';
import { discoverAzureDevOpsOrganizations } from '../../src/adapters/azure-devops/organizations-client.js';

vi.mock('../../src/auth/local-credential.js', () => ({
  acquireAzureDevOpsToken: vi.fn(),
  signInWithBrowser: vi.fn(),
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
vi.mock('../../src/auth/github-cli.js', () => ({ acquireGitHubToken: vi.fn() }));
vi.mock('../../src/adapters/azure-devops/estimate-client.js', () => ({
  fetchAzureDevOpsEstimate: vi.fn(),
}));
vi.mock('../../src/adapters/azure-devops/organizations-client.js', () => ({
  discoverAzureDevOpsOrganizations: vi.fn(),
}));
vi.mock('../../src/adapters/github/github-client.js', () => ({
  API_VERSION: '2022-11-28',
  getGitHubViewer: vi.fn(),
  discoverGitHubTargets: vi.fn(),
  listGitHubRepositoriesForTarget: vi.fn(),
  fetchGitHubCommitters: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(acquireAzureDevOpsToken).mockResolvedValue('azure-token');
  vi.mocked(acquireGitHubToken).mockResolvedValue('github-token');
  vi.mocked(fetchAzureDevOpsEstimate).mockResolvedValue([]);
  vi.mocked(fetchGitHubCommitters).mockResolvedValue([]);
  vi.mocked(listGitHubRepositoriesForTarget).mockResolvedValue(['octocat/example']);
});
afterEach(() => vi.restoreAllMocks());

describe('Azure DevOps report service', () => {
  it('connects and discovers organizations using only Azure credentials', async () => {
    const organizations = [{ id: 'org-1', name: 'contoso', url: 'https://dev.azure.com/contoso' }];
    vi.mocked(discoverAzureDevOpsOrganizations).mockResolvedValue(organizations);
    const selection = {
      id: 'test-attempt',
      status: 'authenticated' as const,
      account: { username: 'selected@example.test', tenantId: 'test-tenant' },
    };
    vi.mocked(signInWithBrowser).mockResolvedValue(selection);
    expect(await connectAzureDevOps()).toEqual(selection);
    expect(await discoverAzureDevOpsSources()).toEqual(organizations);
    expect(discoverAzureDevOpsOrganizations).toHaveBeenCalledWith('azure-token');
    expect(acquireGitHubToken).not.toHaveBeenCalled();
  });

  it('uses Azure credentials, each selected plan, and estimate metadata', async () => {
    const report = await createAzureReport({
      provider: 'azure-devops',
      organization: 'contoso',
      plans: ['codeSecurity', 'secretProtection'],
    });
    expect(fetchAzureDevOpsEstimate).toHaveBeenCalledTimes(2);
    for (const plan of ['codeSecurity', 'secretProtection']) {
      expect(fetchAzureDevOpsEstimate).toHaveBeenCalledWith({
        organization: 'contoso',
        plan,
        resultType: 'estimated',
        accessToken: 'azure-token',
      });
    }
    expect(acquireGitHubToken).not.toHaveBeenCalled();
    expect(report).toMatchObject({
      provider: 'azure-devops',
      subject: 'contoso',
      organization: 'contoso',
      plans: ['codeSecurity', 'secretProtection'],
      gitHubCommitters: [],
    });
    expect(reportStore.get(report.reportId)).toBe(report);
    expect(report.sourceStatuses?.[0]?.scope).toBe('Code Security, Secret Protection');
    expect(report.providerSummaries?.[0]).toMatchObject({
      provider: 'azure-devops',
      includedSources: 1,
      uniqueIdentities: 0,
      measurement: 'Advanced Security estimate',
    });
    expect(report.providerSummaries?.[0]).not.toHaveProperty('totalCommits');
  });
});

describe('GitHub report service', () => {
  it('does not merge different linked IDs sharing the same display name', () => {
    const record: GitHubCommitter = {
      provider: 'github',
      repository: 'example/repo',
      login: 'first',
      userId: '1',
      displayName: 'Alex Smith',
      commitCount: 2,
      lastCommitAt: '2026-09-23T10:00:00.000Z',
      collectedAt: '2026-09-23T10:00:00.000Z',
      sourceApiVersion: '2022-11-28',
    };
    const records = [
      record,
      { ...record, login: 'second', userId: '2' },
      { ...record, login: 'Alex Smith', userId: undefined },
    ];
    for (const input of [records, [...records].reverse()]) {
      const result = uniqueGitHubCommitters(input);
      expect(result).toHaveLength(3);
      expect(result.map((item) => item.commitCount)).toEqual([2, 2, 2]);
    }
  });
  it('deduplicates GitHub committers across repositories and excludes dependabot', () => {
    const first: GitHubCommitter = {
      provider: 'github',
      repository: 'octocat/alpha',
      userId: 'user-1',
      login: 'octocat',
      displayName: 'Octo Cat',
      profileUrl: 'https://github.com/octocat',
      commitCount: 2,
      lastCommitAt: '2026-09-21T10:00:00.000Z',
      collectedAt: '2026-09-23T10:00:00.000Z',
      sourceApiVersion: '2022-11-28',
    };
    expect(
      uniqueGitHubCommitters([
        first,
        {
          ...first,
          repository: 'octocat/zeta',
          commitCount: 3,
          lastCommitAt: '2026-09-23T10:00:00.000Z',
        },
        {
          ...first,
          repository: 'octocat/alpha',
          userId: '49699333',
          login: 'dependabot[bot]',
          displayName: 'dependabot[bot]',
          profileUrl: 'https://github.com/apps/dependabot',
          commitCount: 10,
        },
        {
          ...first,
          repository: 'octocat/alpha',
          userId: '41898282',
          login: 'github-actions[bot]',
          displayName: 'github-actions[bot]',
          profileUrl: 'https://github.com/apps/github-actions',
          commitCount: 20,
        },
      ]),
    ).toMatchObject([
      {
        login: 'octocat',
        repository: 'octocat/alpha, octocat/zeta',
        contributions: [
          { repository: 'octocat/alpha', commitCount: 2 },
          { repository: 'octocat/zeta', commitCount: 3 },
        ],
        commitCount: 5,
        lastCommitAt: '2026-09-23T10:00:00.000Z',
      },
    ]);
  });

  it('merges linked GitHub accounts with unlinked commit-author name variants', () => {
    const linked: GitHubCommitter = {
      provider: 'github',
      repository: 'ninjapaw/site',
      userId: '12345',
      login: 'billmcilhargey',
      displayName: 'Dr Bill McIlhargey',
      profileUrl: 'https://github.com/billmcilhargey',
      commitCount: 16,
      lastCommitAt: '2026-09-21T18:44:21.000Z',
      collectedAt: '2026-09-24T00:00:00.000Z',
      sourceApiVersion: '2022-11-28',
    };
    expect(
      uniqueGitHubCommitters([
        linked,
        {
          ...linked,
          repository: 'ninjapaw/sentinel-optimizer',
          userId: undefined,
          login: 'Bill McIlhargey',
          displayName: 'Bill McIlhargey',
          profileUrl: undefined,
          commitCount: 3,
          lastCommitAt: '2026-08-17T13:46:46.000Z',
        },
      ]),
    ).toMatchObject([
      {
        login: 'billmcilhargey',
        displayName: 'Dr Bill McIlhargey',
        profileUrl: 'https://github.com/billmcilhargey',
        repository: 'ninjapaw/sentinel-optimizer, ninjapaw/site',
        commitCount: 19,
        lastCommitAt: '2026-09-21T18:44:21.000Z',
      },
    ]);
  });

  it('connects and discovers organizations and enterprises using only GitHub credentials', async () => {
    const viewer = { id: 'viewer-1', login: 'octocat' };
    const sources = [
      {
        id: 'organization:1',
        name: 'octocat',
        targetType: 'organization' as const,
        url: 'https://github.com/octocat',
      },
    ];
    vi.mocked(getGitHubViewer).mockResolvedValue(viewer);
    vi.mocked(discoverGitHubTargets).mockResolvedValue(sources);
    expect(await connectGitHub()).toEqual({ authenticated: true, viewer });
    expect(await discoverGitHubSources()).toEqual(sources);
    expect(getGitHubViewer).toHaveBeenCalledWith('github-token');
    expect(discoverGitHubTargets).toHaveBeenCalledWith('github-token');
    expect(acquireAzureDevOpsToken).not.toHaveBeenCalled();
  });

  it('uses GitHub credentials and retains repository window metadata', async () => {
    const report = await createGitHubReport({
      provider: 'github',
      targetType: 'organization',
      target: 'octocat',
      sinceDays: 30,
    });
    expect(listGitHubRepositoriesForTarget).toHaveBeenCalledWith({
      provider: 'github',
      targetType: 'organization',
      target: 'octocat',
      sinceDays: 30,
      accessToken: 'github-token',
    });
    expect(fetchGitHubCommitters).toHaveBeenCalledWith({
      repository: 'octocat/example',
      sinceDays: 30,
      accessToken: 'github-token',
    });
    expect(acquireAzureDevOpsToken).not.toHaveBeenCalled();
    expect(report).toMatchObject({
      provider: 'github',
      subject: 'octocat',
      organization: 'octocat',
      plans: ['last-30-days'],
      sourceApiVersion: '2022-11-28',
      azureDevOpsCommitters: [],
    });
    expect(report.sourceStatuses?.[0]?.scope).toBe(
      'Organization repositories, default branch, last 30 days',
    );
    expect(reportStore.get(report.reportId)).toBe(report);
    expect(report.providerSummaries?.[0]).toMatchObject({
      provider: 'github',
      includedSources: 1,
      uniqueIdentities: 0,
      totalRepositories: 0,
      totalCommits: 0,
      measurement: 'Default-branch commit activity',
    });
    expect(report.costEstimates).toMatchObject([
      {
        label: 'GitHub Enterprise - observed-user scenario',
        count: 0,
        unitPriceUsd: 21,
        estimatedMonthlyCostUsd: 0,
      },
      {
        label: 'GitHub Code Security - what-if scenario',
        count: 0,
        unitPriceUsd: 30,
        estimatedMonthlyCostUsd: 0,
      },
      {
        label: 'GitHub Secret Protection - what-if scenario',
        count: 0,
        unitPriceUsd: 19,
        estimatedMonthlyCostUsd: 0,
      },
    ]);
  });

  it('propagates collection failure without storing a report', async () => {
    const save = vi.spyOn(reportStore, 'put');
    vi.mocked(fetchGitHubCommitters).mockRejectedValue(new Error('Repository not accessible'));
    await expect(
      createGitHubReport({
        provider: 'github',
        targetType: 'organization',
        target: 'octocat',
        sinceDays: 30,
      }),
    ).rejects.toThrow('Repository not accessible');
    expect(save).not.toHaveBeenCalled();
  });
});

describe('provider summaries', () => {
  it('prices Azure products independently and deduplicates only within each organization/product', () => {
    const record: AzureDevOpsCommitter = {
      provider: 'azure-devops',
      organization: 'example',
      plan: 'codeSecurity',
      resultType: 'estimated',
      identityId: '1',
      isEstimated: true,
      isLicensed: false,
      collectedAt: '2026-09-23T10:00:00.000Z',
      sourceApiVersion: '7.2-preview.3',
    };
    expect(buildAzureDevOpsCostEstimates([record, record])).toMatchObject([
      { count: 1, unitPriceUsd: 30, estimatedMonthlyCostUsd: 30 },
    ]);
    expect(
      buildAzureDevOpsCostEstimates([record, { ...record, plan: 'secretProtection' }], ['all']),
    ).toMatchObject([
      { count: 1, estimatedMonthlyCostUsd: 30 },
      { count: 1, estimatedMonthlyCostUsd: 19 },
    ]);
    expect(buildAzureDevOpsCostEstimates([], [])).toEqual([]);
  });
  it('uses comparable counts but keeps measurement types and skipped sources separate', () => {
    const statuses: SourceStatus[] = [
      { provider: 'azure-devops', subject: 'contoso', status: 'included', committerCount: 2 },
      { provider: 'github', subject: 'octocat/example', status: 'included', committerCount: 2 },
      { provider: 'github', subject: 'octocat/private', status: 'skipped', committerCount: 0 },
    ];
    const azure: AzureDevOpsCommitter = {
      provider: 'azure-devops',
      organization: 'contoso',
      plan: 'codeSecurity',
      resultType: 'estimated',
      identityId: 'user-1',
      isEstimated: true,
      isLicensed: false,
      collectedAt: '2026-09-23T10:00:00.000Z',
      sourceApiVersion: '7.2-preview.3',
    };
    const github: GitHubCommitter = {
      provider: 'github',
      repository: 'octocat/example',
      userId: 'user-1',
      login: 'octocat',
      commitCount: 3,
      lastCommitAt: azure.collectedAt,
      collectedAt: azure.collectedAt,
      sourceApiVersion: '2022-11-28',
    };
    const azureSummary = summarizeAzureDevOps(
      [azure, { ...azure, plan: 'secretProtection' }],
      statuses,
    );
    const githubSummary = summarizeGitHub(
      [github, { ...github, login: 'renamed', commitCount: 2 }],
      statuses,
    );
    expect(azureSummary).toMatchObject({
      identityRecords: 2,
      uniqueIdentities: 1,
      includedSources: 1,
      skippedSources: 0,
    });
    expect(azureSummary).not.toHaveProperty('totalCommits');
    expect(githubSummary).toMatchObject({
      identityRecords: 2,
      uniqueIdentities: 1,
      includedSources: 1,
      skippedSources: 1,
      totalRepositories: 1,
      totalCommits: 5,
    });
    expect(azureSummary.methodology).toContain('not licensed-user');
    expect(githubSummary.methodology).toContain('not Advanced Security billing');
  });
});
