import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import * as filesystem from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAzureCli, isBundledAzureCliRuntime } from '../../src/auth/azure-cli-binary.js';

const assets = vi.hoisted(() => ({
  sea: true,
  manifest: '',
  archive: new Uint8Array(),
  extractor: '',
}));
vi.mock('node:fs/promises', async (importOriginal) => ({
  ...(await importOriginal<typeof import('node:fs/promises')>()),
}));
vi.mock('node:sea', () => ({
  isSea: () => assets.sea,
  getAsset: (name: string) =>
    name.endsWith('manifest.json')
      ? assets.manifest
      : name.endsWith('extract.ps1') || name.endsWith('extract.sh')
        ? assets.extractor
        : assets.archive,
}));
let root = '';
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  if (root) rmSync(root, { recursive: true, force: true });
  root = '';
  assets.sea = true;
});
describe('bundled Azure CLI integrity', () => {
  it.skipIf(process.platform !== 'win32')(
    'prepares once before sign-in and reuses the verified runtime for the app session',
    async () => {
      vi.resetModules();
      const { prepareAzureCli, getPreparedAzureCli } =
        await import('../../src/auth/azure-cli-binary.js');
      expect(() => getPreparedAzureCli()).toThrow('Restart the app');
      root = mkdtempSync(join(tmpdir(), 'azure-runtime-test-'));
      vi.stubEnv('LOCALAPPDATA', root);
      const hash = createHash('sha256').update('verified').digest('hex');
      const directory = join(root, 'CommitterInsights/tools/azure-cli', `2.90.0-${hash}`);
      mkdirSync(join(directory, 'bin'), { recursive: true });
      writeFileSync(join(directory, 'python.exe'), 'verified');
      writeFileSync(join(directory, 'bin/az.cmd'), 'verified');
      assets.manifest = JSON.stringify({
        version: '2.90.0',
        sha256: hash,
        architecture: process.arch,
        files: { 'python.exe': hash, 'bin/az.cmd': hash },
      });
      const progress = vi.fn();
      await Promise.all([prepareAzureCli(progress), prepareAzureCli(progress)]);
      expect(progress).toHaveBeenCalledTimes(2);
      expect(getPreparedAzureCli()).toBe(join(directory, 'python.exe'));
      await prepareAzureCli(progress);
      expect(progress).toHaveBeenCalledTimes(2);
    },
  );
  it.skipIf(process.platform !== 'win32')(
    'extracts runtime files beyond the legacy Windows path limit',
    () => {
      root = mkdtempSync(join(tmpdir(), 'azure-runtime-test-'));
      const archive = join(root, 'runtime.zip');
      const output = join(root, 'cache'.repeat(20), 'runtime');
      const entry = `${'package/'.repeat(20)}module.py`;
      const powershell = join(
        process.env.SystemRoot!,
        'System32/WindowsPowerShell/v1.0/powershell.exe',
      );
      execFileSync(
        powershell,
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '$ErrorActionPreference = "Stop"; Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem; $zip = [IO.Compression.ZipFile]::Open($env:TEST_ARCHIVE, [IO.Compression.ZipArchiveMode]::Create); try { $entry = $zip.CreateEntry($env:TEST_ENTRY); $writer = [IO.StreamWriter]::new($entry.Open()); try { $writer.Write("synthetic") } finally { $writer.Dispose() } } finally { $zip.Dispose() }',
        ],
        {
          env: { ...process.env, TEST_ARCHIVE: archive, TEST_ENTRY: entry },
          windowsHide: true,
          stdio: 'pipe',
          timeout: 20000,
        },
      );
      execFileSync(
        powershell,
        [
          '-NoProfile',
          '-NonInteractive',
          '-ExecutionPolicy',
          'Bypass',
          '-File',
          join(import.meta.dirname, '../../../scripts/extract-azure-cli.ps1'),
        ],
        {
          env: { ...process.env, COMMITTER_AZ_ARCHIVE: archive, COMMITTER_AZ_OUTPUT: output },
          windowsHide: true,
          stdio: 'pipe',
          timeout: 20000,
        },
      );
      expect(join(output, entry).length).toBeGreaterThan(260);
      expect(readFileSync(join(output, entry), 'utf8')).toBe('synthetic');
    },
  );
  it('does not silently use a system CLI for source runs', async () => {
    assets.sea = false;
    if (process.platform === 'win32' || process.platform === 'darwin') {
      await expect(resolveAzureCli()).rejects.toThrow('packaged application');
    } else {
      await expect(resolveAzureCli()).resolves.toBe('az');
    }
  });
  it.skipIf(process.platform !== 'win32')(
    'retries a Windows publication lock without assuming a destination exists',
    async () => {
      root = mkdtempSync(join(tmpdir(), 'azure-runtime-test-'));
      vi.stubEnv('LOCALAPPDATA', root);
      const archive = join(root, 'runtime.zip');
      const powershell = join(
        process.env.SystemRoot!,
        'System32/WindowsPowerShell/v1.0/powershell.exe',
      );
      execFileSync(
        powershell,
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          '$ErrorActionPreference = "Stop"; Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem; $zip = [IO.Compression.ZipFile]::Open($env:TEST_ARCHIVE, [IO.Compression.ZipArchiveMode]::Create); try { foreach ($name in @("python.exe", "bin/az.cmd")) { $entry = $zip.CreateEntry($name); $writer = [IO.StreamWriter]::new($entry.Open()); try { $writer.Write("synthetic") } finally { $writer.Dispose() } } } finally { $zip.Dispose() }',
        ],
        {
          env: { ...process.env, TEST_ARCHIVE: archive },
          windowsHide: true,
          stdio: 'pipe',
          timeout: 20000,
        },
      );
      assets.archive = readFileSync(archive);
      assets.extractor = readFileSync(
        join(import.meta.dirname, '../../../scripts/extract-azure-cli.ps1'),
        'utf8',
      );
      const hash = createHash('sha256').update('synthetic').digest('hex');
      assets.manifest = JSON.stringify({
        version: '2.90.0',
        architecture: process.arch,
        sha256: createHash('sha256').update(assets.archive).digest('hex'),
        files: { 'python.exe': hash, 'bin/az.cmd': hash },
      });
      const rename = vi
        .spyOn(filesystem, 'rename')
        .mockRejectedValueOnce(Object.assign(new Error('temporary lock'), { code: 'EPERM' }));
      const executable = await resolveAzureCli();
      expect(readFileSync(executable, 'utf8')).toBe('synthetic');
      expect(rename).toHaveBeenCalledTimes(2);
      expect(await resolveAzureCli()).toBe(executable);
      expect(rename).toHaveBeenCalledTimes(2);
    },
  );
  it.skipIf(process.platform !== 'win32')(
    'verifies every runtime file and rejects tampering and unexpected files',
    async () => {
      root = mkdtempSync(join(tmpdir(), 'azure-runtime-test-'));
      vi.stubEnv('LOCALAPPDATA', root);
      const hash = createHash('sha256').update('verified').digest('hex');
      const directory = join(root, 'CommitterInsights/tools/azure-cli', `2.90.0-${hash}`);
      mkdirSync(join(directory, 'bin'), { recursive: true });
      writeFileSync(join(directory, 'python.exe'), 'verified');
      writeFileSync(join(directory, 'bin/az.cmd'), 'verified');
      assets.manifest = JSON.stringify({
        version: '2.90.0',
        sha256: hash,
        architecture: process.arch,
        files: { 'python.exe': hash, 'bin/az.cmd': hash },
      });
      const progress = vi.fn();
      expect(await resolveAzureCli(undefined, progress)).toBe(join(directory, 'python.exe'));
      expect(progress).toHaveBeenNthCalledWith(
        1,
        'Verifying Microsoft sign-in runtime: 0 of 2 files...',
      );
      expect(progress).toHaveBeenLastCalledWith(
        'Verifying Microsoft sign-in runtime: 2 of 2 files...',
      );
      const controller = new AbortController();
      const originalReadFile = filesystem.readFile;
      const read = vi.spyOn(filesystem, 'readFile').mockImplementationOnce(async (...args) => {
        const bytes = await originalReadFile(...args);
        controller.abort();
        return bytes;
      });
      await expect(resolveAzureCli(controller.signal)).rejects.toThrow('aborted');
      expect(read).toHaveBeenCalledTimes(1);
      expect(read.mock.calls[0]?.[1]).toEqual({ signal: controller.signal });
      read.mockRestore();
      writeFileSync(join(directory, 'python.exe'), 'tampered');
      await expect(resolveAzureCli()).rejects.toThrow('integrity');
      writeFileSync(join(directory, 'python.exe'), 'verified');
      writeFileSync(join(directory, 'injected.py'), 'untrusted');
      await expect(resolveAzureCli()).rejects.toThrow('integrity');
      vi.resetModules();
      const startup = await import('../../src/auth/azure-cli-binary.js');
      await expect(startup.prepareAzureCli()).rejects.toThrow('integrity');
      expect(() => startup.getPreparedAzureCli()).toThrow('Restart the app');
      await expect(startup.prepareAzureCli()).rejects.toThrow('integrity');
    },
  );
  it.skipIf(process.platform !== 'win32')(
    'rejects unsafe manifest paths before extracting',
    async () => {
      const hash = 'a'.repeat(64);
      assets.manifest = JSON.stringify({
        version: '2.90.0',
        sha256: hash,
        architecture: process.arch,
        files: { 'python.exe': hash, 'bin/az.cmd': hash, '../outside': hash },
      });
      await expect(resolveAzureCli()).rejects.toThrow('metadata');
    },
  );
  it.skipIf(process.platform !== 'win32')(
    'rejects an archive whose bytes do not match the pin',
    async () => {
      root = mkdtempSync(join(tmpdir(), 'azure-runtime-test-'));
      vi.stubEnv('LOCALAPPDATA', root);
      const hash = 'a'.repeat(64);
      assets.manifest = JSON.stringify({
        version: '2.90.0',
        sha256: hash,
        architecture: process.arch,
        files: { 'python.exe': hash, 'bin/az.cmd': hash },
      });
      await expect(resolveAzureCli()).rejects.toThrow('archive failed integrity');
    },
  );
  it.skipIf(process.platform !== 'darwin')(
    'prepares once before sign-in and reuses the verified runtime for the app session on macOS',
    async () => {
      vi.resetModules();
      const { prepareAzureCli, getPreparedAzureCli } =
        await import('../../src/auth/azure-cli-binary.js');
      expect(() => getPreparedAzureCli()).toThrow('Restart the app');
      root = mkdtempSync(join(tmpdir(), 'azure-runtime-test-'));
      vi.stubEnv('HOME', root);
      const hash = createHash('sha256').update('verified').digest('hex');
      const directory = join(
        root,
        'Library/Application Support/CommitterInsights/tools/azure-cli',
        `2.90.0-${hash}`,
      );
      mkdirSync(join(directory, 'bin'), { recursive: true });
      writeFileSync(join(directory, 'bin/python3'), 'verified');
      writeFileSync(join(directory, 'bin/az'), 'verified');
      assets.manifest = JSON.stringify({
        version: '2.90.0',
        sha256: hash,
        architecture: process.arch,
        files: { 'bin/python3': hash, 'bin/az': hash },
      });
      const progress = vi.fn();
      await Promise.all([prepareAzureCli(progress), prepareAzureCli(progress)]);
      expect(progress).toHaveBeenCalledTimes(2);
      expect(getPreparedAzureCli()).toBe(join(directory, 'bin/python3'));
      await prepareAzureCli(progress);
      expect(progress).toHaveBeenCalledTimes(2);
    },
  );
  it.skipIf(process.platform !== 'darwin')(
    'extracts a real archive, follows the bundled symlink, and detects tampering on macOS',
    async () => {
      root = mkdtempSync(join(tmpdir(), 'azure-runtime-test-'));
      vi.stubEnv('HOME', root);
      const staging = mkdtempSync(join(tmpdir(), 'azure-runtime-src-'));
      mkdirSync(join(staging, 'bin'), { recursive: true });
      writeFileSync(join(staging, 'bin/python3.11'), 'verified');
      await filesystem.symlink('python3.11', join(staging, 'bin/python3'));
      writeFileSync(join(staging, 'bin/az'), 'verified');
      const archive = join(root, 'runtime.zip');
      execFileSync('zip', ['-X', '-y', '-q', archive, 'bin/python3.11', 'bin/python3', 'bin/az'], {
        cwd: staging,
        stdio: 'pipe',
      });
      assets.archive = readFileSync(archive);
      assets.extractor = readFileSync(
        join(import.meta.dirname, '../../../scripts/extract-azure-cli.sh'),
        'utf8',
      );
      const hash = createHash('sha256').update('verified').digest('hex');
      const archiveHash = createHash('sha256').update(assets.archive).digest('hex');
      assets.manifest = JSON.stringify({
        version: '2.90.0',
        architecture: process.arch,
        sha256: archiveHash,
        files: { 'bin/python3.11': hash, 'bin/python3': 'symlink:python3.11', 'bin/az': hash },
      });
      const progress = vi.fn();
      const directory = join(
        root,
        'Library/Application Support/CommitterInsights/tools/azure-cli',
        `2.90.0-${archiveHash}`,
      );
      const executable = await resolveAzureCli(undefined, progress);
      expect(executable).toBe(join(directory, 'bin/python3'));
      expect(readFileSync(executable, 'utf8')).toBe('verified');
      // Re-resolving hits the already-published cache and re-verifies via readlink().
      expect(await resolveAzureCli(undefined, progress)).toBe(executable);
      await filesystem.rm(executable, { force: true });
      await filesystem.symlink('az', executable);
      await expect(resolveAzureCli()).rejects.toThrow('integrity');
    },
  );
  it.skipIf(process.platform !== 'darwin')(
    'rejects unsafe manifest paths before extracting on macOS',
    async () => {
      const hash = 'a'.repeat(64);
      assets.manifest = JSON.stringify({
        version: '2.90.0',
        sha256: hash,
        architecture: process.arch,
        files: { 'bin/python3': hash, 'bin/az': hash, '../outside': hash },
      });
      await expect(resolveAzureCli()).rejects.toThrow('metadata');
    },
  );
  it.skipIf(process.platform !== 'darwin')(
    'rejects a macOS archive whose bytes do not match the pin',
    async () => {
      root = mkdtempSync(join(tmpdir(), 'azure-runtime-test-'));
      vi.stubEnv('HOME', root);
      const hash = 'a'.repeat(64);
      assets.manifest = JSON.stringify({
        version: '2.90.0',
        sha256: hash,
        architecture: process.arch,
        files: { 'bin/python3': hash, 'bin/az': hash },
      });
      await expect(resolveAzureCli()).rejects.toThrow('archive failed integrity');
    },
  );
  it.skipIf(process.platform !== 'darwin')(
    'trusts the packaged .app runtime directory via DEVELOPER_USAGE_INSIGHTS_AZ_HOME without SEA assets',
    async () => {
      assets.sea = false;
      vi.resetModules();
      const {
        resolveAzureCli: resolve,
        prepareAzureCli,
        getPreparedAzureCli,
        isBundledAzureCliRuntime: isBundled,
      } = await import('../../src/auth/azure-cli-binary.js');
      root = mkdtempSync(join(tmpdir(), 'azure-runtime-test-'));
      const home = join(root, 'Contents/Resources/azure-cli');
      mkdirSync(join(home, 'bin'), { recursive: true });
      vi.stubEnv('DEVELOPER_USAGE_INSIGHTS_AZ_HOME', home);
      // No SEA manifest/archive is configured at all: the .app's non-SEA runtime must
      // never touch node:sea's getAsset() when this trusted env var is set.
      expect(await resolve()).toBe(join(home, 'bin/python3'));
      expect(isBundled()).toBe(true);
      await prepareAzureCli();
      expect(getPreparedAzureCli()).toBe(join(home, 'bin/python3'));
    },
  );
});
