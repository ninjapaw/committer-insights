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
await access(appExecutable, constants.X_OK);
if (!(await stat(app)).isDirectory()) throw new Error('macOS app bundle is missing.');
const fileInfo = execFileSync('file', [executable], { encoding: 'utf8' });
if (!fileInfo.includes('Mach-O') || !fileInfo.includes('arm64'))
  throw new Error(`Unexpected macOS executable format: ${fileInfo.trim()}`);
execFileSync('codesign', ['--verify', '--verbose=4', executable], { stdio: 'inherit' });
execFileSync('codesign', ['--verify', '--deep', '--verbose=4', app], { stdio: 'inherit' });
process.stdout.write('macOS native executable and app bundle integrity checks passed.\n');
