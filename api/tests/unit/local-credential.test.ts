import { afterEach, describe, expect, it, vi } from 'vitest';

const credentials = vi.hoisted(() => ({
  getToken: vi.fn(),
  browser: vi.fn(),
  cli: vi.fn(),
  device: vi.fn(),
  authenticate: vi.fn(),
}));
vi.mock('@azure/identity', () => ({
  DeviceCodeCredential: class {
    constructor(options: unknown) {
      credentials.device(options);
    }
    authenticate = credentials.authenticate;
    getToken = credentials.getToken;
  },
  InteractiveBrowserCredential: class {
    constructor(options: unknown) {
      credentials.browser(options);
    }
    getToken = credentials.getToken;
    authenticate = credentials.authenticate;
  },
  AzureCliCredential: class {
    constructor() {
      credentials.cli();
    }
  },
}));

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  vi.resetModules();
});

describe('Microsoft device sign-in', () => {
  async function begin() {
    vi.stubEnv('COMMITTER_INSIGHTS_CLIENT_ID', 'publisher-client');
    let complete!: (record: unknown) => void;
    let fail!: (error: Error) => void;
    credentials.authenticate.mockImplementation(
      () =>
        new Promise((resolve, reject) => {
          complete = resolve;
          fail = reject;
        }),
    );
    const auth = await import('../../src/auth/local-credential.js');
    const initial = auth.startDeviceSignIn();
    const options = credentials.device.mock.calls.at(-1)![0];
    const challenge = {
      userCode: 'TEST-CODE',
      verificationUri: 'https://microsoft.com/devicelogin',
      expiresOnTimestamp: expect.any(Number),
    };
    options.userPromptCallback({ ...challenge, message: 'not exposed', deviceCode: 'not exposed' });
    return { auth, initial, options, challenge, complete, fail };
  }

  it('exposes only the challenge and reuses the device credential after success', async () => {
    const { auth, initial, options, challenge, complete } = await begin();
    expect(options).toMatchObject({
      clientId: 'publisher-client',
      disableAutomaticAuthentication: true,
    });
    expect(auth.getDeviceSignIn(initial.id)).toEqual({
      id: initial.id,
      status: 'pending',
      challenge,
    });
    complete({ username: 'selected@example.test', tenantId: 'test-tenant' });
    await vi.waitFor(() => expect(auth.getDeviceSignIn(initial.id)?.status).toBe('authenticated'));
    expect(auth.getDeviceSignIn(initial.id)).toEqual({
      id: initial.id,
      status: 'authenticated',
      account: { username: 'selected@example.test', tenantId: 'test-tenant' },
    });
    credentials.getToken.mockResolvedValue({ token: 'device-token' });
    expect(await auth.acquireAzureDevOpsToken()).toBe('device-token');
    expect(credentials.browser).not.toHaveBeenCalled();
    expect(credentials.cli).not.toHaveBeenCalled();
  });

  it('cancels polling and ignores late completion', async () => {
    const { auth, initial, complete } = await begin();
    expect(auth.cancelDeviceSignIn(initial.id)).toEqual({ id: initial.id, status: 'canceled' });
    expect(credentials.authenticate.mock.calls[0]![1].abortSignal.aborted).toBe(true);
    complete({ account: 'synthetic' });
    await Promise.resolve();
    expect(auth.getDeviceSignIn(initial.id)?.status).toBe('canceled');
    expect(auth.getDeviceSignIn('unknown')).toBeUndefined();
    expect(auth.cancelDeviceSignIn('unknown')).toBeUndefined();
  });

  it('expires the challenge and does not expose raw authentication errors', async () => {
    vi.useFakeTimers();
    const { auth, initial, fail } = await begin();
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    expect(auth.getDeviceSignIn(initial.id)).toEqual({ id: initial.id, status: 'expired' });
    fail(new Error('sensitive provider details'));
    await Promise.resolve();
    expect(auth.getDeviceSignIn(initial.id)?.status).toBe('expired');
  });

  it('reports failure without exposing provider details and permits retry', async () => {
    const { auth, initial, fail } = await begin();
    fail(new Error('sensitive provider details'));
    await vi.waitFor(() => expect(auth.getDeviceSignIn(initial.id)?.status).toBe('failed'));
    expect(JSON.stringify(auth.getDeviceSignIn(initial.id))).not.toContain(
      'sensitive provider details',
    );
    const next = auth.startDeviceSignIn();
    expect(next.id).not.toBe(initial.id);
    expect(auth.getDeviceSignIn(initial.id)).toBeUndefined();
    auth.cancelDeviceSignIn(next.id);
  });

  it('requires publisher configuration for device codes too', async () => {
    vi.stubEnv('COMMITTER_INSIGHTS_CLIENT_ID', '');
    const { startDeviceSignIn } = await import('../../src/auth/local-credential.js');
    expect(startDeviceSignIn).toThrow('publisher must configure COMMITTER_INSIGHTS_CLIENT_ID');
    expect(credentials.device).not.toHaveBeenCalled();
  });
});

