import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import {
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  readlink,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { getAsset, isSea } from 'node:sea';
import { promisify } from 'node:util';
import { setTimeout as delay } from 'node:timers/promises';

const execute = promisify(execFile);
const digest = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
let preparation: Promise<string> | undefined;
let preparedExecutable: string | undefined;

// Both platforms ship a reduced, verified Python + Azure CLI runtime bundled into the
// packaged app (see scripts/bundle-azure-cli.mjs); Linux has no equivalent bundle yet and
// keeps relying on a system-installed 'az' resolved via PATH.
const BUNDLED_PLATFORMS = new Set(['win32', 'darwin']);
const isBundledPlatform = () => BUNDLED_PLATFORMS.has(process.platform);

// The macOS .app bundle (see scripts/package-posix-release.mjs) runs as a plain Node
// process rather than a Node single-executable application, so 'node:sea' assets are
// never available there. Its launcher instead extracts the reduced Azure CLI runtime
// directly into Contents/Resources and points at it with this trusted environment
// variable, mirroring DEVELOPER_USAGE_INSIGHTS_GH_PATH for the GitHub CLI: the app
// bundle's code signature vouches for the contents, so no extra hash verification
// happens here.
const AZURE_CLI_HOME_ENV_VAR = 'DEVELOPER_USAGE_INSIGHTS_AZ_HOME';

function directAzureCliHome(): string | undefined {
  return process.platform === 'darwin' ? process.env[AZURE_CLI_HOME_ENV_VAR] : undefined;
}

function bundledPythonPath(home: string): string {
  return join(home, process.platform === 'win32' ? 'python.exe' : 'bin/python3');
}

// Whether Azure CLI must be invoked as 'python3 -m azure.cli' instead of a bare 'az'
// launcher. Exported so azure-cli-sign-in.ts can pick the right argument shape without
// duplicating the SEA/env-var checks below.
export function isBundledAzureCliRuntime(): boolean {
  return (
    process.platform === 'win32' ||
    (process.platform === 'darwin' && (isSea() || Boolean(directAzureCliHome())))
  );
}

export async function prepareAzureCli(onProgress?: (message: string) => void): Promise<void> {
  if (!isBundledPlatform()) return;
  const home = directAzureCliHome();
  if (home) {
    preparedExecutable = bundledPythonPath(home);
    return;
  }
  if (!isSea()) return;
  preparation ??= resolveAzureCli(AbortSignal.timeout(600000), onProgress);
  preparedExecutable = await preparation;
}

export function getPreparedAzureCli(): string {
  if (!isBundledPlatform()) return 'az';
  const home = directAzureCliHome();
  if (home) return bundledPythonPath(home);
  if (!isSea()) throw new Error('Bundled Azure CLI sign-in requires the packaged application.');
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

// macOS runtimes retain a handful of symlinks (e.g. bin/python3 -> python3.11); the manifest
// records those as "symlink:<target>" instead of a content hash. The target itself is
// path-validated with the same rules as any other manifest entry.
function isValidManifestValue(value: string): boolean {
  if (/^[a-f0-9]{64}$/.test(value)) return true;
  if (value.startsWith('symlink:')) return safePath(value.slice('symlink:'.length));
  return false;
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
      if (entry.isDirectory()) {
        await visit(name);
        continue;
      }
      const expected = files[name];
      const matches = expected?.startsWith('symlink:')
        ? entry.isSymbolicLink() &&
          (await readlink(join(directory, name))) === expected.slice('symlink:'.length)
        : Boolean(expected) &&
          entry.isFile() &&
          digest(await readFile(join(directory, name), { signal })) === expected;
      if (!matches) {
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
  if (!isBundledPlatform()) return 'az';
  const home = directAzureCliHome();
  if (home) return bundledPythonPath(home);
  if (!isSea()) throw new Error('Bundled Azure CLI sign-in requires the packaged application.');
  const windows = process.platform === 'win32';
  const manifest = JSON.parse(getAsset('azure-cli/manifest.json', 'utf8')) as {
    version: string;
    sha256: string;
    architecture: string;
    files: Record<string, string>;
  };
  const requiredFiles = windows ? ['python.exe', 'bin/az.cmd'] : ['bin/python3', 'bin/az'];
  const validArch = windows
    ? process.arch === 'x64'
    : process.arch === 'x64' || process.arch === 'arm64';
  if (
    !/^\d+\.\d+\.\d+$/.test(manifest.version) ||
    !/^[a-f0-9]{64}$/.test(manifest.sha256) ||
    manifest.architecture !== process.arch ||
    !validArch ||
    !manifest.files ||
    Object.keys(manifest.files).length > 25000 ||
    requiredFiles.some((required) => !manifest.files[required]) ||
    Object.entries(manifest.files).some(
      ([name, value]) => !safePath(name) || !isValidManifestValue(value),
    )
  ) {
    throw new Error('Invalid bundled Azure CLI metadata.');
  }
  const root = windows
    ? join(
        process.env.LOCALAPPDATA || join(homedir(), 'AppData/Local'),
        'CommitterInsights/tools/azure-cli',
      )
    : join(homedir(), 'Library/Application Support/CommitterInsights/tools/azure-cli');
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
      const extractorPath = join(staging, windows ? 'extract.ps1' : 'extract.sh');
      const runtime = join(staging, 'runtime');
      await mkdir(runtime, { mode: 0o700 });
      await writeFile(archivePath, archive, { flag: 'wx', mode: 0o600 });
      await writeFile(
        extractorPath,
        getAsset(windows ? 'azure-cli/extract.ps1' : 'azure-cli/extract.sh', 'utf8'),
        { flag: 'wx', mode: windows ? 0o600 : 0o700 },
      );
      onProgress?.('Extracting Microsoft sign-in runtime...');
      const extractionEnv = {
        ...process.env,
        COMMITTER_AZ_ARCHIVE: archivePath,
        COMMITTER_AZ_OUTPUT: runtime,
      };
      if (windows) {
        await execute(
          join(
            process.env.SystemRoot || 'C:\\Windows',
            'System32/WindowsPowerShell/v1.0/powershell.exe',
          ),
          ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', extractorPath],
          {
            env: extractionEnv,
            windowsHide: true,
            timeout: 180000,
            maxBuffer: 1024 * 1024,
            signal,
          },
        );
      } else {
        await execute('/bin/sh', [extractorPath], {
          env: extractionEnv,
          timeout: 180000,
          maxBuffer: 1024 * 1024,
          signal,
        });
      }
      await verify(runtime, manifest.files, signal, onProgress);
      onProgress?.('Publishing verified Microsoft sign-in runtime...');
      // The cache directory is keyed by version and archive hash, so a second app instance
      // racing to publish the same runtime is a success, not a conflict: if the rename loses,
      // verify whatever landed there and adopt it instead of extracting again.
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
  // Deliberately re-verified on every resolve, including immediately after a fresh extract.
  // The cache lives in a user-writable directory, so its contents are only trustworthy as of
  // the moment they are hashed; nothing may execute from it without a current check.
  await verify(directory, manifest.files, signal, onProgress);
  return join(directory, windows ? 'python.exe' : 'bin/python3');
}
