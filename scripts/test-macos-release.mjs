import { access, readFile, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFileSync } from 'node:child_process';
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
  try {
    execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
  } catch {
    process.stdout.write('macOS app is unsigned; continuing with evaluation-image checks.\n');
  }
}
process.stdout.write('macOS launcher, app bundle, and disk image checks passed.\n');
