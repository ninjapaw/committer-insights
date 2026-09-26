import { access, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PRODUCT } from '../packages/metadata/dist/index.js';

const root = resolve('.');
const executable = join(root, 'release', PRODUCT.executableName);
const app = join(root, 'release', `${PRODUCT.displayName}.app`);
const appExecutable = join(app, 'Contents', 'MacOS', PRODUCT.executableName);
const diskImage = join(root, 'release', `${PRODUCT.slug}-darwin-${process.arch}.dmg`);

await access(executable, constants.X_OK);
await access(diskImage, constants.R_OK);
execFileSync('hdiutil', ['imageinfo', diskImage], { stdio: 'inherit' });
const help = execFileSync(executable, ['--help'], { encoding: 'utf8' });
if (!help.includes('--timezone <IANA timezone>'))
  throw new Error('macOS launcher did not launch the bundled application.');
if (
  await stat(app).then(
    () => true,
    () => false,
  )
) {
  await access(appExecutable, constants.X_OK);
  const executableInfo = execFileSync('file', [appExecutable], { encoding: 'utf8' });
  if (!executableInfo.includes('Mach-O'))
    throw new Error(`macOS app launcher is not a native executable: ${executableInfo.trim()}`);
  const plist = join(app, 'Contents', 'Info.plist');
  await access(plist, constants.R_OK);
  const plistText = await readFile(plist, 'utf8');
  for (const value of [
    PRODUCT.displayName,
    PRODUCT.shortName,
    PRODUCT.version,
    PRODUCT.bundleIdentifier,
    `${PRODUCT.iconName}.icns`,
  ]) {
    if (!plistText.includes(`<string>${value}</string>`))
      throw new Error(`macOS app metadata is missing ${value}.`);
  }
  await access(join(app, 'Contents', 'Resources', `${PRODUCT.iconName}.icns`), constants.R_OK);
  const appHelp = execFileSync(appExecutable, ['--help'], { encoding: 'utf8' });
  if (!appHelp.includes('--timezone <IANA timezone>'))
    throw new Error('macOS app bundle launcher did not start the application.');
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
}
// Customers receive the copy inside the disk image, not the staging bundle above. Staging copies
// that resolve symlinks break the signature seal, and macOS then reports the app as damaged, so
// verify the shipped bundle directly.
// hdiutil refuses mount points on secondary volumes, so stage the mount under the system temp
// directory rather than inside the checkout.
const mountPoint = await mkdtemp(join(tmpdir(), `${PRODUCT.slug}-dmg-verify-`));
try {
  execFileSync(
    'hdiutil',
    ['attach', diskImage, '-nobrowse', '-readonly', '-mountpoint', mountPoint],
    { stdio: 'inherit' },
  );
  const shippedApp = join(mountPoint, `${PRODUCT.displayName}.app`);
  // The ';' terminating -exec is passed as its own literal argument. execFileSync runs find
  // directly with no shell, so it must not be escaped the way '\;' is written in a shell.
  const brokenSymlinks = execFileSync(
    'find',
    [shippedApp, '-type', 'l', '!', '-exec', 'test', '-e', '{}', ';', '-print'],
    { encoding: 'utf8' },
  ).trim();
  if (brokenSymlinks) throw new Error(`Disk image contains broken symlinks:\n${brokenSymlinks}`);
  execFileSync('codesign', ['--verify', '--deep', '--strict', shippedApp], { stdio: 'inherit' });
} finally {
  try {
    execFileSync('hdiutil', ['detach', mountPoint, '-force'], { stdio: 'pipe' });
  } catch {
    // The image never attached, or macOS already released the mount point.
  }
  await rm(mountPoint, { recursive: true, force: true });
}
process.stdout.write('macOS launcher, app bundle, and disk image checks passed.\n');