describe('Microsoft browser sign-in', () => {
  it('requests an account picker and connects directly using the selected account', async () => {
    vi.stubEnv('COMMITTER_INSIGHTS_CLIENT_ID', 'publisher-client');
    vi.stubEnv('COMMITTER_INSIGHTS_TENANT_ID', 'organizations');
    vi.stubEnv('COMMITTER_INSIGHTS_REDIRECT_URI', 'http://localhost:8400');
    credentials.getToken.mockResolvedValue({ token: 'test-token' });
    credentials.authenticate.mockResolvedValue({
      username: 'selected@example.test',
      tenantId: 'test-tenant',
      homeAccountId: 'private-sdk-metadata',
    });
    const { acquireAzureDevOpsToken, signInWithBrowser, getMicrosoftAccount } =
      await import('../../src/auth/local-credential.js');
    const state = await signInWithBrowser();
    expect(state).toEqual({
      id: expect.any(String),
      status: 'authenticated',
      account: { username: 'selected@example.test', tenantId: 'test-tenant' },
    });
    expect(getMicrosoftAccount()).toEqual(state.account);
    expect(await acquireAzureDevOpsToken()).toBe('test-token');
    expect(credentials.browser).toHaveBeenCalledWith({
      clientId: 'publisher-client',
      tenantId: 'organizations',
      redirectUri: 'http://localhost:8400',
      disableAutomaticAuthentication: true,
    });
    expect(credentials.getToken).toHaveBeenCalledWith(
      'https://app.vssps.visualstudio.com/.default',
    );
    expect(credentials.cli).not.toHaveBeenCalled();
    await acquireAzureDevOpsToken();
    expect(credentials.browser).toHaveBeenCalledTimes(1);
    const next = await signInWithBrowser();
    expect(next.id).not.toBe(state.id);
    expect(credentials.browser).toHaveBeenCalledTimes(2);
    expect(credentials.authenticate).toHaveBeenCalledTimes(2);
  });

  it('reports missing publisher configuration rather than instructing users to run az login', async () => {
    vi.stubEnv('COMMITTER_INSIGHTS_CLIENT_ID', '');
    const { signInWithBrowser } = await import('../../src/auth/local-credential.js');
    await expect(signInWithBrowser()).rejects.toThrow(
      'publisher must configure COMMITTER_INSIGHTS_CLIENT_ID',
    );
    expect(credentials.browser).not.toHaveBeenCalled();
    expect(credentials.cli).not.toHaveBeenCalled();
  });

  it('preserves browser errors and rejects empty tokens without falling back to CLI', async () => {
    vi.stubEnv('COMMITTER_INSIGHTS_CLIENT_ID', 'publisher-client');
    credentials.authenticate
      .mockRejectedValueOnce(new Error('Consent denied'))
      .mockResolvedValueOnce({ username: 'selected@example.test', tenantId: 'test-tenant' });
    credentials.getToken.mockResolvedValueOnce(null);
    const { acquireAzureDevOpsToken, signInWithBrowser } =
      await import('../../src/auth/local-credential.js');
    await expect(signInWithBrowser()).rejects.toThrow('Consent denied');
    await signInWithBrowser();
    await expect(acquireAzureDevOpsToken()).rejects.toThrow('did not return an Azure DevOps token');
    expect(credentials.cli).not.toHaveBeenCalled();
  });

  it('clears the previous account during a change and ignores completion after timeout', async () => {
    vi.useFakeTimers();
    vi.stubEnv('COMMITTER_INSIGHTS_CLIENT_ID', 'publisher-client');
    credentials.authenticate.mockResolvedValue({
      username: 'wrong@example.test',
      tenantId: 'wrong-tenant',
    });
    const auth = await import('../../src/auth/local-credential.js');
    await auth.signInWithBrowser();
    let complete!: (record: unknown) => void;
    credentials.authenticate.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    const second = auth.signInWithBrowser();
    expect(auth.getMicrosoftAccount()).toBeUndefined();
    await expect(auth.acquireAzureDevOpsToken()).rejects.toThrow('Sign in with Microsoft');
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000);
    complete({ username: 'late@example.test', tenantId: 'test-tenant' });
    expect((await second).status).toBe('expired');
    expect(auth.getMicrosoftAccount()).toBeUndefined();
  });
});
