import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPortalApiToken } from '../../src/auth/get-token';
import { localRequest, postJson, requestJson } from '../../src/services/local-api';

vi.mock('../../src/auth/get-token', () => ({ getPortalApiToken: vi.fn() }));

beforeEach(() => {
  vi.mocked(getPortalApiToken).mockResolvedValue('local-capability');
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe('local API transport', () => {
  it('preserves caller headers but always uses the local capability', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ ok: true }));
    vi.stubGlobal('fetch', fetchMock);
    const headers = new Headers({ Authorization: 'Bearer wrong-token', 'X-Request': 'test' });
    await localRequest('/api/session', { headers });
    const sent = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(new Headers(sent.headers).get('Authorization')).toBe('Bearer local-capability');
    expect(new Headers(sent.headers).get('X-Request')).toBe('test');
    expect(headers.get('Authorization')).toBe('Bearer wrong-token');
  });

  it('does not send a request without a valid local capability', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    vi.mocked(getPortalApiToken).mockRejectedValue(new Error('Restart the application.'));
    await expect(localRequest('/api/session')).rejects.toThrow('Restart the application.');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/sign-in');
    expect(window.location.search).toBe('?reason=session');
  });

  it('routes API invalid-session responses through the sign-in page', async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(Response.json({ message: 'Invalid local session.' }, { status: 401 })),
    );
    await expect(requestJson('/api/session')).rejects.toThrow('Invalid local session.');
    expect(window.location.pathname).toBe('/sign-in');
    expect(window.location.search).toBe('?reason=session');
  });

  it('serializes JSON payloads and returns parsed results', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ reportId: 'report-1' }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await postJson('/api/reports/combined', { sources: [] })).toEqual({
      reportId: 'report-1',
    });
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/reports/combined',
      expect.objectContaining({ method: 'POST', body: '{"sources":[]}' }),
    );
    const sent = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(new Headers(sent.headers).get('Content-Type')).toBe('application/json');
  });

  it('does not fabricate a body for a bodyless POST', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ authenticated: true }));
    vi.stubGlobal('fetch', fetchMock);
    await postJson('/api/auth/sign-in');
    const sent = fetchMock.mock.calls[0]![1] as RequestInit;
    expect(sent.body).toBeUndefined();
    expect(new Headers(sent.headers).has('Content-Type')).toBe(false);
  });

  it.each([
    [{ message: 'Grant repository read access.' }, 'Grant repository read access.'],
    [{}, 'The local request failed.'],
  ])('propagates API failures with a useful message', async (body, message) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json(body, { status: 403 })));
    await expect(requestJson('/api/reports/combined')).rejects.toThrow(message);
  });
});
