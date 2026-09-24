import {
  gitHubEnterpriseResponseSchema,
  gitHubOrganizationResponseSchema,
  gitHubRepositoriesResponseSchema,
  gitHubTargetSchema,
  type GitHubTargetType,
} from '@ninjapaw/contracts';
import { API_ORIGIN, GitHubRequestError, MAX_PAGES, nextPage, request } from './http-client.js';

export interface GitHubSourceOption {
  id: string;
  name: string;
  targetType: GitHubTargetType;
  url?: string;
}

export async function discoverGitHubTargets(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<GitHubSourceOption[]> {
  const organizations = await discoverGitHubOrganizations(token, fetchImpl);
  const enterprises = await discoverGitHubEnterprises(token, fetchImpl);
  return [...organizations, ...enterprises].sort(
    (left, right) =>
      left.targetType.localeCompare(right.targetType) || left.name.localeCompare(right.name),
  );
}

async function discoverGitHubOrganizations(
  token: string,
  fetchImpl: typeof fetch,
): Promise<GitHubSourceOption[]> {
  const organizations: GitHubSourceOption[] = [];
  let url: URL | undefined = new URL('/user/orgs?per_page=100', API_ORIGIN);
  for (let page = 0; url && page < MAX_PAGES; page += 1) {
    const response = await request(url, token, fetchImpl);
    const body: unknown = await response.json();
    if (!Array.isArray(body))
      throw new Error('GitHub returned an unexpected organization response.');
    organizations.push(
      ...body.flatMap((item) => {
        const parsed = gitHubOrganizationResponseSchema.safeParse(item);
        if (!parsed.success) return [];
        const organization = parsed.data;
        return [
          {
            id: `organization:${organization.id}`,
            name: organization.login,
            targetType: 'organization' as const,
            url: organization.html_url ?? `https://github.com/${organization.login}`,
          },
        ];
      }),
    );
    url = nextPage(response);
  }
  if (url) throw new Error('GitHub organization discovery exceeded the 10,000 organization cap.');
  return organizations;
}

async function discoverGitHubEnterprises(
  token: string,
  fetchImpl: typeof fetch,
): Promise<GitHubSourceOption[]> {
  let response: Response;
  try {
    response = await request(
      new URL('/user/enterprises?per_page=100', API_ORIGIN),
      token,
      fetchImpl,
    );
  } catch (error) {
    if (
      error instanceof GitHubRequestError &&
      !error.rateLimited &&
      (error.status === 403 || error.status === 404)
    ) {
      return [];
    }
    throw error;
  }
  const body: unknown = await response.json();
  if (!Array.isArray(body)) throw new Error('GitHub returned an unexpected enterprise response.');
  return body.flatMap((item) => {
    const parsed = gitHubEnterpriseResponseSchema.safeParse(item);
    if (!parsed.success) return [];
    const enterprise = parsed.data;
    return [
      {
        id: `enterprise:${enterprise.id}`,
        name: enterprise.slug,
        targetType: 'enterprise' as const,
        url: enterprise.html_url,
      },
    ];
  });
}

export async function listGitHubRepositoriesForTarget(
  input: { targetType: GitHubTargetType; target: string; accessToken: string },
  fetchImpl: typeof fetch = fetch,
): Promise<string[]> {
  const target = gitHubTargetSchema.parse(input.target);
  const repositories: string[] = [];
  let url: URL | undefined = new URL(
    input.targetType === 'enterprise'
      ? `/enterprises/${target}/repos?per_page=100`
      : `/orgs/${target}/repos?type=all&sort=full_name&per_page=100`,
    API_ORIGIN,
  );
  for (let page = 0; url && page < MAX_PAGES; page += 1) {
    const response = await request(url, input.accessToken, fetchImpl);
    const parsed = gitHubRepositoriesResponseSchema.safeParse(await response.json());
    if (!parsed.success) throw new Error('GitHub returned an unexpected repository response.');
    repositories.push(...parsed.data.map((repository) => repository.full_name));
    url = nextPage(response);
  }
  if (url) throw new Error('GitHub repository discovery exceeded the 10,000 repository cap.');
  return repositories.sort((left, right) => left.localeCompare(right));
}
