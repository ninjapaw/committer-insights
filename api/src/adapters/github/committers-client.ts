import {
  gitHubCommitterSchema,
  gitHubCommitsResponseSchema,
  gitHubRepositorySchema,
  type GitHubCommitter,
} from '@ninjapaw/contracts';
import { API_ORIGIN, API_VERSION, MAX_PAGES, nextPage, request } from './http-client.js';

export async function preflightGitHubRepository(
  repositoryInput: string,
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const repository = gitHubRepositorySchema.parse(repositoryInput);
  await request(
    new URL(`/repos/${repository}/commits?per_page=1`, API_ORIGIN),
    accessToken,
    fetchImpl,
  );
  return repository;
}

export async function fetchGitHubCommitters(
  input: { repository: string; sinceDays: number; accessToken: string },
  fetchImpl: typeof fetch = fetch,
): Promise<GitHubCommitter[]> {
  const repository = gitHubRepositorySchema.parse(input.repository);
  const since = new Date(Date.now() - input.sinceDays * 24 * 60 * 60 * 1000).toISOString();
  const aggregated = new Map<
    string,
    {
      userId?: string;
      login: string;
      displayName?: string;
      profileUrl?: string;
      count: number;
      lastCommitAt: string;
    }
  >();
  let url: URL | undefined = new URL(
    `/repos/${repository}/commits?since=${encodeURIComponent(since)}&per_page=100`,
    API_ORIGIN,
  );

  for (let page = 0; url && page < MAX_PAGES; page += 1) {
    const response = await request(url, input.accessToken, fetchImpl);
    const parsed = gitHubCommitsResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error('GitHub returned an unexpected commits response.');
    for (const item of parsed.data) {
      const authoredAt = item.commit.author?.date;
      const displayName = item.commit.author?.name;
      if (!authoredAt || !displayName) continue;
      const login = item.author?.login ?? displayName;
      const key = login.toLowerCase();
      const current = aggregated.get(key);
      aggregated.set(key, {
        ...(item.author?.id ? { userId: String(item.author.id) } : {}),
        login,
        displayName,
        ...(item.author?.html_url ? { profileUrl: item.author.html_url } : {}),
        count: (current?.count ?? 0) + 1,
        lastCommitAt:
          !current || authoredAt > current.lastCommitAt ? authoredAt : current.lastCommitAt,
      });
    }
    url = nextPage(response);
  }
  if (url) throw new Error('GitHub commit collection exceeded the 10,000 commit cap.');

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
      }),
    )
    .sort(
      (left, right) =>
        right.commitCount - left.commitCount || left.login.localeCompare(right.login),
    );
}
