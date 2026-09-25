import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { Server } from 'node:http';
import { once } from 'node:events';
import { createConnection } from 'node:net';
import { startLocalServer } from '../../src/local-server.js';
import { listGitHubAccounts, disconnectGitHubAccount } from '../../src/auth/github-cli.js';
import { connectGitHub } from '../../src/services/github.js';
import {
  cancelGitHubSignIn,
  getGitHubSignIn,
  startGitHubSignIn,
} from '../../src/auth/github-sign-in.js';

vi.mock('../../src/auth/github-sign-in.js', () => ({
  startGitHubSignIn: vi.fn(),
  getGitHubSignIn: vi.fn(),
  cancelGitHubSignIn: vi.fn(),
}));

vi.mock('../../src/auth/github-cli.js', () => ({
  listGitHubAccounts: vi.fn(),
  disconnectGitHubAccount: vi.fn(),
}));
vi.mock('../../src/services/github.js', () => ({
  connectGitHub: vi.fn(),
  createGitHubReport: vi.fn(),
  discoverGitHubSources: vi.fn(),
}));
import {
  cancelDeviceSignIn,
  disconnectMicrosoftAccount,
  getMicrosoftAccount,
  getDeviceSignIn,
  signInWithBrowser,
  startAzureCliSignIn,
  startDeviceSignIn,
} from '../../src/auth/local-credential.js';

vi.mock('../../src/auth/local-credential.js', () => ({
  startDeviceSignIn: vi.fn(),
  getDeviceSignIn: vi.fn(),
  cancelDeviceSignIn: vi.fn(),
  disconnectMicrosoftAccount: vi.fn(),
  getMicrosoftAccount: vi.fn(),
  acquireAzureDevOpsToken: vi.fn(),
  signInWithBrowser: vi.fn(),
  startAzureCliSignIn: vi.fn(),
}));

let server: Server;
let origin: string;
let authorization: string;
const previousInterrupt = process.listeners('SIGINT');
const previousTerminate = process.listeners('SIGTERM');
const id = '11111111-2222-4333-8444-555555555555';
const state = {
  id,
  status: 'pending' as const,
  challenge: {
    userCode: 'TEST-CODE',
    verificationUri: 'https://microsoft.com/devicelogin',
    expiresOnTimestamp: Date.now() + 60000,
  },
};

