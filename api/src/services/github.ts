import type { GitHubCommitter, MultiSource, SourceStatus } from '@ninjapaw/contracts';
import {
  API_VERSION,
  getGitHubViewer,
  discoverGitHubRepositories,
  fetchGitHubCommitters,
  preflightGitHubRepository,
} from '../adapters/github/github-client.js';
import { acquireGitHubToken } from '../auth/github-cli.js';
import { saveReport } from '../reports/report-store.js';
import { buildProviderSummary } from '../reports/provider-summary.js';

type GitHubSource = Extract<MultiSource, { provider: 'github' }>;

export function githubSourceScope(source: GitHubSource): string {
  return `Default branch, last ${source.sinceDays} days`;
}

export async function connectGitHub() {
  const viewer = await getGitHubViewer(await acquireGitHubToken());
  return { authenticated: true, viewer };
}

export async function discoverGitHubSources() {
  return discoverGitHubRepositories(await acquireGitHubToken());
}

export function summarizeGitHub(committers: GitHubCommitter[], statuses: SourceStatus[]) {
  return {
    ...buildProviderSummary(
      {
        provider: 'github',
        displayName: 'GitHub',
        sourceLabel: 'Repositories',
        measurement: 'Default-branch commit activity',
        apiVersion: API_VERSION,
        methodology:
          'Default-branch commits within each selected date window, not Advanced Security billing estimates. Unlinked authors use their reported names; shared commits across repositories are counted per repository.',
      },
      committers.map(githubIdentityKey),
      statuses,
    ),
    totalCommits: committers.reduce((total, committer) => total + committer.commitCount, 0),
  };
}

export async function createGitHubReport(source: GitHubSource) {
  const gitHubCommitters = await collectGitHub(source);
  const sourceStatuses: SourceStatus[] = [
    {
      provider: source.provider,
      subject: source.repository,
      scope: githubSourceScope(source),
      status: 'included',
      committerCount: gitHubCommitters.length,
    },
  ];
  return saveReport({
    provider: source.provider,
    subject: source.repository,
    organization: source.repository.split('/')[0]!,
    plans: [`last-${source.sinceDays}-days`],
    sourceApiVersion: API_VERSION,
    azureDevOpsCommitters: [],
    gitHubCommitters,
    sourceStatuses,
    providerSummaries: [summarizeGitHub(gitHubCommitters, sourceStatuses)],
    warnings: [
      'GitHub counts include commits on the repository default branch in the selected window.',
    ],
  });
}

export async function collectGitHub(source: GitHubSource): Promise<GitHubCommitter[]> {
  const accessToken = await acquireGitHubToken();
  return fetchGitHubCommitters({ ...source, accessToken });
}

export async function preflightGitHub(source: GitHubSource): Promise<void> {
  const accessToken = await acquireGitHubToken();
  await preflightGitHubRepository(source.repository, accessToken);
}

export function githubIdentityKey(committer: GitHubCommitter): string {
  return `github:${committer.userId ?? committer.login.toLowerCase()}`;
}

export function githubRemediation(authentication: boolean): string {
  return authentication
    ? 'Run "gh auth login --hostname github.com", then reconnect.'
    : 'Grant the active GitHub CLI account read access to the repository and authorize organization SAML/SSO if required.';
}
