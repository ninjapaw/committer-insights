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
const archiveName =
  platform === 'darwin'
    ? `${PRODUCT.slug}-${platform}-${architecture}.dmg`
    : `${PRODUCT.slug}-${platform}-${architecture}.tar.gz`;
const archive = join(release, archiveName);
const archiveEntries = [PRODUCT.executableName, 'PLATFORM-REQUIREMENTS.txt'];
const appRoot = join(release, `${PRODUCT.displayName}.app`);

await chmod(executable, 0o755);
if (platform === 'linux') {
  const launcher = join(root, 'scripts', 'run-developer-usage-insights.sh');
  await cp(launcher, join(release, 'run-developer-usage-insights.sh'));
  await chmod(join(release, 'run-developer-usage-insights.sh'), 0o755);
  archiveEntries.push('run-developer-usage-insights.sh');
}
if (platform === 'darwin') {
  // Build the app bundle from shared metadata; signing is applied when release credentials exist.
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
    `#!/bin/sh
set -eu
RESOURCE_DIR="$(CDPATH= cd -- "$(dirname -- "$0")/../Resources" && pwd)"
NODE_BIN=""
if command -v node >/dev/null 2>&1; then
  NODE_BIN="$(command -v node)"
else
  for candidate in /opt/homebrew/bin/node /usr/local/bin/node /usr/bin/node "$HOME"/.nvm/versions/node/*/bin/node "$HOME"/.local/share/mise/installs/node/*/bin/node; do
    if [ -x "$candidate" ]; then
      NODE_BIN="$candidate"
      break
    fi
  done
fi
if [ -z "$NODE_BIN" ]; then
  /usr/bin/osascript -e 'display dialog "Node.js is required to launch Developer Usage Insights. Install Node.js 24.19.0, then try again." with title "Developer Usage Insights" buttons {"OK"} default button "OK"'
  exit 1
fi
export PATH="$(dirname "$NODE_BIN"):/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin"
cd "$RESOURCE_DIR"
exec "$NODE_BIN" "$RESOURCE_DIR/${PRODUCT.executableName}.cjs" "$@"
`,
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
  } else {
    process.stderr.write(
      'No MACOS_SIGNING_IDENTITY was supplied; creating an unsigned evaluation app image.\n',
    );
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
if (platform === 'darwin') {
  // Put the complete app bundle in the disk image so Finder launches the same metadata-rich app.
  const imageRoot = join(root, 'build', `${PRODUCT.slug}-dmg-root`);
  await rm(imageRoot, { recursive: true, force: true });
  await mkdir(imageRoot, { recursive: true });
  await cp(appRoot, join(imageRoot, `${PRODUCT.displayName}.app`), { recursive: true });
  execFileSync(
    'hdiutil',
    [
      'create',
      '-volname',
      PRODUCT.displayName,
      '-srcfolder',
      imageRoot,
      '-ov',
      '-format',
      'UDZO',
      archive,
    ],
    { stdio: 'inherit' },
  );
  await rm(imageRoot, { recursive: true, force: true });
} else {
  execFileSync('tar', ['-czf', archive, '-C', release, ...archiveEntries], {
    stdio: 'inherit',
  });
}
const digest = createHash('sha256')
  .update(await readFile(archive))
  .digest('hex');
await writeFile(join(release, `${archiveName}.sha256`), `${digest}  ${archiveName}\n`);
process.stdout.write(`Packaged ${archive}\n`);
