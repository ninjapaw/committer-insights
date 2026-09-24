import { afterEach, describe, expect, it, vi } from 'vitest';

const execute = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ execFile: execute }));
vi.mock('node:util', () => ({ promisify: () => execute }));
vi.mock('../../src/auth/github-cli-binary.js', () => ({
  resolveGitHubCli: () => 'C:/private-app/tools/gh.exe',
}));

afterEach(() => {
  vi.resetAllMocks();
  vi.resetModules();
  vi.unstubAllEnvs();
});

describe('GitHub account selection', () => {
  it('does not fall back to the CLI active account after disconnect', async () => {
    const { disconnectGitHubAccount, acquireGitHubToken } =
      await import('../../src/auth/github-cli.js');
    disconnectGitHubAccount();
    await expect(acquireGitHubToken()).rejects.toThrow('Select a GitHub account');
    expect(execute).not.toHaveBeenCalled();
  });

  it('lists only safe account metadata for github.com', async () => {
    execute.mockResolvedValue({
      stdout: JSON.stringify({
        hosts: {
          'github.com': [
            {
              login: 'first',
              active: true,
              state: 'success',
              token: 'never-expose',
              tokenSource: 'keyring',
            },
            { login: 'second', active: false, state: 'error' },
            { login: '--unsafe', state: 'success' },
          ],
          'other.example': [{ login: 'private-host', state: 'success' }],
        },
      }),
    });
    const { listGitHubAccounts } = await import('../../src/auth/github-cli.js');
    expect(await listGitHubAccounts()).toEqual([
      { login: 'first', active: true, available: true },
      { login: 'second', active: false, available: false },
    ]);
    expect(execute.mock.calls[0]![0]).toBe('C:/private-app/tools/gh.exe');
    expect(execute.mock.calls[0]![1]).toEqual([
      'auth',
      'status',
      '--hostname',
      'github.com',
      '--json',
      'hosts',
    ]);
  });

  it('pins token acquisition to the selected account without global CLI switching or environment tokens', async () => {
    vi.stubEnv('GH_TOKEN', 'ignore');
    vi.stubEnv('GITHUB_TOKEN', 'ignore');
    vi.stubEnv('GH_ENTERPRISE_TOKEN', 'ignore');
    vi.stubEnv('GITHUB_ENTERPRISE_TOKEN', 'ignore');
    execute.mockResolvedValue({ stdout: 'synthetic-token\n' });
    const { selectGitHubAccount, acquireGitHubToken } =
      await import('../../src/auth/github-cli.js');
    selectGitHubAccount('second');
    expect(await acquireGitHubToken()).toBe('synthetic-token');
    expect(execute).toHaveBeenCalledWith(
      'C:/private-app/tools/gh.exe',
      ['auth', 'token', '--hostname', 'github.com', '--user', 'second'],
      expect.objectContaining({ windowsHide: true }),
    );
    const environment = execute.mock.calls[0]![2].env;
    expect(environment.GH_HOST).toBe('github.com');
    for (const name of [
      'GH_TOKEN',
      'GITHUB_TOKEN',
      'GH_ENTERPRISE_TOKEN',
      'GITHUB_ENTERPRISE_TOKEN',
    ])
      expect(environment[name]).toBeUndefined();
    expect(execute.mock.calls[0]![2].shell).toBeUndefined();
    selectGitHubAccount();
    await acquireGitHubToken('first');
    expect(execute.mock.calls[1]![1]).toEqual([
      'auth',
      'token',
      '--hostname',
      'github.com',
      '--user',
      'first',
    ]);
  });

  it('rejects invalid usernames and redacts CLI failures', async () => {
    const auth = await import('../../src/auth/github-cli.js');
    expect(() => auth.selectGitHubAccount('--bad')).toThrow('Invalid');
    await expect(auth.acquireGitHubToken('bad;command')).rejects.toThrow('Invalid');
    expect(execute).not.toHaveBeenCalled();
    execute.mockRejectedValue(new Error('secret CLI output'));
    await expect(auth.listGitHubAccounts()).rejects.toThrow('Unable to list GitHub CLI accounts');
    await expect(auth.acquireGitHubToken('first')).rejects.toThrow(
      'Sign in with GitHub using the sign-in button',
    );
  });

  it('handles empty account lists and empty tokens', async () => {
    const auth = await import('../../src/auth/github-cli.js');
    execute.mockResolvedValueOnce({ stdout: '{"hosts":{}}' }).mockResolvedValueOnce({ stdout: '' });
    expect(await auth.listGitHubAccounts()).toEqual([]);
    await expect(auth.acquireGitHubToken()).rejects.toThrow(
      'Sign in with GitHub using the sign-in button',
    );
  });
});
