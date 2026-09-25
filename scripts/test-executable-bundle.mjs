import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import { copyFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { build } from 'esbuild';
import { executableBundleOptions } from './executable-bundle-options.mjs';

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const require = createRequire(import.meta.url);
const launches = [];
const child = { unref() {} };
const url =
  'https://login.microsoftonline.com/organizations/oauth2/v2.0/authorize?client_id=test&prompt=select_account&state=synthetic%2Bstate';

async function loadBrowserOpener(preserveModuleUrl) {
  const options = executableBundleOptions('synthetic-client');
  if (!preserveModuleUrl) {
    delete options.banner;
    delete options.define['import.meta.url'];
  }
  const result = await build({
    ...options,
    stdin: {
      contents:
        'module.exports = async (url) => { const open = await import("open"); return open.default(url); };',
      resolveDir: root,
    },
    write: false,
    logLevel: 'silent',
  });
  const module = { exports: {} };
  runInNewContext(result.outputFiles[0].text, {
    module,
    exports: module.exports,
    __filename: join(root, 'relocated app', 'committer-insights.exe'),
    process,
    Buffer,
    require: (name) =>
      name === 'node:child_process'
        ? {
            ...require(name),
            spawn: (...args) => {
              launches.push(args);
              return child;
            },
          }
        : require(name),
  });
  return module.exports;
}

const brokenOpener = await loadBrowserOpener(false);
await assert.rejects(() => brokenOpener(url), /path.*(?:string|URL).*undefined/s);
assert.equal(launches.length, 0);
const fixedOpener = await loadBrowserOpener(true);
assert.equal(await fixedOpener(url), child);
assert.equal(launches.length, 1);
const [command, args] = launches[0];
assert.equal(typeof command, 'string');
assert.ok(command.length > 0);
if (process.platform === 'win32') {
  assert.ok(args.includes('-EncodedCommand'));
  assert.equal(Buffer.from(args.at(-1), 'base64').toString('utf16le'), `Start "${url}"`);
} else {
  assert.ok(args.includes(url));
}
process.stdout.write(
  'Bundled browser launch regression passed: old failure reproduced, fixed opener preserves the authorization URL.\n',
);

if (process.platform === 'win32') {
  const powershell = join(process.env.SystemRoot, 'System32/WindowsPowerShell/v1.0/powershell.exe');
  const consoleProbe = `Add-Type -TypeDefinition 'using System; using System.Runtime.InteropServices; public static class ConsoleProbe { [DllImport("kernel32.dll")] public static extern IntPtr GetConsoleWindow(); }'; @{ handle = [ConsoleProbe]::GetConsoleWindow().ToInt64(); interactive = [Environment]::UserInteractive } | ConvertTo-Json -Compress`;
  let interactiveDesktop = false;
  for (const windowsHide of [true, false]) {
    const probe = JSON.parse(
      require('node:child_process')
        .execFileSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', consoleProbe], {
          windowsHide,
          encoding: 'utf8',
          timeout: 20000,
        })
        .trim(),
    );
    assert.equal(Number.isSafeInteger(probe.handle), true);
    assert.equal(typeof probe.interactive, 'boolean');
    interactiveDesktop = probe.interactive && process.stdout.isTTY === true;
    if (interactiveDesktop) assert.equal(probe.handle !== 0, !windowsHide);
  }
  process.stdout.write(
    interactiveDesktop
      ? 'Windows console-parent regression passed: hidden piped children lack the console handle required by CLI WAM; interactive children retain it. No login requested.\n'
      : 'Windows console-parent UI assertion unavailable without an interactive terminal; command visibility remains covered by unit tests. No login requested.\n',
  );
  const sandbox = await mkdtemp(join(tmpdir(), 'committer-upgrade-handoff-'));
  let upgraded;
  let running;
  try {
    const executable = join(sandbox, 'committer-insights.exe');
    await copyFile(join(root, 'release/committer-insights.exe'), executable);
    const checksum = createHash('sha256')
      .update(await readFile(executable))
      .digest('hex');
    const result = await build({
      ...executableBundleOptions('synthetic-client'),
      entryPoints: [join(root, 'api/src/release-updater.ts')],
      write: false,
      logLevel: 'silent',
    });
    const module = { exports: {} };
    let ready;
    let announceLaunch;
    const launched = new Promise((resolveLaunch) => {
      announceLaunch = resolveLaunch;
    });
    runInNewContext(result.outputFiles[0].text, {
      module,
      exports: module.exports,
      __filename: join(root, 'build/upgrade-handoff.cjs'),
      process,
      Buffer,
      require: (name) =>
        name === 'node:child_process'
          ? {
              ...require(name),
              spawn: (command, args, options) => {
                assert.equal(options.detached, false);
                assert.equal(options.windowsHide, false);
                assert.equal(options.stdio, 'inherit');
                upgraded = require(name).spawn(command, args, {
                  ...options,
                  stdio: ['ignore', 'pipe', 'pipe'],
                  env: {
                    ...options.env,
                    LOCALAPPDATA: sandbox,
                    COMMITTER_INSIGHTS_NO_BROWSER: 'true',
                  },
                });
                ready = new Promise((resolveReady, reject) => {
                  const timer = setTimeout(
                    () => reject(new Error('Upgrade startup timed out.')),
                    20000,
                  );
                  let output = '';
                  upgraded.once('error', (error) => {
                    clearTimeout(timer);
                    reject(error);
                  });
                  upgraded.once('exit', () => {
                    clearTimeout(timer);
                    reject(new Error('Upgrade exited before serving the application.'));
                  });
                  upgraded.stdout.on('data', (chunk) => {
                    output += chunk.toString();
                    const match = output.match(
                      /http:\/\/127\.0\.0\.1:\d+\/#session=[A-Za-z0-9_-]+/,
                    );
                    if (match) {
                      clearTimeout(timer);
                      resolveReady(new URL(match[0]));
                    }
                  });
                });
                announceLaunch();
                return upgraded;
              },
            }
          : require(name),
    });
    let finished = false;
    running = module.exports
      .startVerifiedRelease({ path: executable, checksum }, ['--timezone', 'UTC'])
      .then(
        () => {
          finished = true;
          return null;
        },
        (error) => {
          finished = true;
          return error;
        },
      );
    await Promise.race([launched, running]);
    assert.ok(ready, 'The verified upgraded process must start.');
    const url = await ready;
    const response = await fetch(`${url.origin}/api/session`, {
      headers: { Authorization: `Bearer ${new URLSearchParams(url.hash.slice(1)).get('session')}` },
      signal: globalThis.AbortSignal.timeout(5000),
    });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).authenticated, false);
    assert.equal(finished, false, 'Launcher must remain alive while the upgraded app is serving.');
    upgraded.kill();
    assert.match((await running)?.message ?? '', /Upgraded application exited with/);
    process.stdout.write(
      'Packaged upgrade handoff passed: relocated app served, launcher waited, abnormal exit reported; no login requested.\n',
    );
  } finally {
    if (upgraded && upgraded.exitCode === null && upgraded.signalCode === null) upgraded.kill();
    if (running) await running;
    await rm(sandbox, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}
