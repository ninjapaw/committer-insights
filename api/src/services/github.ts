import {
  getGitHubContributions,
  emptyInsights,
  mergeDailyActivity,
  reportingWindow,
  type ReportInsights,
  type GitHubCommitter,
  type MultiSource,
  type SourceStatus,
} from '@ninjapaw/contracts';
import {
  API_VERSION,
  getGitHubViewer,
  discoverGitHubTargets,
  fetchGitHubCommitters,
  listGitHubRepositoriesForTarget,
} from '../adapters/github/github-client.js';
import {
  acquireGitHubToken,
  selectGitHubAccount,
  disconnectGitHubAccount,
} from '../auth/github-cli.js';
import { saveReport } from '../reports/report-store.js';
import { buildProviderSummary } from '../reports/provider-summary.js';
import { buildGitHubCostEstimates } from '../reports/billing-estimates.js';
import {
  fetchGitHubRepositoryInsight,
  collectGitHubBilling,
  gitHubSecurityFeatures,
} from '../adapters/github/insights-client.js';

type GitHubSource = Extract<MultiSource, { provider: 'github' }>;
const GITHUB_REPOSITORY_COLLECTION_CONCURRENCY = 4;
const EXCLUDED_GITHUB_LOGINS = new Set(['dependabot[bot]', 'github-actions[bot]']);

function isExcludedGitHubCommitter(committer: GitHubCommitter): boolean {
  return EXCLUDED_GITHUB_LOGINS.has(committer.login.toLowerCase());
}

function combineRepositories(left: string, right: string): string {
  return Array.from(new Set([...left.split(', '), ...right.split(', ')]))
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
  const contributions = new Map(
    getGitHubContributions(existing).map((item) => [item.repository, { ...item }]),
  );
  for (const item of getGitHubContributions(committer)) {
    const previous = contributions.get(item.repository);
    contributions.set(
      item.repository,
      previous
        ? {
            ...item,
            commitCount: previous.commitCount + item.commitCount,
            dailyActivity:
              previous.dailyActivity && item.dailyActivity
                ? mergeDailyActivity(previous.dailyActivity, item.dailyActivity)
                : undefined,
            lastCommitAt:
              previous.lastCommitAt > item.lastCommitAt ? previous.lastCommitAt : item.lastCommitAt,
          }
        : { ...item },
    );
  }
  return {
    ...existing,
    userId: preferred.userId ?? existing.userId,
    login: preferred.login,
    displayName: preferred.displayName ?? existing.displayName,
    profileUrl: preferred.profileUrl ?? existing.profileUrl,
    repository: combineRepositories(existing.repository, committer.repository),
    contributions: [...contributions.values()].sort((left, right) =>
      left.repository.localeCompare(right.repository),
    ),
    commitCount: existing.commitCount + committer.commitCount,
    dailyActivity:
      existing.dailyActivity && committer.dailyActivity
        ? mergeDailyActivity(existing.dailyActivity, committer.dailyActivity)
        : undefined,
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
  const aliases = new Map<string, Set<string>>();
  for (const committer of committers) {
    if (!committer.userId || isExcludedGitHubCommitter(committer)) continue;
    for (const alias of githubIdentityAliases(committer)) {
      const identities = aliases.get(alias) ?? new Set<string>();
      identities.add(`id:${committer.userId}`);
      aliases.set(alias, identities);
    }
  }
  for (const committer of committers) {
    if (isExcludedGitHubCommitter(committer)) continue;
    const committerAliases = githubIdentityAliases(committer);
    const candidates = new Set(
      committerAliases.flatMap((alias) => [...(aliases.get(alias) ?? [])]),
    );
    const key = committer.userId
      ? `id:${committer.userId}`
      : candidates.size === 1
        ? [...candidates][0]!
        : `unlinked:${committer.login.toLowerCase()}`;
    const existing = rows.get(key);
    if (!existing) {
      rows.set(key, {
        ...committer,
        contributions: getGitHubContributions(committer).map((item) => ({ ...item })),
      });
      continue;
    }
    rows.set(key, mergeGitHubCommitters(existing, committer));
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

export async function connectGitHub(login?: string) {
  selectGitHubAccount();
  try {
    const viewer = await getGitHubViewer(await acquireGitHubToken(login));
    if (login && viewer.login.toLowerCase() !== login.toLowerCase()) {
      throw new Error(
        'GitHub returned a different account. Refresh the account list and try again.',
      );
    }
    selectGitHubAccount(viewer.login);
    return { authenticated: true, viewer };
  } catch (error) {
    disconnectGitHubAccount();
    throw error;
  }
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
          'Default-branch authored-date activity, not Advanced Security billing estimates. Dependabot and GitHub Actions bots are excluded. Linked accounts use stable IDs; unlinked names may be matched heuristically to a single linked identity and require review. Repository counts cover observed activity, not the full inventory. Commits are counted per repository; overlapping sources can repeat activity.',
      },
      committers.map(githubIdentityKey),
      statuses,
    ),
    totalRepositories: countGitHubRepositories(committers),
    totalCommits: committers.reduce((total, committer) => total + committer.commitCount, 0),
  };
}

