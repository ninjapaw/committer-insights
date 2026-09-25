import {
  gitHubCommitterSchema,
  gitHubCommitsResponseSchema,
  gitHubRepositorySchema,
  reportingWindow,
  type GitHubCommitter,
} from '@ninjapaw/contracts';
import { API_ORIGIN, API_VERSION, MAX_PAGES, nextPage, request } from './http-client.js';

type BranchScope = 'all' | 'default';

async function listBranches(
  repository: string,
  token: string,
  fetchImpl: typeof fetch,
): Promise<string[]> {
  const branches: string[] = [];
  let url: URL | undefined = new URL(`/repos/${repository}/branches?per_page=100`, API_ORIGIN);
  for (let page = 0; url && page < MAX_PAGES; page += 1) {
    const response = await request(url, token, fetchImpl);
    const body = await response.json();
    if (!Array.isArray(body) || body.some((item) => typeof item?.name !== 'string'))
      throw new Error('GitHub returned an unexpected branch response.');
    branches.push(...body.map((item) => item.name as string));
    url = nextPage(response);
  }
  if (url) throw new Error('GitHub branch discovery exceeded the supported page limit.');
  return branches;
}

export async function fetchGitHubCommitters(
  input: {
    repository: string;
    sinceDays: number;
    accessToken: string;
    branchScope?: BranchScope;
    onCoverage?: (coverage: { branches: string[]; truncated: boolean }) => void;
  },
  fetchImpl: typeof fetch = fetch,
): Promise<GitHubCommitter[]> {
  const repository = gitHubRepositorySchema.parse(input.repository);
  const window = reportingWindow(input.sinceDays);
  const aggregated = new Map<
    string,
    {
      userId?: string;
      login: string;
      displayName?: string;
      profileUrl?: string;
      count: number;
      lastCommitAt: string;
      activity: Map<string, number>;
    }
  >();
  const branches =
    input.branchScope === 'all' ? await listBranches(repository, input.accessToken, fetchImpl) : [];
  const selectedBranches = branches.length ? branches : ['default'];
  const seenCommits = new Set<string>();
  let truncated = false;
  for (const branch of selectedBranches) {
    let url: URL | undefined = new URL(
      `/repos/${repository}/commits?since=${encodeURIComponent(window.from)}&until=${encodeURIComponent(window.to)}&per_page=100`,
      API_ORIGIN,
    );
    if (branch !== 'default') url.searchParams.set('sha', branch);
    for (let page = 0; url && page < MAX_PAGES; page += 1) {
      const response = await request(url, input.accessToken, fetchImpl);
      const parsed = gitHubCommitsResponseSchema.safeParse(await response.json());
      if (!parsed.success) throw new Error('GitHub returned an unexpected commits response.');
      for (const item of parsed.data) {
        if (item.sha && seenCommits.has(item.sha)) continue;
        if (item.sha) seenCommits.add(item.sha);
        const authoredAt = item.commit.author?.date;
        const displayName = item.commit.author?.name ?? item.author?.login ?? 'Unknown author';
        if (!authoredAt)
          throw new Error('GitHub commit date is missing; activity coverage is incomplete.');
        const timestamp = new Date(authoredAt).toISOString();
        if (timestamp < window.from || timestamp > window.to) continue;
        const login = item.author?.login ?? displayName;
        const key = login.toLowerCase();
        const current = aggregated.get(key);
        const activity = current?.activity ?? new Map<string, number>();
        const date = new Date(authoredAt).toISOString().slice(0, 10);
        activity.set(date, (activity.get(date) ?? 0) + 1);
        aggregated.set(key, {
          ...(item.author?.id ? { userId: String(item.author.id) } : {}),
          login,
          displayName,
          ...(item.author?.html_url ? { profileUrl: item.author.html_url } : {}),
          count: (current?.count ?? 0) + 1,
          activity,
          lastCommitAt:
            !current || authoredAt > current.lastCommitAt ? authoredAt : current.lastCommitAt,
        });
      }
      url = nextPage(response);
    }
    if (url) truncated = true;
  }
  input.onCoverage?.({ branches: selectedBranches, truncated });

  const collectedAt = new Date().toISOString();
  return [...aggregated.values()]
    .map((committer) =>
      gitHubCommitterSchema.parse({
        provider: 'github',
        repository,
        userId: committer.userId,
        login: committer.login,
        displayName: committer.displayName,
        profileUrl: committer.profileUrl,
        commitCount: committer.count,
        lastCommitAt: committer.lastCommitAt,
        collectedAt,
        sourceApiVersion: API_VERSION,
        dailyActivity: [...committer.activity]
          .sort(([left], [right]) => left.localeCompare(right))
          .map(([date, commits]) => ({ date, commits })),
      }),
    )
    .sort(
      (left, right) =>
        right.commitCount - left.commitCount || left.login.localeCompare(right.login),
    );
}
