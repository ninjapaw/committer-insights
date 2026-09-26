#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const rootDirectory = dirname(fileURLToPath(new URL('..', import.meta.url)));
const releaseDirectory = join(rootDirectory, 'release');
const bundlePath = join(releaseDirectory, 'developer-usage-insights.cjs');
const seaConfigPath = join(releaseDirectory, 'sea-config.json');
const blobPath = join(releaseDirectory, 'sea-prep.blob');
const executablePath = join(
  releaseDirectory,
  process.platform === 'win32' ? 'developer-usage-insights.exe' : 'developer-usage-insights',
);

await rm(releaseDirectory, { recursive: true, force: true });
await mkdir(releaseDirectory, { recursive: true });

const esbuild = require('esbuild');
await esbuild.build({
  entryPoints: [join(rootDirectory, 'api', 'src', 'local-main.ts')],
  outfile: bundlePath,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  target: 'node22',
  external: [],
  logLevel: 'info',
});

const assetsSource = join(rootDirectory, 'app', 'dist');
const assetsTarget = join(releaseDirectory, 'app-dist');
await rm(assetsTarget, { recursive: true, force: true });
await mkdir(assetsTarget, { recursive: true });
const { cp } = await import('node:fs/promises');
await cp(assetsSource, assetsTarget, { recursive: true });

await writeFile(
  seaConfigPath,
  JSON.stringify(
    {
      main: bundlePath,
      output: blobPath,
      disableExperimentalSEAWarning: true,
    },
    null,
    2,
  ),
);

execFileSync(process.execPath, ['--experimental-sea-config', seaConfigPath], { stdio: 'inherit' });
await copyFile(process.execPath, executablePath);

// A universal (multi-architecture) Node binary contains the SEA sentinel once per
// architecture slice, which makes postject reject it as ambiguous. Thin it down to the
// host architecture before injection so the sentinel appears exactly once.
if (process.platform === 'darwin') {
  try {
    const lipoArch = process.arch === 'x64' ? 'x86_64' : process.arch;
    const architectures = execFileSync('lipo', ['-archs', executablePath], {
      encoding: 'utf8',
    }).trim();
    if (architectures.includes(' ')) {
      execFileSync('lipo', ['-thin', lipoArch, executablePath, '-output', executablePath], {
        stdio: 'inherit',
      });
    }
  } catch {
    process.stderr.write('lipo was not found or failed; continuing with the copied Node binary.\n');
  }
}

// SEA injection changes the binary, so release signing must happen after this build step.
if (process.platform === 'win32') {
  try {
    execFileSync('signtool', ['sign', '/fd', 'SHA256', '/a', executablePath], { stdio: 'inherit' });
  } catch {
    process.stderr.write('signtool not available or signing failed; shipping unsigned executable.\n');
  }
}
