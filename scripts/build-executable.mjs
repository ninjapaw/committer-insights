import { copyFile, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { PRODUCT } from '../packages/metadata/dist/index.js';
import { executableBundleOptions } from './executable-bundle-options.mjs';
import { bundleGitHubCli } from './bundle-github-cli.mjs';
import { bundleAzureCli } from './bundle-azure-cli.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const buildDir = join(root, 'build');
const releaseDir = join(root, 'release');
const bundlePath = join(buildDir, `${PRODUCT.executableName}.cjs`);
const blobPath = join(buildDir, `${PRODUCT.executableName}.blob`);
const executableName =
  process.platform === 'win32' ? `${PRODUCT.executableName}.exe` : PRODUCT.executableName;
const executablePath = join(releaseDir, executableName);

async function walk(directory) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await walk(path)));
    else files.push(path);
  }
  return files;
}

await rm(buildDir, { recursive: true, force: true });
await rm(releaseDir, { recursive: true, force: true });
await mkdir(buildDir, { recursive: true });
await mkdir(releaseDir, { recursive: true });

await build({
  ...executableBundleOptions(process.env.DEVELOPER_USAGE_INSIGHTS_CLIENT_ID),
  entryPoints: [join(root, 'api/src/index.ts')],
  outfile: bundlePath,
});

const appDirectory = join(root, 'app/dist');
const assets = Object.fromEntries(
  (await walk(appDirectory)).map((path) => [
    `app/${relative(appDirectory, path).replaceAll('\\', '/')}`,
    path,
  ]),
);
Object.assign(assets, await bundleGitHubCli(root, buildDir, releaseDir));
Object.assign(assets, await bundleAzureCli(root, buildDir, releaseDir));
const seaConfigPath = join(buildDir, 'sea-config.json');
await writeFile(
  seaConfigPath,
  JSON.stringify({
    main: bundlePath,
    output: blobPath,
    disableExperimentalSEAWarning: true,
    useSnapshot: false,
    useCodeCache: false,
    execArgvExtension: 'none',
    assets,
  }),
);

execFileSync(process.execPath, ['--experimental-sea-config', seaConfigPath], { stdio: 'inherit' });
await copyFile(process.execPath, executablePath);

// SEA injection changes the binary, so release signing must happen after this build step.
if (process.platform === 'win32') {
  try {
    execFileSync('signtool', ['remove', '/s', executablePath], { stdio: 'ignore' });
  } catch {
    process.stderr.write('signtool was not found; continuing with the copied Node binary.\n');
  }
}

// macOS requires the copied Node binary to be signed before postject injection and resigned afterward.
if (process.platform === 'darwin') {
  execFileSync('codesign', ['--force', '--sign', '-', '--timestamp=none', executablePath], {
    stdio: 'inherit',
  });
}

const postjectCli = join(root, 'node_modules/postject/dist/cli.js');
execFileSync(
  process.execPath,
  [
    postjectCli,
    executablePath,
    'NODE_SEA_BLOB',
    blobPath,
    '--sentinel-fuse',
    'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2',
  ],
  { stdio: 'inherit' },
);

if (process.platform === 'darwin') {
  execFileSync('codesign', ['--force', '--sign', '-', '--timestamp=none', executablePath], {
    stdio: 'inherit',
  });
}

const digest = createHash('sha256')
  .update(await readFile(executablePath))
  .digest('hex');
await writeFile(join(releaseDir, 'SHA256SUMS.txt'), `${digest}  ${executableName}\n`);
process.stdout.write(`Built ${executablePath}\n`);
