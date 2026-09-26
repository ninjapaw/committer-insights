import { copyFile, mkdir, mkdtemp, readdir, readlink, rm, stat, symlink } from 'node:fs/promises';
import { rmSync } from 'node:fs';
import { spawnSync, execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { tmpdir } from 'node:os';

export const reducedAzureCliVersion = '2.90.0';

export function keepAzureCliFile(name) {
  // The app only ever runs 'az login', 'az account get-access-token', and 'az version',
  // so the reduction keeps just the command modules backing those plus the SDK packages
  // they import. Adding a new 'az' invocation elsewhere in the app means extending the
  // allowlists below, or the bundled CLI will fail with ModuleNotFoundError at runtime;
  // validateReducedAzureCli() exercises those commands to catch that during the build.
  // Bundled interpreters are always invoked with -B (no bytecode writing), so
  // pre-compiled caches are pure bloat regardless of platform layout.
  if (/(^|\/)__pycache__(\/|$)/.test(name)) return false;
  if (/(^|\/)(?:licen[cs]e|notice|copying|copyright|thirdparty)[^/]*(\/|$)/i.test(name))
    return true;
  // Matched as a path suffix (not anchored to the start) so both the Windows
  // layout (Lib/site-packages/...) and the POSIX layout
  // (lib/python3.NN/site-packages/...) are handled by the same rule.
  const command = name.match(/(?:^|\/)site-packages\/azure\/cli\/command_modules\/([^/]+)\//);
  if (command) return ['profile', 'resource', 'util'].includes(command[1]);
  const management = name.match(/(?:^|\/)site-packages\/azure\/mgmt\/([^/]+)\//);
  if (management)
    return [
      'core',
      'resource',
      'subscription',
      'managementgroups',
      'imagebuilder',
      'monitor',
    ].includes(management[1]);
  const sdk = name.match(/(?:^|\/)site-packages\/azure\/([^/]+)\//);
  return !sdk || ['cli', 'common', 'core', 'mgmt', 'profiles'].includes(sdk[1]);
}

export async function reduceAzureCli(source, destination) {
  const counts = { originalFiles: 0, retainedFiles: 0, originalBytes: 0, retainedBytes: 0 };
  async function visit(relative = '') {
    for (const entry of await readdir(join(source, relative), { withFileTypes: true })) {
      const name = relative ? `${relative}/${entry.name}` : entry.name;
      if (entry.isDirectory()) await visit(name);
      else if (entry.isFile()) {
        const { size } = await stat(join(source, name));
        counts.originalFiles++;
        counts.originalBytes += size;
        if (!keepAzureCliFile(name)) continue;
        await mkdir(dirname(join(destination, name)), { recursive: true });
        await copyFile(join(source, name), join(destination, name));
        counts.retainedFiles++;
        counts.retainedBytes += size;
      } else if (entry.isSymbolicLink()) {
        // python-build-standalone's bin/ directory ships real symlinks
        // (e.g. python3 -> python3.11). Recreate them instead of copying
        // resolved content, so relative links and disk usage are preserved.
        counts.originalFiles++;
        if (!keepAzureCliFile(name)) continue;
        await mkdir(dirname(join(destination, name)), { recursive: true });
        await symlink(await readlink(join(source, name)), join(destination, name));
        counts.retainedFiles++;
      } else throw new Error('Unexpected Azure CLI runtime entry.');
    }
  }
  await mkdir(destination);
  await visit();
  return counts;
}

export function reducedAzureCliInterpreter(runtime) {
  return process.platform === 'win32' ? join(runtime, 'python.exe') : join(runtime, 'bin/python3');
}

export async function validateReducedAzureCli(root, runtime, version) {
  const config = await mkdtemp(join(tmpdir(), 'committer-cli-build-'));
  try {
    const env =
      process.platform === 'win32'
        ? {
            SystemRoot: process.env.SystemRoot,
            WINDIR: process.env.WINDIR,
            TEMP: process.env.TEMP,
            TMP: process.env.TMP,
            PATH: '',
            USERPROFILE: config,
            LOCALAPPDATA: config,
            APPDATA: config,
            AZURE_CONFIG_DIR: config,
            AZURE_EXTENSION_DIR: join(config, 'extensions'),
            AZURE_CORE_COLLECT_TELEMETRY: 'no',
            AZURE_CORE_ENABLE_BROKER_ON_WINDOWS: 'false',
            AZURE_CORE_LOGIN_EXPERIENCE_V2: 'off',
            AZURE_CORE_CHECK_VERSION: 'false',
            AZURE_EXTENSION_USE_DYNAMIC_INSTALL: 'no',
            PYTHONIOENCODING: 'utf-8',
          }
        : {
            PATH: '/usr/bin:/bin',
            TMPDIR: config,
            HOME: config,
            AZURE_CONFIG_DIR: config,
            AZURE_EXTENSION_DIR: join(config, 'extensions'),
            AZURE_CORE_COLLECT_TELEMETRY: 'no',
            AZURE_CORE_ENABLE_BROKER_ON_WINDOWS: 'false',
            AZURE_CORE_LOGIN_EXPERIENCE_V2: 'off',
            AZURE_CORE_CHECK_VERSION: 'false',
            AZURE_EXTENSION_USE_DYNAMIC_INSTALL: 'no',
            PYTHONIOENCODING: 'utf-8',
          };
    for (const args of [
      ['-m', 'azure.cli', 'version', '--output', 'json'],
      ['-m', 'azure.cli', 'login', '--help'],
      ['-m', 'azure.cli', 'account', 'get-access-token', '--help'],
      [join(root, 'scripts/test-azure-cli-runtime.py')],
    ]) {
      const result = spawnSync(reducedAzureCliInterpreter(runtime), ['-I', '-B', ...args], {
        env,
        encoding: 'utf8',
        windowsHide: true,
        timeout: 60000,
        maxBuffer: 4 * 1024 * 1024,
      });
      if (
        result.error ||
        result.status !== 0 ||
        /Error loading|Traceback|ModuleNotFoundError/i.test(result.stderr)
      )
        throw new Error(
          `Reduced Azure CLI build validation failed: ${result.stderr || result.error || args.join(' ')}`,
        );
      if (args[2] === 'version' && JSON.parse(result.stdout)['azure-cli'] !== version)
        throw new Error('Unexpected reduced Azure CLI version.');
    }
  } finally {
    await rm(config, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  }
}

export function packReducedAzureCli(runtime, archive) {
  if (process.platform === 'win32') {
    execFileSync(
      join(
        process.env.SystemRoot || 'C:\\Windows',
        'System32/WindowsPowerShell/v1.0/powershell.exe',
      ),
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `
      $ErrorActionPreference = 'Stop'
      Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
      $root = $env:COMMITTER_AZ_OUTPUT.TrimEnd('\\')
      $zip = [IO.Compression.ZipFile]::Open($env:COMMITTER_AZ_ARCHIVE, [IO.Compression.ZipArchiveMode]::Create)
      try {
        foreach ($file in (Get-ChildItem -LiteralPath $root -File -Recurse | Sort-Object FullName)) {
          $name = $file.FullName.Substring($root.Length + 1).Replace('\\', '/')
          $entry = $zip.CreateEntry($name, [IO.Compression.CompressionLevel]::Optimal)
          $entry.LastWriteTime = [DateTimeOffset]::new(1980, 1, 1, 0, 0, 0, [TimeSpan]::Zero)
          $inputStream = [IO.File]::OpenRead($file.FullName)
          try {
            $outputStream = $entry.Open()
            try { $inputStream.CopyTo($outputStream) } finally { $outputStream.Dispose() }
          } finally { $inputStream.Dispose() }
        }
      } finally { $zip.Dispose() }
    `,
      ],
      {
        env: { ...process.env, COMMITTER_AZ_OUTPUT: runtime, COMMITTER_AZ_ARCHIVE: archive },
        windowsHide: true,
        stdio: 'pipe',
        timeout: 180000,
      },
    );
    return;
  }
  // POSIX (macOS): build a deterministic archive using the system zip binary,
  // preserving symlinks (bin/python3 -> python3.11) and pinning mtimes so
  // repeated builds from the same retained files are byte-identical.
  rmSync(archive, { force: true });
  execFileSync(
    'find',
    [
      runtime,
      '(',
      '-type',
      'f',
      '-o',
      '-type',
      'l',
      ')',
      '-exec',
      'touch',
      '-h',
      '-t',
      '198001010000',
      '{}',
      '+',
    ],
    { stdio: 'pipe', timeout: 180000 },
  );
  const listing = execFileSync('find', [runtime, '(', '-type', 'f', '-o', '-type', 'l', ')'], {
    encoding: 'utf8',
    timeout: 60000,
  })
    .split('\n')
    .filter(Boolean)
    .map((absolute) => absolute.slice(runtime.length + 1))
    .sort();
  execFileSync('zip', ['-X', '-y', '-q', archive, '-@'], {
    cwd: runtime,
    input: listing.join('\n') + '\n',
    stdio: ['pipe', 'pipe', 'pipe'],
    timeout: 180000,
  });
}
