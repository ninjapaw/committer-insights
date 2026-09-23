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
} from '../../src/services/github.js';
import type { AzureDevOpsCommitter, GitHubCommitter, SourceStatus } from '@ninjapaw/contracts';
import { reportStore } from '../../src/reports/report-store.js';
import { acquireAzureDevOpsToken } from '../../src/auth/local-credential.js';
import { acquireGitHubToken } from '../../src/auth/github-cli.js';
import { fetchAzureDevOpsEstimate } from '../../src/adapters/azure-devops/estimate-client.js';
import {
  discoverGitHubRepositories,
  fetchGitHubCommitters,
  getGitHubViewer,
} from '../../src/adapters/github/github-client.js';
import { discoverAzureDevOpsOrganizations } from '../../src/adapters/azure-devops/organizations-client.js';

vi.mock('../../src/auth/local-credential.js', () => ({ acquireAzureDevOpsToken: vi.fn() }));
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
  discoverGitHubRepositories: vi.fn(),
  fetchGitHubCommitters: vi.fn(),
  preflightGitHubRepository: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(acquireAzureDevOpsToken).mockResolvedValue('azure-token');
  vi.mocked(acquireGitHubToken).mockResolvedValue('github-token');
  vi.mocked(fetchAzureDevOpsEstimate).mockResolvedValue([]);
  vi.mocked(fetchGitHubCommitters).mockResolvedValue([]);
});
afterEach(() => vi.restoreAllMocks());

describe('Azure DevOps report service', () => {
  it('connects and discovers organizations using only Azure credentials', async () => {
    const organizations = [{ id: 'org-1', name: 'contoso', url: 'https://dev.azure.com/contoso' }];
    vi.mocked(discoverAzureDevOpsOrganizations).mockResolvedValue(organizations);
    expect(await connectAzureDevOps()).toEqual({ authenticated: true });
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
  it('connects and discovers repositories using only GitHub credentials', async () => {
    const viewer = { id: 'viewer-1', login: 'octocat' };
    const repositories = [
      {
        id: 'repo-1',
        name: 'octocat/example',
        url: 'https://github.com/octocat/example',
        private: false,
      },
    ];
    vi.mocked(getGitHubViewer).mockResolvedValue(viewer);
    vi.mocked(discoverGitHubRepositories).mockResolvedValue(repositories);
    expect(await connectGitHub()).toEqual({ authenticated: true, viewer });
    expect(await discoverGitHubSources()).toEqual(repositories);
    expect(getGitHubViewer).toHaveBeenCalledWith('github-token');
    expect(discoverGitHubRepositories).toHaveBeenCalledWith('github-token');
    expect(acquireAzureDevOpsToken).not.toHaveBeenCalled();
  });

  it('uses GitHub credentials and retains repository window metadata', async () => {
    const report = await createGitHubReport({
      provider: 'github',
      repository: 'octocat/example',
      sinceDays: 30,
    });
    expect(fetchGitHubCommitters).toHaveBeenCalledWith({
      provider: 'github',
      repository: 'octocat/example',
      sinceDays: 30,
      accessToken: 'github-token',
    });
    expect(acquireAzureDevOpsToken).not.toHaveBeenCalled();
    expect(report).toMatchObject({
      provider: 'github',
      subject: 'octocat/example',
      organization: 'octocat',
      plans: ['last-30-days'],
      sourceApiVersion: '2022-11-28',
      azureDevOpsCommitters: [],
    });
    expect(report.sourceStatuses?.[0]?.scope).toBe('Default branch, last 30 days');
    expect(reportStore.get(report.reportId)).toBe(report);
    expect(report.providerSummaries?.[0]).toMatchObject({
      provider: 'github',
      includedSources: 1,
      uniqueIdentities: 0,
      totalCommits: 0,
      measurement: 'Default-branch commit activity',
    });
  });

  it('propagates collection failure without storing a report', async () => {
    const save = vi.spyOn(reportStore, 'put');
    vi.mocked(fetchGitHubCommitters).mockRejectedValue(new Error('Repository not accessible'));
    await expect(
      createGitHubReport({ provider: 'github', repository: 'octocat/private', sinceDays: 30 }),
    ).rejects.toThrow('Repository not accessible');
    expect(save).not.toHaveBeenCalled();
  });
});

describe('provider summaries', () => {
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
      totalCommits: 5,
    });
    expect(azureSummary.methodology).toContain('not licensed-user');
    expect(githubSummary.methodology).toContain('not Advanced Security billing');
  });
});
