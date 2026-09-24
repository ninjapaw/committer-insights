import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getAsset, isSea } from 'node:sea';
import { promisify } from 'node:util';

const execute = promisify(execFile);
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');

function safePath(name: string): boolean {
  return (
    !/[\\:<>"|?*]/.test(name) &&
    !Array.from(name).some((character) => character.charCodeAt(0) < 32) &&
    name
      .split('/')
      .every(
        (part) =>
          part &&
          part !== '.' &&
          part !== '..' &&
          !/[. ]$/.test(part) &&
          !/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])(?:\.|$)/i.test(part),
      )
  );
}

async function verify(directory: string, files: Record<string, string>): Promise<void> {
  const seen = new Set<string>();
  async function visit(relative: string) {
    if (!(await lstat(join(directory, relative))).isDirectory())
      throw new Error('Invalid Azure CLI directory.');
    for (const entry of await readdir(join(directory, relative), { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await visit(name);
      else if (
        !entry.isFile() ||
        !files[name] ||
        digest(await readFile(join(directory, name))) !== files[name]
      ) {
        throw new Error(
          'Azure CLI cache failed integrity verification. Remove its versioned tool cache and restart.',
        );
      } else seen.add(name);
    }
  }
  await visit('');
  if (seen.size !== Object.keys(files).length)
    throw new Error('Azure CLI runtime files are missing.');
}

export async function resolveAzureCli(signal?: AbortSignal): Promise<string> {
  if (process.platform !== 'win32' || !isSea()) {
    throw new Error('Bundled Azure CLI sign-in requires the Windows x64 packaged application.');
  }
  const manifest = JSON.parse(getAsset('azure-cli/manifest.json', 'utf8')) as {
    version: string;
    sha256: string;
    architecture: string;
    files: Record<string, string>;
  };
  if (
    !/^\d+\.\d+\.\d+$/.test(manifest.version) ||
    !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
    manifest.architecture !== process.arch ||
    process.arch !== 'x64' ||
    !manifest.files ||
    Object.keys(manifest.files).length > 25000 ||
    !manifest.files['python.exe'] ||
    !manifest.files['bin/az.cmd'] ||
    Object.entries(manifest.files).some(
      ([name, hash]) => !safePath(name) || !/^[a-f0-9]{64}$/.test(hash),
    )
  ) {
    throw new Error('Invalid bundled Azure CLI metadata.');
  }
  const root = join(
    process.env.LOCALAPPDATA || join(homedir(), 'AppData/Local'),
    'CommitterInsights/tools/azure-cli',
  );
  await mkdir(root, { recursive: true, mode: 0o700 });
  if (!(await lstat(root)).isDirectory()) throw new Error('Invalid Azure CLI tool cache.');
  const directory = join(root, `${manifest.version}-${manifest.sha256}`);
  let exists = false;
  try {
    await lstat(directory);
    exists = true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (!exists) {
    const archive = new Uint8Array(getAsset('azure-cli/runtime.zip'));
    if (digest(archive) !== manifest.sha256)
      throw new Error('Azure CLI archive failed integrity verification.');
    const staging = await mkdtemp(join(root, 'extract-'));
    try {
      const archivePath = join(staging, 'runtime.zip');
      const extractorPath = join(staging, 'extract.ps1');
      const runtime = join(staging, 'runtime');
      await mkdir(runtime, { mode: 0o700 });
      await writeFile(archivePath, archive, { flag: 'wx', mode: 0o600 });
      await writeFile(extractorPath, getAsset('azure-cli/extract.ps1', 'utf8'), {
        flag: 'wx',
        mode: 0o600,
      });
      await execute(
        join(
          process.env.SystemRoot || 'C:\\Windows',
          'System32/WindowsPowerShell/v1.0/powershell.exe',
        ),
        ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', extractorPath],
        {
          env: { ...process.env, COMMITTER_AZ_ARCHIVE: archivePath, COMMITTER_AZ_OUTPUT: runtime },
          windowsHide: true,
          timeout: 180000,
          maxBuffer: 1024 * 1024,
          signal,
        },
      );
      await verify(runtime, manifest.files);
      try {
        await rename(runtime, directory);
      } catch (error) {
        if (!['EEXIST', 'ENOTEMPTY', 'EPERM'].includes((error as NodeJS.ErrnoException).code ?? ''))
          throw error;
        await verify(directory, manifest.files);
      }
    } finally {
      await rm(staging, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }
  signal?.throwIfAborted();
  await verify(directory, manifest.files);
  return join(directory, 'python.exe');
}
