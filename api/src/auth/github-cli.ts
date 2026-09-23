import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

function githubCliEnvironment(): NodeJS.ProcessEnv {
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

export async function acquireGitHubToken(): Promise<string> {
  try {
    const { stdout } = await execFileAsync('gh', ['auth', 'token', '--hostname', 'github.com'], {
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
