import assert from 'node:assert/strict';
import { Buffer } from 'node:buffer';
import { createRequire } from 'node:module';
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
