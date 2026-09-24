import { spawn, type ChildProcess } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import type { GitHubSignInState } from '@ninjapaw/contracts';
import { githubCliEnvironment } from './github-cli.js';

let active: { state: GitHubSignInState; child: ChildProcess; timer: NodeJS.Timeout } | undefined;

export function getGitHubSignIn(id: string): GitHubSignInState | undefined {
  return active?.state.id === id ? structuredClone(active.state) : undefined;
}

export function cancelGitHubSignIn(id?: string): GitHubSignInState | undefined {
  if (!active || (id && active.state.id !== id)) return undefined;
  if (active.state.status === 'pending') {
    active.state = { id: active.state.id, status: 'canceled' };
    clearTimeout(active.timer);
    active.child.kill();
  }
  return structuredClone(active.state);
}

export function startGitHubSignIn(openBrowser?: (url: string) => void): GitHubSignInState {
  cancelGitHubSignIn();
  const state: GitHubSignInState = { id: randomUUID(), status: 'pending' };
  const child = spawn(
    'gh',
    ['auth', 'login', '--hostname', 'github.com', '--web', '--skip-ssh-key'],
    {
      env: { ...githubCliEnvironment(), NO_COLOR: '1', GH_PROMPT_DISABLED: '1' },
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );
  const finish = (status: GitHubSignInState['status'], message?: string) => {
    if (active?.state.id !== state.id || active.state.status !== 'pending') return;
    clearTimeout(active.timer);
    active.state = { id: state.id, status, ...(message ? { message } : {}) };
  };
  const timer = setTimeout(
    () => {
      finish('expired', 'GitHub sign-in expired. Start sign-in again.');
      child.kill();
    },
    15 * 60 * 1000,
  );
  timer.unref();
  active = { state, child, timer };
  let output = '';
  const receive = (chunk: Buffer) => {
    if (active?.state.id !== state.id || active.state.status !== 'pending') return;
    output = (output + chunk.toString('utf8')).slice(-8192);
    const code = output.match(/one-time code(?::\s*|\s*\()([A-Z0-9]{4}-[A-Z0-9]{4})/i)?.[1];
    if (code && !active.state.challenge) {
      active.state.challenge = {
        userCode: code,
        verificationUri: 'https://github.com/login/device',
      };
      output = '';
      try {
        openBrowser?.('https://github.com/login/device');
      } catch {
        active.state.message = 'Open the GitHub device sign-in link to continue.';
      }
    }
  };
  child.stdout?.on('data', receive);
  child.stderr?.on('data', receive);
  child.on('error', (error: NodeJS.ErrnoException) => {
    finish(
      'failed',
      error.code === 'ENOENT'
        ? 'GitHub CLI is required. Install it from https://cli.github.com, reopen this app, and sign in again.'
        : 'Unable to start GitHub sign-in. Check GitHub CLI and try again.',
    );
  });
  child.on('close', (code) => {
    if (code === 0) finish('authenticated');
    else
      finish(
        'failed',
        'GitHub sign-in did not complete. Try again and approve access in your browser.',
      );
  });
  child.stdin?.on('error', () => {
    finish('failed', 'Unable to start GitHub sign-in. Try again.');
    child.kill();
  });
  child.stdin?.end();
  return structuredClone(state);
}