beforeAll(async () => {
  vi.stubEnv('COMMITTER_INSIGHTS_NO_BROWSER', 'true');
  const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
  server = await startLocalServer();
  const launch = output.mock.calls
    .map(([text]) => String(text))
    .join('')
    .match(/http:\/\/127\.0\.0\.1:\d+\/#session=[\w-]+/)![0];
  const url = new URL(launch);
  origin = url.origin;
  authorization = `Bearer ${new URLSearchParams(url.hash.slice(1)).get('session')}`;
  output.mockRestore();
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  for (const listener of process.listeners('SIGINT'))
    if (!previousInterrupt.includes(listener)) process.removeListener('SIGINT', listener);
  for (const listener of process.listeners('SIGTERM'))
    if (!previousTerminate.includes(listener)) process.removeListener('SIGTERM', listener);
  vi.unstubAllEnvs();
});

describe('device sign-in local API boundary', () => {
  it.each(['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'] as const)(
    'closes stalled connections and cancels authentication on %s',
    async (signal) => {
      const previousListeners = process.listeners(signal);
      const output = vi.spyOn(process.stdout, 'write').mockReturnValue(true);
      const localServer = await startLocalServer();
      output.mockRestore();
      const address = localServer.address();
      if (!address || typeof address === 'string') throw new Error('Missing test address');
      const connected = once(localServer, 'connection');
      const socket = createConnection({ host: '127.0.0.1', port: address.port });
      const exit = vi.spyOn(process, 'exit').mockImplementation(() => undefined as never);
      try {
        await connected;
        const shutdown = process
          .listeners(signal)
          .find((listener) => !previousListeners.includes(listener))!;
        const closed = once(localServer, 'close');
        const canceledGitHub = vi.mocked(cancelGitHubSignIn).mock.calls.length;
        const canceledMicrosoft = vi.mocked(disconnectMicrosoftAccount).mock.calls.length;
        shutdown(signal);
        shutdown(signal);
        await closed;
        await vi.waitFor(() => expect(exit).toHaveBeenCalledExactlyOnceWith(0));
        expect(vi.mocked(cancelGitHubSignIn).mock.calls.length).toBeGreaterThan(canceledGitHub);
        expect(vi.mocked(disconnectMicrosoftAccount).mock.calls.length).toBeGreaterThan(
          canceledMicrosoft,
        );
        expect(process.listeners(signal)).toEqual(previousListeners);
      } finally {
        exit.mockRestore();
        socket.destroy();
        if (localServer.listening) localServer.close();
        localServer.closeAllConnections();
      }
    },
  );

  it('protects GitHub account listing, selection, and sign-out behind capability and origin checks', async () => {
    for (const [path, method] of [
      ['/api/auth/github/accounts', 'GET'],
      ['/api/auth/github/sign-in', 'POST'],
      ['/api/auth/github/sign-out', 'POST'],
      ['/api/auth/github/browser', 'POST'],
      ['/api/auth/github/device-code', 'POST'],
      [`/api/auth/github/browser/${id}`, 'GET'],
      [`/api/auth/github/browser/${id}`, 'DELETE'],
    ]) {
      expect((await fetch(`${origin}${path}`, { method })).status).toBe(401);
      if (method === 'POST' || method === 'DELETE')
        expect(
          (
            await fetch(`${origin}${path}`, {
              method,
              headers: { authorization, origin: 'https://example.com' },
            })
          ).status,
        ).toBe(401);
    }
    expect(listGitHubAccounts).not.toHaveBeenCalled();
    expect(connectGitHub).not.toHaveBeenCalled();
    expect(disconnectGitHubAccount).not.toHaveBeenCalled();
    vi.mocked(listGitHubAccounts).mockResolvedValue([
      { login: 'second', active: false, available: true },
    ]);
    const accounts = await fetch(`${origin}/api/auth/github/accounts`, {
      headers: { authorization },
    });
    expect(accounts.headers.get('cache-control')).toBe('no-store');
    expect(await accounts.json()).toEqual({
      accounts: [{ login: 'second', active: false, available: true }],
    });
    const headers = { authorization, origin, 'Content-Type': 'application/json' };
    expect(
      (
        await fetch(`${origin}/api/auth/github/sign-in`, {
          method: 'POST',
          headers,
          body: '{"login":"--unsafe"}',
        })
      ).status,
    ).toBe(400);
    expect(connectGitHub).not.toHaveBeenCalled();
    vi.mocked(connectGitHub).mockResolvedValue({
      authenticated: true,
      viewer: { id: '2', login: 'second' },
    });
    expect(
      (
        await fetch(`${origin}/api/auth/github/sign-in`, {
          method: 'POST',
          headers,
          body: '{"login":"second"}',
        })
      ).status,
    ).toBe(200);
    expect(connectGitHub).toHaveBeenCalledWith('second');
    expect(
      (await fetch(`${origin}/api/auth/github/sign-out`, { method: 'POST', headers })).status,
    ).toBe(200);
    expect(disconnectGitHubAccount).toHaveBeenCalledTimes(1);
    expect(
      (await fetch(`${origin}/api/connections/github/targets`, { headers: { authorization } }))
        .status,
    ).toBe(401);
  });

  it('starts, polls, and cancels GitHub login without granting report access before verification', async () => {
    const pending = {
      id,
      status: 'pending' as const,
      challenge: {
        userCode: 'ABCD-1234',
        verificationUri: 'https://github.com/login/device',
      },
    };
    vi.mocked(startGitHubSignIn).mockReturnValue(pending);
    vi.mocked(getGitHubSignIn).mockReturnValue(pending);
    vi.mocked(cancelGitHubSignIn).mockReturnValue({ id, status: 'canceled' });
    const headers = { authorization, origin };
    const start = await fetch(`${origin}/api/auth/github/browser`, { method: 'POST', headers });
    expect(start.status).toBe(202);
    expect(await start.json()).toEqual(pending);
    expect(startGitHubSignIn).toHaveBeenCalledWith(expect.any(Function));
    const device = await fetch(`${origin}/api/auth/github/device-code`, {
      method: 'POST',
      headers,
    });
    expect(device.status).toBe(202);
    expect(await device.json()).toEqual(pending);
    expect(startGitHubSignIn).toHaveBeenLastCalledWith(undefined);
    const status = await fetch(`${origin}/api/auth/github/browser/${id}`, { headers });
    expect(status.headers.get('cache-control')).toBe('no-store');
    expect(await status.json()).toEqual(pending);
    expect((await fetch(`${origin}/api/connections/github/targets`, { headers })).status).toBe(401);
    const cancel = await fetch(`${origin}/api/auth/github/browser/${id}`, {
      method: 'DELETE',
      headers,
    });
    expect(await cancel.json()).toEqual({ id, status: 'canceled' });
    expect(cancelGitHubSignIn).toHaveBeenCalledWith(id);
    vi.mocked(getGitHubSignIn).mockReturnValue(undefined);
    expect((await fetch(`${origin}/api/auth/github/browser/${id}`, { headers })).status).toBe(404);
  });

  it('rejects unauthenticated reads and writes, and cross-origin mutations', async () => {
    for (const [path, method] of [
      ['/api/auth/device-code', 'POST'],
      [`/api/auth/device-code/${id}`, 'GET'],
      [`/api/auth/device-code/${id}`, 'DELETE'],
      ['/api/auth/sign-out', 'POST'],
    ]) {
      expect((await fetch(`${origin}${path}`, { method })).status).toBe(401);
    }
    for (const method of ['POST', 'DELETE']) {
      const path = method === 'POST' ? '/api/auth/device-code' : `/api/auth/device-code/${id}`;
      expect(
        (
          await fetch(`${origin}${path}`, {
            method,
            headers: { authorization, origin: 'https://example.com' },
          })
        ).status,
      ).toBe(401);
    }
    expect(startDeviceSignIn).not.toHaveBeenCalled();
    expect(getDeviceSignIn).not.toHaveBeenCalled();
    expect(cancelDeviceSignIn).not.toHaveBeenCalled();
    expect(
      (
        await fetch(`${origin}/api/auth/sign-out`, {
          method: 'POST',
          headers: { authorization, origin: 'https://example.com' },
        })
      ).status,
    ).toBe(401);
    expect(disconnectMicrosoftAccount).not.toHaveBeenCalled();
  });

  it('starts and polls a challenge without marking the session authenticated', async () => {
    vi.mocked(startDeviceSignIn).mockReturnValue({ id, status: 'pending' });
    vi.mocked(getDeviceSignIn).mockReturnValue(state);
    const started = await fetch(`${origin}/api/auth/device-code`, {
      method: 'POST',
      headers: { authorization, origin },
    });
    expect(started.status).toBe(202);
    expect(await started.json()).toEqual({ id, status: 'pending' });
    const challenge = await fetch(`${origin}/api/auth/device-code/${id}`, {
      headers: { authorization },
    });
    expect(challenge.headers.get('cache-control')).toBe('no-store');
    expect(await challenge.json()).toEqual(state);
    expect(
      await (await fetch(`${origin}/api/session`, { headers: { authorization } })).json(),
    ).toEqual({ authenticated: false });
  });

  it('cancels and rejects unknown attempts', async () => {
    vi.mocked(cancelDeviceSignIn).mockReturnValue({ id, status: 'canceled' });
    const canceled = await fetch(`${origin}/api/auth/device-code/${id}`, {
      method: 'DELETE',
      headers: { authorization, origin },
    });
    expect(await canceled.json()).toEqual({ id, status: 'canceled' });
    vi.mocked(getDeviceSignIn).mockReturnValue(undefined);
    expect(
      (await fetch(`${origin}/api/auth/device-code/${id}`, { headers: { authorization } })).status,
    ).toBe(404);
  });

  it('starts default Microsoft login through CLI, polls completion and clears the session on account change', async () => {
    const selection = {
      id,
      status: 'authenticated' as const,
      account: { username: 'selected@example.test', tenantId: 'test-tenant' },
    };
    vi.mocked(startAzureCliSignIn).mockReturnValue({ id, status: 'pending' });
    expect((await fetch(`${origin}/api/auth/sign-in`, { method: 'POST' })).status).toBe(401);
    expect(
      (
        await fetch(`${origin}/api/auth/sign-in`, {
          method: 'POST',
          headers: { authorization, origin: 'https://example.com' },
        })
      ).status,
    ).toBe(401);
    expect(startAzureCliSignIn).not.toHaveBeenCalled();
    expect(
      await (
        await fetch(`${origin}/api/auth/sign-in`, {
          method: 'POST',
          headers: { authorization, origin },
        })
      ).json(),
    ).toEqual({ id, status: 'pending' });
    expect(startAzureCliSignIn).toHaveBeenCalledOnce();
    expect(signInWithBrowser).not.toHaveBeenCalled();
    vi.mocked(getDeviceSignIn).mockReturnValue(selection);
    expect(
      (await fetch(`${origin}/api/auth/device-code/${id}`, { headers: { authorization } })).status,
    ).toBe(200);
    expect(
      await (await fetch(`${origin}/api/session`, { headers: { authorization } })).json(),
    ).toEqual({ authenticated: false });
    expect(
      (
        await fetch(`${origin}/api/connections/azure-devops/organizations`, {
          headers: { authorization },
        })
      ).status,
    ).toBe(401);
    vi.mocked(getMicrosoftAccount).mockReturnValue(selection.account);
    expect(
      await (await fetch(`${origin}/api/session`, { headers: { authorization } })).json(),
    ).toEqual({ authenticated: true, account: selection.account });
    vi.mocked(disconnectMicrosoftAccount).mockImplementation(() => {
      vi.mocked(getMicrosoftAccount).mockReturnValue(undefined);
    });
    expect(
      (
        await fetch(`${origin}/api/auth/sign-out`, {
          method: 'POST',
          headers: { authorization, origin },
        })
      ).status,
    ).toBe(200);
    expect(
      await (await fetch(`${origin}/api/session`, { headers: { authorization } })).json(),
    ).toEqual({ authenticated: false });
  });
});
