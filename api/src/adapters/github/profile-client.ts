import { gitHubViewerSchema } from '@ninjapaw/contracts';
import { API_ORIGIN, request } from './http-client.js';

export async function getGitHubViewer(
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<{ id: string; login: string; name?: string }> {
  const response = await request(new URL('/user', API_ORIGIN), token, fetchImpl);
  const parsed = gitHubViewerSchema.safeParse(await response.json());
  if (!parsed.success) throw new Error('GitHub returned an unexpected user response.');
  return {
    id: String(parsed.data.id),
    login: parsed.data.login,
    ...(parsed.data.name ? { name: parsed.data.name } : {}),
  };
}
