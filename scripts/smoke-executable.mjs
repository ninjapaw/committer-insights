import { spawn, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { once } from 'node:events';

const executable = join(
  resolve('.'),
  'release',
  process.platform === 'win32' ? 'committer-insights.exe' : 'committer-insights',
);
for (const args of [
  ['--help'],
  ['-h'],
  ['--timezone', 'Invalid/Zone'],
  ['--timezone'],
  ['--timezone='],
]) {
  const result = spawnSync(executable, args, {
    encoding: 'utf8',
    timeout: 15_000,
    env: { ...process.env, COMMITTER_INSIGHTS_NO_BROWSER: 'true' },
  });
  const help = args[0] === '--help' || args[0] === '-h';
  if (
    result.error ||
    result.status !== (help ? 0 : 1) ||
    (help
      ? !result.stdout.includes('--timezone <IANA timezone>')
      : !result.stderr.includes('--timezone')) ||
    result.stdout.includes('http://127.0.0.1:')
  ) {
    throw new Error('Executable launch-option validation failed.');
  }
}

async function smokeStartup(args) {
  const child = spawn(executable, args, {
    env: { ...process.env, COMMITTER_INSIGHTS_NO_BROWSER: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    const launchUrl = await new Promise((resolveUrl, reject) => {
      const timeout = setTimeout(() => reject(new Error('Executable startup timed out.')), 15_000);
      child.once('exit', (code) => reject(new Error(`Executable exited early with code ${code}.`)));
      child.stdout.setEncoding('utf8');
      child.stdout.on('data', (output) => {
        const match = output.match(/http:\/\/127\.0\.0\.1:\d+\/#session=[A-Za-z0-9_-]+/);
        if (match) {
          clearTimeout(timeout);
          resolveUrl(match[0]);
        }
      });
    });
    const url = new URL(launchUrl);
    const capability = new URLSearchParams(url.hash.slice(1)).get('session');
    const origin = url.origin;

    const appResponse = await fetch(origin);
    if (!appResponse.ok || !(await appResponse.text()).includes('<div id="root"></div>')) {
      throw new Error('Embedded application was not served.');
    }
    const denied = await fetch(`${origin}/api/session`);
    if (denied.status !== 401) throw new Error('API accepted a request without the capability.');
    const allowed = await fetch(`${origin}/api/session`, {
      headers: { Authorization: `Bearer ${capability}` },
    });
    const session = await allowed.json();
    if (!allowed.ok || session.authenticated !== false) {
      throw new Error('Authorized local session check failed.');
    }
    process.stdout.write('Executable smoke test passed.\n');
  } finally {
    child.kill();
    await once(child, 'exit').catch(() => undefined);
  }
}

await smokeStartup([]);
await smokeStartup(['--timezone', 'America/Toronto']);
await smokeStartup(['--timezone=UTC']);