export async function createGitHubReport(source: GitHubSource) {
  const insights = emptyInsights();
  const gitHubCommitters = await collectGitHub(source, insights);
  const sourceStatuses: SourceStatus[] = [
    {
      provider: source.provider,
      subject: source.target,
      scope: githubSourceScope(source),
      status: 'included',
      committerCount: gitHubCommitters.length,
    },
  ];
  const providerSummary = summarizeGitHub(gitHubCommitters, sourceStatuses);
  return saveReport({
    provider: source.provider,
    subject: source.target,
    organization: source.target,
    plans: [`last-${source.sinceDays}-days`],
    sourceApiVersion: API_VERSION,
    azureDevOpsCommitters: [],
    gitHubCommitters,
    insights,
    sourceStatuses,
    providerSummaries: [providerSummary],
    costEstimates: buildGitHubCostEstimates(gitHubCommitters, providerSummary),
    warnings: [
      'GitHub counts include commits on the repository default branch in the selected window.',
    ],
  });
}

export async function collectGitHub(
  source: GitHubSource,
  insights?: ReportInsights,
): Promise<GitHubCommitter[]> {
  const branchScope = source.branchScope ?? 'all';
  const accessToken = await acquireGitHubToken();
  if (insights) await collectGitHubBilling(source, accessToken, insights);
  const hasBilling = insights?.githubBilling?.some(
    (item) => item.source === source.target && item.status !== 'unavailable',
  );
  let repositories: string[];
  try {
    repositories = await listGitHubRepositoriesForTarget({ ...source, accessToken });
    if (repositories.length === 0) throw new Error('GitHub source has no accessible repositories.');
  } catch (error) {
    if (!insights || !hasBilling) throw error;
    insights.checks.push({
      provider: 'github',
      source: source.target,
      dataset: 'Repository activity',
      status: 'unavailable',
      detail:
        'Billing evidence collected, but repository inventory is unavailable. Activity estimates omitted; missing data is not zero.',
    });
    return [];
  }
  const committers: GitHubCommitter[] = [];
  let successfulReads = 0;
  let collectionError: unknown;
  let nextRepository = 0;
  const workerCount = Math.min(GITHUB_REPOSITORY_COLLECTION_CONCURRENCY, repositories.length);
  await Promise.all(
    Array.from({ length: workerCount }, async () => {
      for (;;) {
        const repository = repositories[nextRepository];
        nextRepository += 1;
        if (!repository) return;
        let repositoryInsight;
        if (insights) {
          try {
            repositoryInsight = await fetchGitHubRepositoryInsight(
              repository,
              source.target,
              source.sinceDays,
              accessToken,
            );
            if (repositoryInsight) successfulReads += 1;
          } catch {
            insights.checks.push({
              provider: 'github',
              source: repository,
              dataset: 'Security settings',
              status: 'unavailable',
              detail: 'Repository metadata could not be read. Enablement remains unknown.',
            });
          }
        }
        try {
          const rows = await fetchGitHubCommitters({
            repository,
            sinceDays: source.sinceDays,
            accessToken,
            branchScope,
            onCoverage: ({ branches, truncated }) => {
              if (insights && truncated) {
                insights.checks.push({
                  provider: 'github',
                  source: repository,
                  dataset: 'Repository activity coverage',
                  status: 'partial',
                  detail: `Activity covered ${branches.length} branch${branches.length === 1 ? '' : 'es'} but reached the GitHub 10,000-commit pagination limit on at least one branch. Counts are lower bounds for the affected repository.`,
                });
              }
            },
          });
          committers.push(...rows);
          successfulReads += 1;
          if (insights) {
            const activity = {
              ...reportingWindow(source.sinceDays),
              status: 'complete' as const,
              branches: branchScope === 'all' ? undefined : ['default'],
              daily: mergeDailyActivity(
                ...rows
                  .filter((row) => !isExcludedGitHubCommitter(row))
                  .map((row) => row.dailyActivity),
              ),
            };
            insights.repositories.push(
              repositoryInsight
                ? { ...repositoryInsight, activity }
                : {
                    provider: 'github',
                    source: source.target,
                    id: repository.toLowerCase(),
                    name: repository,
                    visibility: 'unknown',
                    state: 'unknown',
                    features: Object.values(gitHubSecurityFeatures).map((name) => ({
                      name,
                      state: 'unknown',
                    })),
                    observedAt: new Date().toISOString(),
                    activity,
                  },
            );
          }
        } catch (error) {
          collectionError = error;
          if (!insights)
            throw new Error(`GitHub history could not be collected for ${repository}.`);
          insights.repositories.push({
            ...(repositoryInsight ?? {
              provider: 'github' as const,
              source: source.target,
              id: repository.toLowerCase(),
              name: repository,
              visibility: 'unknown',
              state: 'unknown' as const,
              features: Object.values(gitHubSecurityFeatures).map((name) => ({
                name,
                state: 'unknown' as const,
              })),
              observedAt: new Date().toISOString(),
            }),
            activity: {
              ...reportingWindow(source.sinceDays),
              status: 'unavailable',
              daily: [],
              reason:
                'History unavailable: denied read, empty repository, provider failure or 10,000 commit cap. Not zero activity.',
            },
          });
        }
      }
    }),
  );
  if (successfulReads === 0 && !hasBilling)
    throw collectionError ?? new Error('No GitHub repository data could be read.');
  if (insights) {
    insights.checks.push({
      provider: 'github',
      source: source.target,
      dataset: 'Repository activity',
      status: insights.repositories.some(
        (row) =>
          row.provider === 'github' &&
          row.source === source.target &&
          row.activity.status !== 'complete',
      )
        ? 'partial'
        : 'complete',
      detail: `Visible repositories only. ${branchScope === 'all' ? 'All discovered branches are scanned and commits are deduplicated by SHA.' : 'Default-branch authored-date activity is selected.'} Dependabot and GitHub Actions bots are excluded. Missing history is not zero activity.`,
    });
    insights.checks.push({
      provider: 'github',
      source: source.target,
      dataset: 'Security settings',
      status: insights.repositories.some(
        (row) =>
          row.provider === 'github' &&
          row.source === source.target &&
          row.features.some((feature) => feature.state === 'unknown'),
      )
        ? 'partial'
        : 'complete',
      detail:
        'Missing security fields are unknown; GitHub may require an existing security-manager, owner or repository-admin role to expose them. No role changes are requested. Secret scanning enablement does not by itself prove a paid Secret Protection subscription.',
    });
  }
  return uniqueGitHubCommitters(committers);
}

export async function preflightGitHub(source: GitHubSource): Promise<void> {
  const accessToken = await acquireGitHubToken();
  try {
    const repositories = await listGitHubRepositoriesForTarget({ ...source, accessToken });
    if (repositories.length === 0) throw new Error('GitHub source has no accessible repositories.');
  } catch (error) {
    if (!source.includeBilling) throw error;
    const insights = emptyInsights();
    await collectGitHubBilling(source, accessToken, insights);
    if (!insights.githubBilling?.some((item) => item.status !== 'unavailable')) throw error;
  }
}

export function githubIdentityKey(committer: GitHubCommitter): string {
  return `github:${committer.userId ?? committer.login.toLowerCase()}`;
}

export function githubRemediation(authentication: boolean): string {
  return authentication
    ? 'Run "gh auth login --hostname github.com", then reconnect.'
    : 'Grant the active GitHub CLI account read access to the organization or enterprise repositories and authorize SAML/SSO if required.';
}
