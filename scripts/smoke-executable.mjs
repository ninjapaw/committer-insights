import { spawn, spawnSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { PRODUCT } from '../packages/metadata/dist/index.js';

const executable = join(
  resolve('.'),
  'release',
  process.platform === 'win32' ? `${PRODUCT.executableName}.exe` : PRODUCT.executableName,
);
const launchOptionTimeout = process.platform === 'darwin' ? 60_000 : 15_000;
function macOsDiagnostics() {
  if (process.platform !== 'darwin') return '';
  const run = (command, args) => {
    try {
      return `${command} ${args.join(' ')}:\n${execFileSync(command, args, { encoding: 'utf8' })}`;
    } catch (error) {
      return `${command} ${args.join(' ')} failed:\n${error instanceof Error ? error.message : String(error)}`;
    }
  };
  return [
    run('file', [executable]),
    run('codesign', ['--display', '--verbose=4', executable]),
    run('codesign', ['--verify', '--verbose=4', executable]),
  ].join('\n');
}
for (const args of [
  ['--help'],
  ['-h'],
  ['--version'],
  ['-v'],
  ['--timezone', 'Invalid/Zone'],
  ['--timezone'],
  ['--timezone='],
]) {
  const result = spawnSync(executable, args, {
    encoding: 'utf8',
    timeout: launchOptionTimeout,
    env: { ...process.env, DEVELOPER_USAGE_INSIGHTS_NO_BROWSER: 'true' },
  });
  const help = args[0] === '--help' || args[0] === '-h';
  // Every platform build must report the same tag so an install can be matched to a release.
  const version = args[0] === '--version' || args[0] === '-v';
  const reportedWrongOutput = help
    ? !result.stdout.includes('--timezone <IANA timezone>')
    : version
      ? !result.stdout.includes(PRODUCT.releaseTag)
      : !result.stderr.includes('--timezone');
  if (
    result.error ||
    // Informational flags succeed; every malformed --timezone form must be rejected instead of
    // silently falling back to a default and starting a server the caller did not ask for.
    result.status !== (help || version ? 0 : 1) ||
    reportedWrongOutput ||
    result.stdout.includes('http://127.0.0.1:')
  ) {
    throw new Error(
      `Executable launch-option validation failed for ${args.join(' ')}: status=${result.status}, signal=${result.signal ?? 'none'}, error=${result.error?.message ?? 'none'}, stdout=${result.stdout}, stderr=${result.stderr}\n${macOsDiagnostics()}`,
    );
  }
}

async function smokeStartup(args) {
  const sandbox = await mkdtemp(
    join(
      process.platform === 'win32' ? process.env.LOCALAPPDATA || tmpdir() : tmpdir(),
      'committer-smoke-',
    ),
  );
  const environment = { ...process.env, DEVELOPER_USAGE_INSIGHTS_NO_BROWSER: 'true' };
  if (process.platform === 'win32') {
    for (const name of Object.keys(environment)) {
      if (
        name.toLowerCase() === 'path' ||
        /^(GH_TOKEN|GITHUB_TOKEN|GH_ENTERPRISE_TOKEN|GITHUB_ENTERPRISE_TOKEN)$/.test(name)
      )
        delete environment[name];
    }
    environment.PATH = '';
    environment.LOCALAPPDATA = sandbox;
    environment.GH_CONFIG_DIR = join(sandbox, 'gh-config');
  }
  const child = spawn(executable, [...args, '--skip-update-check'], {
    env: environment,
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  try {
    const launchUrl = await new Promise((resolveUrl, reject) => {
      const timeout = setTimeout(() => reject(new Error('Executable startup timed out.')), 660_000);
      child.once('exit', (code) => reject(new Error(`Executable exited early with code ${code}.`)));
      child.stdout.setEncoding('utf8');
      let startupOutput = '';
      child.stdout.on('data', (output) => {
        startupOutput += output;
        const match = startupOutput.match(/http:\/\/127\.0\.0\.1:\d+\/#session=[A-Za-z0-9_-]+/);
        if (match) {
          clearTimeout(timeout);
          if (
            process.platform === 'win32' &&
            !startupOutput.slice(0, match.index).includes('Microsoft sign-in runtime ready.')
          ) {
            reject(new Error('Microsoft runtime was not prepared before the app opened.'));
            return;
          }
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
    if (process.platform === 'win32') {
      const accounts = await fetch(`${origin}/api/auth/github/accounts`, {
        headers: { Authorization: `Bearer ${capability}` },
      });
      if (![200, 500].includes(accounts.status))
        throw new Error('Unexpected fresh-account response.');
      const tools = join(sandbox, 'CommitterInsights', 'tools', 'github-cli');
      const versions = await readdir(tools);
      if (versions.length !== 1) throw new Error('Bundled CLI was not extracted privately.');
      const binaryPath = join(tools, versions[0], 'gh.exe');
      const binaryHash = createHash('sha256')
        .update(await readFile(binaryPath))
        .digest('hex');
      const sbom = JSON.parse(
        await readFile(join(resolve('.'), 'release/github-cli.spdx.json'), 'utf8'),
      );
      if (
        sbom.spdxVersion !== 'SPDX-2.3' ||
        sbom.files[0].checksums[0].checksumValue !== binaryHash
      ) {
        throw new Error('Bundled CLI does not match the release SBOM.');
      }
      const version = spawnSync(binaryPath, ['--version'], {
        env: environment,
        encoding: 'utf8',
        timeout: 15000,
        windowsHide: true,
      });
      if (
        version.status !== 0 ||
        !version.stdout.startsWith(`gh version ${sbom.packages[0].versionInfo} `)
      ) {
        throw new Error('Bundled CLI did not run with an empty PATH.');
      }
      if (
        !(await readFile(join(tools, versions[0], 'LICENSE'), 'utf8')).includes('MIT License') ||
        !(await readFile(join(resolve('.'), 'release/THIRD-PARTY-NOTICES.txt'), 'utf8')).includes(
          'Copyright (c) 2019 GitHub Inc.',
        )
      ) {
        throw new Error('Bundled GitHub CLI license notices are missing.');
      }
      process.stdout.write(
        'Bundled GitHub CLI smoke passed with empty PATH and fresh user directories.\n',
      );
      if (args.length === 0) {
        const deniedCli = await fetch(`${origin}/api/auth/azure-cli/info`);
        if (deniedCli.status !== 401)
          throw new Error('Azure CLI info accepted an unauthenticated request.');
        const cli = await fetch(`${origin}/api/auth/azure-cli/info`, {
          headers: { Authorization: `Bearer ${capability}` },
          signal: globalThis.AbortSignal.timeout(240000),
        });
        const inventory = JSON.parse(
          await readFile(join(resolve('.'), 'release/azure-cli.spdx.json'), 'utf8'),
        );
        if (!cli.ok || (await cli.json()).version !== inventory.packages[0].versionInfo)
          throw new Error('Bundled Azure CLI failed isolated version check.');
        process.stdout.write(
          'Bundled Azure CLI extraction and version check passed with empty PATH; no login requested.\n',
        );
      }
    }
    process.stdout.write('Executable smoke test passed.\n');
  } finally {
    if (child.exitCode === null && child.signalCode === null) {
      const exited = once(child, 'exit');
      child.kill();
      await exited.catch(() => undefined);
    }
    await rm(sandbox, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  }
}

await smokeStartup([]);
await smokeStartup(['--timezone', 'America/Toronto']);
await smokeStartup(['--timezone=UTC']);
