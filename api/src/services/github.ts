import type { GitHubCommitter, MultiSource, SourceStatus } from '@ninjapaw/contracts';
import {
  API_VERSION,
  getGitHubViewer,
  discoverGitHubTargets,
  fetchGitHubCommitters,
  listGitHubRepositoriesForTarget,
} from '../adapters/github/github-client.js';
import { acquireGitHubToken } from '../auth/github-cli.js';
import { saveReport } from '../reports/report-store.js';
import { buildProviderSummary } from '../reports/provider-summary.js';
import { buildGitHubCostEstimates } from '../reports/billing-estimates.js';

type GitHubSource = Extract<MultiSource, { provider: 'github' }>;
const GITHUB_REPOSITORY_COLLECTION_CONCURRENCY = 4;

function isExcludedGitHubCommitter(committer: GitHubCommitter): boolean {
  return new Set(['dependabot[bot]', 'github-actions[bot]']).has(committer.login.toLowerCase());
}

function combineRepositories(left: string, right: string): string {
  return Array.from(new Set([...left.split(', '), right]))
    .sort()
    .join(', ');
}

function normalizeGitHubPerson(value: string | undefined): string | undefined {
  const normalized = value
    ?.toLowerCase()
    .replace(/\b(dr|mr|mrs|ms|miss|prof)\b\.?/g, '')
    .replace(/\[bot\]$/g, '')
    .replace(/[^a-z0-9]/g, '');
  return normalized || undefined;
}

function githubIdentityAliases(committer: GitHubCommitter): string[] {
  return [
    committer.userId ? `id:${committer.userId}` : undefined,
    normalizeGitHubPerson(committer.login),
    normalizeGitHubPerson(committer.displayName),
  ].filter((value): value is string => Boolean(value));
}

function mergeGitHubCommitters(
  existing: GitHubCommitter,
  committer: GitHubCommitter,
): GitHubCommitter {
  const preferred = existing.userId || existing.profileUrl ? existing : committer;
  return {
    ...existing,
    userId: preferred.userId ?? existing.userId,
    login: preferred.login,
    displayName: preferred.displayName ?? existing.displayName,
    profileUrl: preferred.profileUrl ?? existing.profileUrl,
    repository: combineRepositories(existing.repository, committer.repository),
    commitCount: existing.commitCount + committer.commitCount,
    lastCommitAt:
      committer.lastCommitAt > existing.lastCommitAt
        ? committer.lastCommitAt
        : existing.lastCommitAt,
    collectedAt:
      committer.collectedAt > existing.collectedAt ? committer.collectedAt : existing.collectedAt,
  };
}

function countGitHubRepositories(committers: GitHubCommitter[]): number {
  return new Set(committers.flatMap((committer) => committer.repository.split(', '))).size;
}

export function uniqueGitHubCommitters(committers: GitHubCommitter[]): GitHubCommitter[] {
  const rows = new Map<string, GitHubCommitter>();
  const aliases = new Map<string, string>();
  for (const committer of committers) {
    if (isExcludedGitHubCommitter(committer)) continue;
    const committerAliases = githubIdentityAliases(committer);
    const key =
      committerAliases.map((alias) => aliases.get(alias)).find(Boolean) ??
      (committer.userId
        ? `id:${committer.userId}`
        : `name:${committerAliases[0] ?? committer.login}`);
    const existing = rows.get(key);
    if (!existing) {
      rows.set(key, { ...committer });
      for (const alias of committerAliases) aliases.set(alias, key);
      continue;
    }
    rows.set(key, mergeGitHubCommitters(existing, committer));
    for (const alias of committerAliases) aliases.set(alias, key);
  }
  return Array.from(rows.values()).sort(
    (left, right) => right.commitCount - left.commitCount || left.login.localeCompare(right.login),
  );
}

export function githubSourceScope(source: GitHubSource): string {
  const target =
    source.targetType === 'enterprise' ? 'Enterprise repositories' : 'Organization repositories';
  return `${target}, default branch, last ${source.sinceDays} days`;
}

export async function connectGitHub() {
  const viewer = await getGitHubViewer(await acquireGitHubToken());
  return { authenticated: true, viewer };
}

export async function discoverGitHubSources() {
  return discoverGitHubTargets(await acquireGitHubToken());
}

export function summarizeGitHub(committers: GitHubCommitter[], statuses: SourceStatus[]) {
  return {
    ...buildProviderSummary(
      {
        provider: 'github',
        displayName: 'GitHub',
        sourceLabel: 'Organizations and enterprises',
        measurement: 'Default-branch commit activity',
        apiVersion: API_VERSION,
        methodology:
          'Default-branch commits across repositories visible within each selected GitHub organization or enterprise and date window, not Advanced Security billing estimates. Unlinked authors use their reported names; shared commits across repositories are counted per repository.',
      },
      committers.map(githubIdentityKey),
      statuses,
    ),
    totalRepositories: countGitHubRepositories(committers),
    totalCommits: committers.reduce((total, committer) => total + committer.commitCount, 0),
  };
}

export async function createGitHubReport(source: GitHubSource) {
  const gitHubCommitters = await collectGitHub(source);
  const providerSummary = summarizeGitHub(gitHubCommitters, []);
  const sourceStatuses: SourceStatus[] = [
    {
      provider: source.provider,
      subject: source.target,
      scope: githubSourceScope(source),
      status: 'included',
      committerCount: gitHubCommitters.length,
    },
  ];
  return saveReport({
    provider: source.provider,
    subject: source.target,
    organization: source.target,
    plans: [`last-${source.sinceDays}-days`],
    sourceApiVersion: API_VERSION,
    azureDevOpsCommitters: [],
    gitHubCommitters,
    sourceStatuses,
    providerSummaries: [summarizeGitHub(gitHubCommitters, sourceStatuses)],
    costEstimates: buildGitHubCostEstimates(gitHubCommitters, providerSummary),
    warnings: [
      'GitHub counts include commits on the repository default branch in the selected window.',
    ],
  });
}

export async function collectGitHub(source: GitHubSource): Promise<GitHubCommitter[]> {
  const accessToken = await acquireGitHubToken();
  const repositories = await listGitHubRepositoriesForTarget({ ...source, accessToken });
  if (repositories.length === 0) throw new Error('GitHub source has no accessible repositories.');
  const committers: GitHubCommitter[] = [];
  let nextRepository = 0;
  const workerCount = Math.min(GITHUB_REPOSITORY_COLLECTION_CONCURRENCY, repositories.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      for (;;) {
        const repository = repositories[nextRepository];
        nextRepository += 1;
        if (!repository) return;
        committers.push(
          ...(await fetchGitHubCommitters({
            repository,
            sinceDays: source.sinceDays,
            accessToken,
          })),
        );
      }
    }),
  );
  return uniqueGitHubCommitters(committers);
}

export async function preflightGitHub(source: GitHubSource): Promise<void> {
  const accessToken = await acquireGitHubToken();
  const repositories = await listGitHubRepositoriesForTarget({ ...source, accessToken });
  if (repositories.length === 0) throw new Error('GitHub source has no accessible repositories.');
}

export function githubIdentityKey(committer: GitHubCommitter): string {
  return `github:${committer.userId ?? committer.login.toLowerCase()}`;
}

export function githubRemediation(authentication: boolean): string {
  return authentication
    ? 'Run "gh auth login --hostname github.com", then reconnect.'
    : 'Grant the active GitHub CLI account read access to the organization or enterprise repositories and authorize SAML/SSO if required.';
}
