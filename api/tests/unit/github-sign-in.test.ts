import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';

const launch = vi.hoisted(() => vi.fn());
vi.mock('node:child_process', () => ({ spawn: launch, execFile: vi.fn() }));
vi.mock('../../src/auth/github-cli-binary.js', () => ({
  resolveGitHubCli: () => 'C:/private-app/tools/gh.exe',
}));

function processStub() {
  return Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    stdin: Object.assign(new EventEmitter(), { end: vi.fn() }),
    kill: vi.fn(),
  });
}

afterEach(async () => {
  const { cancelGitHubSignIn } = await import('../../src/auth/github-sign-in.js');
  cancelGitHubSignIn();
  vi.resetModules();
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

describe('GitHub browser sign-in', () => {
  it('starts browser login without a shell or inherited tokens and exposes only the device code', async () => {
    const child = processStub();
    launch.mockReturnValue(child);
    vi.stubEnv('GH_TOKEN', 'private-token');
    const auth = await import('../../src/auth/github-sign-in.js');
    const openBrowser = vi.fn();
    const state = auth.startGitHubSignIn(openBrowser);
    expect(launch.mock.calls[0]![0]).toBe('C:/private-app/tools/gh.exe');
    expect(launch.mock.calls[0]![1]).toContain('--web');
    expect(launch.mock.calls[0]![2].shell).toBeUndefined();
    expect(launch.mock.calls[0]![2].env.GH_TOKEN).toBeUndefined();
    child.stderr.emit('data', Buffer.from('private output\n! First copy your one-time co'));
    child.stderr.emit('data', Buffer.from('de: ABCD-1234\n'));
    expect(openBrowser).toHaveBeenCalledExactlyOnceWith('https://github.com/login/device');
    expect(auth.getGitHubSignIn(state.id)).toEqual({
      id: state.id,
      status: 'pending',
      challenge: { userCode: 'ABCD-1234', verificationUri: 'https://github.com/login/device' },
    });
    child.emit('close', 0);
    expect(auth.getGitHubSignIn(state.id)).toEqual({ id: state.id, status: 'authenticated' });
  });

  it('returns a device challenge without launching a browser in device-code mode', async () => {
    const child = processStub();
    launch.mockReturnValue(child);
    const auth = await import('../../src/auth/github-sign-in.js');
    const state = auth.startGitHubSignIn();
    child.stderr.emit('data', Buffer.from('One-time code (ABCD-1234) copied to clipboard\n'));
    expect(auth.getGitHubSignIn(state.id)).toEqual({
      id: state.id,
      status: 'pending',
      challenge: { userCode: 'ABCD-1234', verificationUri: 'https://github.com/login/device' },
    });
    expect(launch).toHaveBeenCalledOnce();
  });

  it('reports a missing CLI and redacts other errors', async () => {
    const child = processStub();
    launch.mockReturnValue(child);
    const auth = await import('../../src/auth/github-sign-in.js');
    const first = auth.startGitHubSignIn(vi.fn());
    child.emit('error', Object.assign(new Error('private error'), { code: 'ENOENT' }));
    expect(auth.getGitHubSignIn(first.id)?.message).toContain('https://cli.github.com');
    const second = auth.startGitHubSignIn(vi.fn());
    child.stderr.emit('data', Buffer.from('private-token'));
    child.emit('close', 1);
    expect(auth.getGitHubSignIn(second.id)?.status).toBe('failed');
    expect(JSON.stringify(auth.getGitHubSignIn(second.id))).not.toContain('private-token');
  });

  it('cancels and ignores late success from replaced attempts', async () => {
    const firstChild = processStub();
    const secondChild = processStub();
    launch.mockReturnValueOnce(firstChild).mockReturnValueOnce(secondChild);
    const auth = await import('../../src/auth/github-sign-in.js');
    const first = auth.startGitHubSignIn(vi.fn());
    const second = auth.startGitHubSignIn(vi.fn());
    expect(firstChild.kill).toHaveBeenCalledOnce();
    firstChild.emit('close', 0);
    expect(auth.getGitHubSignIn(first.id)).toBeUndefined();
    expect(auth.getGitHubSignIn(second.id)?.status).toBe('pending');
    expect(auth.cancelGitHubSignIn(second.id)?.status).toBe('canceled');
    secondChild.emit('close', 0);
    expect(auth.getGitHubSignIn(second.id)?.status).toBe('canceled');
  });

  it('expires and terminates a login that never finishes', async () => {
    vi.useFakeTimers();
    const child = processStub();
    launch.mockReturnValue(child);
    const auth = await import('../../src/auth/github-sign-in.js');
    const state = auth.startGitHubSignIn(vi.fn());
    vi.advanceTimersByTime(15 * 60 * 1000);
    expect(auth.getGitHubSignIn(state.id)?.status).toBe('expired');
    expect(child.kill).toHaveBeenCalledOnce();
  });
});
