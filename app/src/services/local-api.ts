import { getPortalApiToken } from '../auth/get-token';

export async function localRequest(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await getPortalApiToken();
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  return fetch(path, { ...init, headers });
}

export async function requestJson<Result>(path: string, init: RequestInit = {}): Promise<Result> {
  const response = await localRequest(path, init);
  const body: unknown = await response.json();
  if (!response.ok) {
    const message =
      typeof body === 'object' && body !== null && 'message' in body
        ? String(body.message)
        : 'The local request failed.';
    throw new Error(message);
  }
  return body as Result;
}

export function postJson<Result>(path: string, body?: unknown): Promise<Result> {
  return requestJson<Result>(path, {
    method: 'POST',
    ...(body === undefined
      ? {}
      : {
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
  });
}
