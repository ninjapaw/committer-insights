import { createHash } from 'node:crypto';
import {
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getAsset, isSea } from 'node:sea';

function digest(bytes: Buffer): string {
  return createHash('sha256').update(bytes).digest('hex');
}

function matches(path: string, sha256: string): boolean {
  try {
    return lstatSync(path).isFile() && digest(readFileSync(path)) === sha256;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

export function resolveGitHubCli(): string {
  if (!isSea()) return 'gh';
  if (process.platform !== 'win32') return 'gh';
  const manifest = JSON.parse(getAsset('github-cli/manifest.json', 'utf8')) as {
    version: string;
    sha256: string;
    architecture: string;
  };
  if (
    !/^\d+\.\d+\.\d+$/.test(manifest.version) ||
    !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
    manifest.architecture !== process.arch
  ) {
    throw new Error(
      'Bundled GitHub CLI metadata is invalid. Download a fresh application release.',
    );
  }
  const root = join(
    process.env.LOCALAPPDATA || join(homedir(), 'AppData', 'Local'),
    'CommitterInsights',
    'tools',
    'github-cli',
  );
  mkdirSync(root, { recursive: true, mode: 0o700 });
  if (!lstatSync(root).isDirectory()) throw new Error('Invalid GitHub CLI cache directory.');
  const directory = join(root, `${manifest.version}-${manifest.sha256}`);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  if (!lstatSync(directory).isDirectory()) throw new Error('Invalid GitHub CLI version directory.');
  const executable = join(directory, 'gh.exe');
  if (!matches(executable, manifest.sha256)) {
    const binary = Buffer.from(getAsset('github-cli/gh.exe'));
    if (digest(binary) !== manifest.sha256)
      throw new Error('Bundled GitHub CLI failed integrity verification.');
    const staging = mkdtempSync(join(directory, 'extract-'));
    try {
      const temporary = join(staging, 'gh.exe');
      writeFileSync(temporary, binary, { flag: 'wx', mode: 0o700 });
      try {
        renameSync(temporary, executable);
      } catch (error) {
        if (!matches(executable, manifest.sha256)) throw error;
      }
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }
  }
  const license = Buffer.from(getAsset('github-cli/LICENSE', 'utf8'));
  const licensePath = join(directory, 'LICENSE');
  if (!matches(licensePath, digest(license))) {
    const staging = mkdtempSync(join(directory, 'notice-'));
    try {
      const temporary = join(staging, 'LICENSE');
      writeFileSync(temporary, license, { flag: 'wx', mode: 0o600 });
      try {
        renameSync(temporary, licensePath);
      } catch (error) {
        if (!matches(licensePath, digest(license))) throw error;
      }
    } finally {
      rmSync(staging, { recursive: true, force: true });
    }
  }
  if (!matches(executable, manifest.sha256))
    throw new Error('Cached GitHub CLI failed integrity verification.');
  return executable;
}
