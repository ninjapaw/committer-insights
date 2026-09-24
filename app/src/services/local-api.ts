import { getPortalApiToken } from '../auth/get-token';

function redirectToInvalidSession(): void {
  if (
    window.location.pathname === '/sign-in' &&
    window.location.search.includes('reason=session')
  ) {
    return;
  }
  window.history.replaceState(null, '', '/sign-in?reason=session');
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export async function localRequest(path: string, init: RequestInit = {}): Promise<Response> {
  let token: string;
  try {
    token = await getPortalApiToken();
  } catch (error) {
    redirectToInvalidSession();
    throw error;
  }
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  const response = await fetch(path, { ...init, headers });
  if (response.status === 401) {
    const body: unknown = await response
      .clone()
      .json()
      .catch(() => undefined);
    if (
      typeof body === 'object' &&
      body !== null &&
      'message' in body &&
      String(body.message).toLowerCase().includes('invalid local session')
    ) {
      redirectToInvalidSession();
    }
  }
  return response;
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
