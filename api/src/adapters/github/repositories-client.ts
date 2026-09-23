import { gitHubRepositoriesResponseSchema } from '@ninjapaw/contracts';
import { API_ORIGIN, MAX_PAGES, nextPage, request } from './http-client.js';

export async function discoverGitHubRepositories(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Array<{ id: string; name: string; url: string; private: boolean }>> {
  const repositories = [];
  let url: URL | undefined = new URL(
    '/user/repos?affiliation=owner,collaborator,organization_member&sort=full_name&per_page=100',
    API_ORIGIN,
  );
  for (let page = 0; url && page < MAX_PAGES; page += 1) {
    const response = await request(url, token, fetchImpl);
    const parsed = gitHubRepositoriesResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error('GitHub returned an unexpected repository response.');
    repositories.push(
      ...parsed.data.map((repository) => ({
        id: String(repository.id),
        name: repository.full_name,
        url: repository.html_url,
        private: repository.private,
      })),
    );
    url = nextPage(response);
  }
  if (url) throw new Error('GitHub repository discovery exceeded the 10,000 repository cap.');
  return repositories.sort((left, right) => left.name.localeCompare(right.name));
}
