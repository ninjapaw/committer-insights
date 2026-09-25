import { PRODUCT } from '@ninjapaw/developer-usage-insights-metadata';

export const API_ORIGIN = 'https://api.github.com';
export const API_VERSION = '2022-11-28';
export const MAX_PAGES = 100;

export class GitHubRequestError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly rateLimited: boolean,
  ) {
    super(message);
    this.name = 'GitHubRequestError';
  }
}

function headers(token: string, apiVersion: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': apiVersion,
    'User-Agent': PRODUCT.slug,
  };
}

export function nextPage(response: Response): URL | undefined {
  const link = response.headers.get('link');
  const match = link?.match(/<([^>]+)>;\s*rel="next"/);
  if (!match) return undefined;
  const url = new URL(match[1]!);
  if (url.protocol !== 'https:' || url.origin !== API_ORIGIN) {
    throw new Error('GitHub returned an unsafe pagination URL.');
  }
  return url;
}

export async function request(
  url: URL,
  token: string,
  fetchImpl: typeof fetch,
  apiVersion = API_VERSION,
): Promise<Response> {
  if (url.origin !== API_ORIGIN) throw new Error('GitHub requests must use api.github.com.');
  const response = await fetchImpl(url, {
    headers: headers(token, apiVersion),
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    const remainingHeader = response.headers.get('x-ratelimit-remaining');
    const rateLimited = response.status === 403 && remainingHeader === '0';
    const message =
      response.status === 401
        ? 'GitHub CLI authentication expired. Run "gh auth login" and try again.'
        : response.status === 403
          ? rateLimited
            ? 'GitHub API rate limit is exhausted. Try again later.'
            : 'GitHub denied access to this request.'
          : response.status === 404
            ? 'GitHub repository was not found or is not accessible.'
            : 'GitHub returned an unexpected error.';
    throw new GitHubRequestError(message, response.status, rateLimited);
  }
  const remainingHeader = response.headers.get('x-ratelimit-remaining');
  const remaining = remainingHeader === null ? undefined : Number(remainingHeader);
  if (remaining !== undefined && Number.isFinite(remaining) && remaining < 10) {
    throw new Error('GitHub API rate limit is nearly exhausted. Try again later.');
  }
  return response;
}
