import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { gitHubAccountLoginSchema, type GitHubCliAccount } from '@ninjapaw/contracts';

const execFileAsync = promisify(execFile);
let selectedLogin: string | null | undefined;

export function selectGitHubAccount(login?: string): void {
  if (login !== undefined && !gitHubAccountLoginSchema.safeParse(login).success) {
    throw new Error('Invalid GitHub account name.');
  }
  selectedLogin = login;
}

export function disconnectGitHubAccount(): void {
  selectedLogin = null;
}

export async function listGitHubAccounts(): Promise<GitHubCliAccount[]> {
  try {
    const { stdout } = await execFileAsync(
      'gh',
      ['auth', 'status', '--hostname', 'github.com', '--json', 'hosts'],
      {
        env: githubCliEnvironment(),
        timeout: 15_000,
        maxBuffer: 128 * 1024,
        windowsHide: true,
      },
    );
    const result = JSON.parse(stdout) as {
      hosts?: Record<string, Array<{ login?: unknown; active?: unknown; state?: unknown }>>;
    };
    const accounts = result.hosts?.['github.com'];
    if (!Array.isArray(accounts)) return [];
    return accounts
      .filter((account) => gitHubAccountLoginSchema.safeParse(account.login).success)
      .map((account) => ({
        login: account.login as string,
        active: account.active === true,
        available: account.state === 'success',
      }));
  } catch {
    throw new Error(
      'Unable to list GitHub CLI accounts. Run "gh auth login --hostname github.com" to add an account, then refresh.',
    );
  }
}

export function githubCliEnvironment(): NodeJS.ProcessEnv {
  const environment = { ...process.env };
  for (const name of [
    'GH_TOKEN',
    'GITHUB_TOKEN',
    'GH_ENTERPRISE_TOKEN',
    'GITHUB_ENTERPRISE_TOKEN',
  ]) {
    delete environment[name];
  }
  environment.GH_HOST = 'github.com';
  return environment;
}

export async function acquireGitHubToken(login = selectedLogin): Promise<string> {
  if (login === null) throw new Error('Select a GitHub account to continue.');
  if (login !== undefined && !gitHubAccountLoginSchema.safeParse(login).success) {
    throw new Error('Invalid GitHub account name.');
  }
  try {
    const args = ['auth', 'token', '--hostname', 'github.com'];
    if (login) args.push('--user', login);
    const { stdout } = await execFileAsync('gh', args, {
      env: githubCliEnvironment(),
      timeout: 15_000,
      maxBuffer: 8 * 1024,
      windowsHide: true,
    });
    const token = stdout.trim();
    if (!token) throw new Error('GitHub CLI returned an empty token.');
    return token;
  } catch {
    throw new Error('Sign in with GitHub CLI by running "gh auth login", then try again.');
  }
}
