import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { lstat, mkdir, mkdtemp, readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getAsset, isSea } from 'node:sea';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const execute = promisify(execFile);
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
let preparation: Promise<string> | undefined;
let preparedExecutable: string | undefined;

export async function prepareAzureCli(onProgress?: (message: string) => void): Promise<void> {
  if (process.platform !== 'win32' || !isSea()) return;
  preparation ??= resolveAzureCli(AbortSignal.timeout(600000), onProgress);
  preparedExecutable = await preparation;
}

export function getPreparedAzureCli(): string {
  if (process.platform !== 'win32') return 'az';
  if (!isSea())
    throw new Error('Bundled Azure CLI sign-in requires the Windows x64 packaged application.');
  if (!preparedExecutable)
    throw new Error('Microsoft sign-in runtime is unavailable. Restart the app to prepare it.');
  return preparedExecutable;
}

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

async function verify(
  directory: string,
  files: Record<string, string>,
  signal?: AbortSignal,
  onProgress?: (message: string) => void,
): Promise<void> {
  const seen = new Set<string>();
  const total = Object.keys(files).length;
  const report = () =>
    onProgress?.(`Verifying Microsoft sign-in runtime: ${seen.size} of ${total} files...`);
  signal?.throwIfAborted();
  report();
  async function visit(relative: string) {
    signal?.throwIfAborted();
    if (!(await lstat(join(directory, relative))).isDirectory())
      throw new Error('Invalid Azure CLI directory.');
    for (const entry of await readdir(join(directory, relative), { withFileTypes: true })) {
      signal?.throwIfAborted();
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await visit(name);
      else if (
        !entry.isFile() ||
        !files[name] ||
        digest(await readFile(join(directory, name), { signal })) !== files[name]
      ) {
        throw new Error(
          'Azure CLI cache failed integrity verification. Remove its versioned tool cache and restart.',
        );
      } else {
        seen.add(name);
        // Batch UI updates, but hash every file before allowing the CLI to run.
        if (seen.size % 128 === 0) report();
      }
    }
  }
  await visit('');
  signal?.throwIfAborted();
  if (seen.size !== total) throw new Error('Azure CLI runtime files are missing.');
  report();
}

export async function resolveAzureCli(
  signal?: AbortSignal,
  onProgress?: (message: string) => void,
): Promise<string> {
  signal?.throwIfAborted();
  if (process.platform !== 'win32') return 'az';
  if (!isSea())
    throw new Error('Bundled Azure CLI sign-in requires the Windows x64 packaged application.');
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
    signal?.throwIfAborted();
    onProgress?.('Checking bundled Microsoft sign-in archive...');
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
      onProgress?.('Extracting Microsoft sign-in runtime...');
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
      await verify(runtime, manifest.files, signal, onProgress);
      onProgress?.('Publishing verified Microsoft sign-in runtime...');
      for (let attempt = 0; ; attempt++) {
        signal?.throwIfAborted();
        try {
          await rename(runtime, directory);
          break;
        } catch (error) {
          const code = (error as NodeJS.ErrnoException).code;
          if (!['EEXIST', 'ENOTEMPTY', 'EPERM', 'EACCES', 'EBUSY'].includes(code ?? ''))
            throw error;
          const destination = await lstat(directory).catch((lookupError: NodeJS.ErrnoException) => {
            if (lookupError.code !== 'ENOENT') throw lookupError;
            return undefined;
          });
          if (destination) {
            await verify(directory, manifest.files, signal, onProgress);
            break;
          }
          if (attempt >= 9) throw error;
          await delay(500, undefined, { signal });
        }
      }
    } finally {
      // Cancellation must still remove app-owned extraction files.
      onProgress?.('Cleaning up Microsoft sign-in extraction files...');
      await rm(staging, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
    }
  }
  signal?.throwIfAborted();
  await verify(directory, manifest.files, signal, onProgress);
  return join(directory, 'python.exe');
}
