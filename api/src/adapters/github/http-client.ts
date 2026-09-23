export const API_ORIGIN = 'https://api.github.com';
export const API_VERSION = '2022-11-28';
export const MAX_PAGES = 100;

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': API_VERSION,
    'User-Agent': 'committer-insights',
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

export async function request(url: URL, token: string, fetchImpl: typeof fetch): Promise<Response> {
  if (url.origin !== API_ORIGIN) throw new Error('GitHub requests must use api.github.com.');
  const response = await fetchImpl(url, { headers: headers(token) });
  if (!response.ok) {
    const message =
      response.status === 401
        ? 'GitHub CLI authentication expired. Run "gh auth login" and try again.'
        : response.status === 403
          ? 'GitHub denied access or rate-limited this request.'
          : response.status === 404
            ? 'GitHub repository was not found or is not accessible.'
            : 'GitHub returned an unexpected error.';
    throw new Error(message);
  }
  const remainingHeader = response.headers.get('x-ratelimit-remaining');
  const remaining = remainingHeader === null ? undefined : Number(remainingHeader);
  if (remaining !== undefined && Number.isFinite(remaining) && remaining < 10) {
    throw new Error('GitHub API rate limit is nearly exhausted. Try again later.');
  }
  return response;
}
