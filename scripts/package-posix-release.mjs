import { chmod, cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { PRODUCT } from '../packages/metadata/dist/index.js';

const root = resolve('.');
const release = join(root, 'release');
const executable = join(release, PRODUCT.executableName);
const platform = process.platform;
const architecture = process.arch;
const archiveName = `${PRODUCT.slug}-${platform}-${architecture}.tar.gz`;
const archive = join(release, archiveName);
const archiveEntries = [PRODUCT.executableName, 'PLATFORM-REQUIREMENTS.txt'];

await chmod(executable, 0o755);
if (platform === 'linux') {
  const launcher = join(root, 'scripts', 'run-developer-usage-insights.sh');
  await cp(launcher, join(release, 'run-developer-usage-insights.sh'));
  await chmod(join(release, 'run-developer-usage-insights.sh'), 0o755);
  archiveEntries.push('run-developer-usage-insights.sh');
}
if (platform === 'darwin') {
  const appRoot = join(release, `${PRODUCT.displayName}.app`);
  await mkdir(join(appRoot, 'Contents', 'MacOS'), { recursive: true });
  await mkdir(join(appRoot, 'Contents', 'Resources', 'app'), { recursive: true });
  await cp(join(root, 'app', 'dist'), join(appRoot, 'Contents', 'Resources', 'app'), {
    recursive: true,
  });
  await cp(
    join(root, 'build', `${PRODUCT.executableName}.cjs`),
    join(appRoot, 'Contents', 'Resources', `${PRODUCT.executableName}.cjs`),
  );
  const iconset = join(root, 'build', `${PRODUCT.iconName}.iconset`);
  const iconPath = join(appRoot, 'Contents', 'Resources', `${PRODUCT.iconName}.icns`);
  execFileSync(process.execPath, [join(root, 'scripts', 'generate-macos-icon.mjs'), iconset], {
    stdio: 'inherit',
  });
  execFileSync('iconutil', ['--convert', 'icns', '--output', iconPath, iconset], {
    stdio: 'inherit',
  });
  await rm(iconset, { recursive: true, force: true });
  const launcher = join(appRoot, 'Contents', 'MacOS', PRODUCT.executableName);
  await writeFile(
    launcher,
    `#!/bin/sh\nset -eu\nRESOURCE_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../Resources" && pwd)"\ncd "$RESOURCE_DIR"\nexec /usr/bin/env node "$RESOURCE_DIR/${PRODUCT.executableName}.cjs" "$@"\n`,
  );
  await chmod(launcher, 0o755);
  await writeFile(
    join(appRoot, 'Contents', 'Info.plist'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>CFBundleDisplayName</key><string>${PRODUCT.displayName}</string><key>CFBundleExecutable</key><string>${PRODUCT.executableName}</string><key>CFBundleIdentifier</key><string>${PRODUCT.bundleIdentifier}</string><key>CFBundleIconFile</key><string>${PRODUCT.iconName}.icns</string><key>CFBundleName</key><string>${PRODUCT.shortName}</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>${PRODUCT.version}</string><key>CFBundleShortVersionString</key><string>${PRODUCT.version}</string></dict></plist>\n`,
  );
  if (process.env.MACOS_SIGNING_IDENTITY) {
    execFileSync(
      'codesign',
      [
        '--force',
        '--deep',
        '--options',
        'runtime',
        '--timestamp',
        '--sign',
        process.env.MACOS_SIGNING_IDENTITY,
        appRoot,
      ],
      { stdio: 'inherit' },
    );
    execFileSync('codesign', ['--verify', '--deep', '--strict', appRoot], {
      stdio: 'inherit',
    });
    archiveEntries.push(`${PRODUCT.displayName}.app`);
  } else {
    await rm(appRoot, { recursive: true, force: true });
  }
  await writeFile(
    executable,
    `#!/bin/sh\nset -eu\nROOT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"\nexec /usr/bin/env node "$ROOT_DIR/${PRODUCT.executableName}.cjs" "$@"\n`,
  );
  await cp(
    join(root, 'build', `${PRODUCT.executableName}.cjs`),
    join(release, `${PRODUCT.executableName}.cjs`),
  );
  await chmod(executable, 0o755);
  archiveEntries.push(`${PRODUCT.executableName}.cjs`);
}
await writeFile(
  join(release, 'PLATFORM-REQUIREMENTS.txt'),
  `${PRODUCT.displayName}\n\nPlatform: ${platform}\nArchitecture: ${architecture}\n\nRequired for provider sign-in:\n- ${platform === 'darwin' ? 'Node.js must be installed and available on PATH for the macOS app wrapper.' : 'Node.js is bundled in this executable.'}\n- Azure CLI (az) must be installed and available on PATH for Microsoft sign-in.\n- GitHub CLI (gh) must be installed and available on PATH for GitHub sign-in.\n\nThe application, local report server, exports, and report data remain bundled/local.\n`,
);
execFileSync('tar', ['-czf', archive, '-C', release, ...archiveEntries], {
  stdio: 'inherit',
});
const digest = createHash('sha256')
  .update(await readFile(archive))
  .digest('hex');
await writeFile(join(release, `${archiveName}.sha256`), `${digest}  ${archiveName}\n`);
process.stdout.write(`Packaged ${archive}\n`);
