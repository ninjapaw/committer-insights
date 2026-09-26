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
  await cp(process.execPath, join(appRoot, 'Contents', 'Resources', 'node'));
  await chmod(join(appRoot, 'Contents', 'Resources', 'node'), 0o755);
  const bundledGitHubCli = join(root, 'build', 'github-cli', 'gh');
  await cp(bundledGitHubCli, join(appRoot, 'Contents', 'Resources', 'gh'));
  await chmod(join(appRoot, 'Contents', 'Resources', 'gh'), 0o755);
  const bundledAzureCli = join(root, 'build', 'azure-cli', 'reduced');
  await cp(bundledAzureCli, join(appRoot, 'Contents', 'Resources', 'azure-cli'), {
    recursive: true,
    verbatimSymlinks: true,
  });
  await chmod(join(appRoot, 'Contents', 'Resources', 'azure-cli', 'bin', 'python3'), 0o755);
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
  execFileSync(
    'clang',
    [
      '-O2',
      '-Wall',
      '-Wextra',
      '-Werror',
      join(root, 'scripts', 'macos-launcher.c'),
      '-o',
      launcher,
    ],
    { stdio: 'inherit' },
  );
  await writeFile(
    join(appRoot, 'Contents', 'Info.plist'),
    // LSUIElement (agent app) hides the launcher stub itself from the Dock/Cmd+Tab switcher.
    // This app has no native window and never links against AppKit, so without LSUIElement the
    // Dock treats it as a stalled GUI launch and bounces the icon forever waiting for a
    // window-server handshake that will never arrive. The visible UI is instead a Terminal
    // window the launcher opens to run the server (see macos-launcher.c); closing that window
    // quits the server along with it.
    `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>CFBundleDisplayName</key><string>${PRODUCT.displayName}</string><key>CFBundleExecutable</key><string>${PRODUCT.executableName}</string><key>CFBundleIdentifier</key><string>${PRODUCT.bundleIdentifier}</string><key>CFBundleIconFile</key><string>${PRODUCT.iconName}.icns</string><key>CFBundleName</key><string>${PRODUCT.shortName}</string><key>CFBundlePackageType</key><string>APPL</string><key>CFBundleVersion</key><string>${PRODUCT.version}</string><key>CFBundleShortVersionString</key><string>${PRODUCT.version}</string><key>LSUIElement</key><true/></dict></plist>\n`,
  );
  const signingIdentity = process.env.MACOS_SIGNING_IDENTITY || '-';
  const signingOptions = ['--force', '--deep', '--options', 'runtime', '--sign', signingIdentity];
  if (signingIdentity === '-') signingOptions.push('--timestamp=none');
  else signingOptions.push('--timestamp');
  execFileSync('codesign', [...signingOptions, appRoot], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', appRoot], {
    stdio: 'inherit',
  });
  if (signingIdentity === '-')
    process.stderr.write(
      'Using an ad-hoc signature; Apple notarization is required for Gatekeeper trust.\n',
    );
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
  `${PRODUCT.displayName}\n\nPlatform: ${platform}\nArchitecture: ${architecture}\n\nRequired for provider sign-in:\n- ${platform === 'darwin' ? 'Node.js is bundled in this app.' : 'Node.js is bundled in this executable.'}\n- ${platform === 'darwin' ? 'GitHub CLI (gh) is bundled in the app.' : 'GitHub CLI (gh) must be installed and available on PATH for GitHub sign-in.'}\n- ${platform === 'darwin' ? 'Azure CLI (az) is bundled in the app.' : 'Azure CLI (az) must be installed and available on PATH for Microsoft sign-in.'}\n\nThe application, local report server, exports, and report data remain bundled/local.\n`,
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
  if (process.env.APPLE_ID && process.env.APPLE_TEAM_ID && process.env.APPLE_APP_PASSWORD) {
    execFileSync(
      'xcrun',
      [
        'notarytool',
        'submit',
        archive,
        '--apple-id',
        process.env.APPLE_ID,
        '--team-id',
        process.env.APPLE_TEAM_ID,
        '--password',
        process.env.APPLE_APP_PASSWORD,
        '--wait',
      ],
      { stdio: 'inherit' },
    );
  } else if (process.env.MACOS_SIGNING_IDENTITY) {
    process.stderr.write(
      'Developer ID signing is enabled, but notarization credentials are missing; Gatekeeper approval is not asserted.\n',
    );
  }
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
