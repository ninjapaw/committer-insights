import { afterEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { existsSync } from 'node:fs';
import { createAzureCliSignIn, parseAzureCliChallenge } from '../../src/auth/azure-cli-sign-in.js';

const mocks = vi.hoisted(() => ({ execute: vi.fn(), resolve: vi.fn() }));
vi.mock('node:child_process', () => ({ execFile: mocks.execute }));
vi.mock('../../src/auth/azure-cli-binary.js', () => ({ resolveAzureCli: mocks.resolve }));
const sessions: ReturnType<typeof createAzureCliSignIn>[] = [];
const tenant = '11111111-1111-4111-8111-111111111111';
afterEach(() => {
  for (const session of sessions.splice(0)) session.dispose();
  vi.resetAllMocks();
  vi.unstubAllEnvs();
});
function setup(outputs: Array<string | Error>, browserPrompt = false, onReady?: () => void) {
  mocks.resolve.mockResolvedValue('C:/private-tools/python.exe');
  mocks.execute.mockImplementation((_path, _args, _options, callback) => {
    const child = new EventEmitter() as EventEmitter & {
      stderr: EventEmitter;
      kill: ReturnType<typeof vi.fn>;
    };
    child.stderr = new EventEmitter();
    child.kill = vi.fn();
    queueMicrotask(() => {
      child.stderr.emit(
        'data',
        Buffer.from(
          browserPrompt
            ? 'A web browser has been opened to sign in.'
            : 'To sign in, use a web browser to open https://microsoft.com/devicelogin and enter the code TEST12345 to authenticate.',
        ),
      );
      const result = outputs.shift();
      callback(result instanceof Error ? result : null, typeof result === 'string' ? result : '');
    });
    return child;
  });
  const session = createAzureCliSignIn(new AbortController().signal, onReady);
  sessions.push(session);
  return session;
}
describe('isolated Azure CLI authentication', () => {
  it('does not report account selection or launch login when runtime preparation fails', async () => {
    const ready = vi.fn();
    const session = setup([], false, ready);
    mocks.resolve.mockRejectedValue(new Error('runtime unavailable'));
    await expect(session.authenticate(vi.fn())).rejects.toThrow('runtime unavailable');
    expect(ready).not.toHaveBeenCalled();
    expect(mocks.execute).not.toHaveBeenCalled();
  });
  it('uses system-browser login instead of the Windows broker without forcing a device challenge', async () => {
    vi.stubEnv('AZURE_CORE_ENABLE_BROKER_ON_WINDOWS', 'true');
    vi.stubEnv('BROWSER', 'untrusted-browser-command');
    const ready = vi.fn();
    const session = setup(
      [
        JSON.stringify([{ tenantId: tenant, user: { type: 'user', name: 'person@example.test' } }]),
        JSON.stringify({
          accessToken: 'browser-token',
          tenant,
          expires_on: Math.floor(Date.now() / 1000) + 3600,
        }),
      ],
      true,
      ready,
    );
    const challenge = vi.fn();
    expect(await session.authenticate(challenge)).toEqual({
      username: 'person@example.test',
      tenantId: tenant,
    });
    expect(challenge).not.toHaveBeenCalled();
    expect(ready).toHaveBeenCalledOnce();
    expect(mocks.execute.mock.calls[0]![2].windowsHide).toBe(false);
    expect(mocks.execute.mock.calls[1]![2].windowsHide).toBe(true);
    expect(mocks.execute.mock.calls[0]![2].env.AZURE_CORE_ENABLE_BROKER_ON_WINDOWS).toBe('false');
    expect(mocks.execute.mock.calls[0]![2].env.BROWSER).toBeUndefined();
    expect(mocks.execute.mock.calls[1]![2].env.AZURE_CORE_ENABLE_BROKER_ON_WINDOWS).toBe('false');
    expect(mocks.execute.mock.calls[0]![2].env.AZURE_CORE_LOGIN_EXPERIENCE_V2).toBe('off');
    expect(mocks.execute.mock.calls[0]![1]).not.toContain('--use-device-code');
  });
  it('parses only trusted challenge locations', () => {
    expect(
      parseAzureCliChallenge(
        'To sign in, use a web browser to open the page https://login.microsoft.com/device and enter the code ABCD12345 to authenticate.',
      ),
    ).toEqual({ userCode: 'ABCD12345', verificationUri: 'https://microsoft.com/devicelogin' });
    expect(parseAzureCliChallenge('https://evil.example enter the code ABCD1234')).toBeUndefined();
    expect(
      parseAzureCliChallenge('https://microsoft.com/devicelogin enter the code ABCD1234'),
    ).toEqual({ userCode: 'ABCD1234', verificationUri: 'https://microsoft.com/devicelogin' });
  });
  it('keeps read-only version checks hidden', async () => {
    const session = setup([JSON.stringify({ 'azure-cli': '2.90.0' })]);
    expect(await session.version()).toBe('2.90.0');
    expect(mocks.execute.mock.calls[0]![2].windowsHide).toBe(true);
  });
  it('uses the exact runtime, isolated environment and tenant-bound token renewal, then removes its cache', async () => {
    vi.stubEnv('AZURE_CONFIG_DIR', 'do-not-use');
    vi.stubEnv('AZURE_CLIENT_SECRET', 'must-not-inherit');
    const session = setup([
      JSON.stringify([
        { isDefault: true, tenantId: tenant, user: { type: 'user', name: 'person@example.test' } },
      ]),
      JSON.stringify({
        accessToken: 'initial-token',
        tenant,
        expires_on: Math.floor(Date.now() / 1000) + 60,
      }),
      JSON.stringify({
        accessToken: 'renewed-token',
        tenant,
        expires_on: Math.floor(Date.now() / 1000) + 3600,
      }),
    ]);
    const challenge = vi.fn();
    expect(await session.authenticate(challenge)).toEqual({
      username: 'person@example.test',
      tenantId: tenant,
    });
    expect(challenge).toHaveBeenCalledWith(expect.objectContaining({ userCode: 'TEST12345' }));
    const call = mocks.execute.mock.calls[0]!;
    expect(call[0]).toBe('C:/private-tools/python.exe');
    expect(call[1]).toEqual([
      '-I',
      '-B',
      '-m',
      'azure.cli',
      'login',
      '--allow-no-subscriptions',
      '--output',
      'json',
    ]);
    expect(call[2].env.AZURE_CONFIG_DIR).not.toBe('do-not-use');
    expect(call[1]).not.toContain('--username');
    expect(call[1]).not.toContain('--password');
    expect(call[1]).not.toContain('--use-device-code');
    expect(call[2].timeout).toBe(600000);
    expect(call[2].env.AZURE_CLIENT_SECRET).toBeUndefined();
    expect(call[2].env.AZURE_EXTENSION_USE_DYNAMIC_INSTALL).toBe('no');
    expect(await session.credential.getToken('ignored')).toMatchObject({ token: 'renewed-token' });
    expect(mocks.execute.mock.calls[2]![1]).toContain(tenant);
    await session.credential.getToken('ignored');
    expect(mocks.execute).toHaveBeenCalledTimes(3);
    const cache = call[2].env.AZURE_CONFIG_DIR;
    expect(existsSync(cache)).toBe(true);
    session.dispose();
    expect(existsSync(cache)).toBe(false);
    await expect(session.credential.getToken('ignored')).rejects.toThrow('Sign in');
  });
  it('does not surface CLI stderr or raw token failures', async () => {
    const session = setup([new Error('secret stdout and stderr')]);
    await expect(session.authenticate(vi.fn())).rejects.toThrow('Azure CLI authentication failed');
  });
  it('rejects tokens for a different tenant', async () => {
    const session = setup([
      JSON.stringify([{ tenantId: tenant, user: { type: 'user', name: 'person@example.test' } }]),
      JSON.stringify({
        accessToken: 'wrong-tenant',
        tenant: 'other',
        expires_on: Math.floor(Date.now() / 1000) + 3600,
      }),
    ]);
    await expect(session.authenticate(vi.fn())).rejects.toThrow('invalid Azure DevOps token');
  });
});
