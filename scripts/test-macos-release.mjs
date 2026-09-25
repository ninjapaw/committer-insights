import { access, stat } from 'node:fs/promises';
import { constants } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join, resolve } from 'node:path';
import { PRODUCT } from '../packages/metadata/dist/index.js';

const root = resolve('.');
const executable = join(root, 'release', PRODUCT.executableName);
const app = join(root, 'release', `${PRODUCT.displayName}.app`);
const appExecutable = join(app, 'Contents', 'MacOS', PRODUCT.executableName);

await access(executable, constants.X_OK);
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
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
}
process.stdout.write('macOS launcher and optional signed app bundle checks passed.\n');
