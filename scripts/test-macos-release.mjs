import { access, mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFileSync, spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { PRODUCT } from '../packages/metadata/dist/index.js';

// Starting the bundle and fetching its home page is the only check that proves the packaged web
// assets are both present and reachable. Structural checks alone missed a bundle that shipped an
// empty Resources directory and failed at runtime with an unhelpful error.
async function assertServesWebApp(launcher) {
  const child = spawn(launcher, ['--skip-update-check'], {
    env: { ...process.env, DEVELOPER_USAGE_INSIGHTS_NO_BROWSER: 'true' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stdout.on('data', (chunk) => (output += chunk));
  child.stderr.on('data', (chunk) => (output += chunk));
  try {
    const deadline = Date.now() + 90_000;
    let url;
    while (!url && Date.now() < deadline) {
      if (child.exitCode !== null)
        throw new Error(`Packaged app exited before serving:\n${output}`);
      url = /http:\/\/127\.0\.0\.1:\d+/.exec(output)?.[0];
      if (!url) await new Promise((wait) => setTimeout(wait, 500));
    }
    if (!url) throw new Error(`Packaged app did not report a local URL:\n${output}`);
    const home = await fetch(`${url}/`);
    const body = await home.text();
    if (!home.ok) throw new Error(`Packaged app served ${home.status} for /:\n${body}`);
    if (!body.includes('<div id="root"'))
      throw new Error(`Packaged app served no web app:\n${body}`);
    const asset = /\/assets\/[\w.-]+\.js/.exec(body)?.[0];
    if (!asset) throw new Error(`Packaged app home page references no bundled script:\n${body}`);
    const script = await fetch(`${url}${asset}`);
    if (!script.ok) throw new Error(`Packaged app served ${script.status} for ${asset}.`);
  } finally {
    child.kill('SIGTERM');
  }
}

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
  await access(join(app, 'Contents', 'Resources', 'app', 'index.html'), constants.R_OK);
  const appHelp = execFileSync(appExecutable, ['--help'], { encoding: 'utf8' });
  if (!appHelp.includes('--timezone <IANA timezone>'))
    throw new Error('macOS app bundle launcher did not start the application.');
  await assertServesWebApp(appExecutable);
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
  await access(join(shippedApp, 'Contents', 'Resources', 'app', 'index.html'), constants.R_OK);
  execFileSync('codesign', ['--verify', '--deep', '--strict', shippedApp], { stdio: 'inherit' });
  await assertServesWebApp(join(shippedApp, 'Contents', 'MacOS', PRODUCT.executableName));
} finally {
  try {
    execFileSync('hdiutil', ['detach', mountPoint, '-force'], { stdio: 'pipe' });
  } catch {
    // The image never attached, or macOS already released the mount point.
  }
  await rm(mountPoint, { recursive: true, force: true });
}
process.stdout.write('macOS launcher, app bundle, and disk image checks passed.\n');
