import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHash } from 'node:crypto';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAzureCli } from '../../src/auth/azure-cli-binary.js';

const assets = vi.hoisted(() => ({ sea: true, manifest: '', archive: new ArrayBuffer(0) }));
vi.mock('node:sea', () => ({
  isSea: () => assets.sea,
  getAsset: (name: string) => (name.endsWith('manifest.json') ? assets.manifest : assets.archive),
}));
let root = '';
afterEach(() => {
  vi.unstubAllEnvs();
  if (root) rmSync(root, { recursive: true, force: true });
  root = '';
  assets.sea = true;
});
describe('bundled Azure CLI integrity', () => {
  it('does not silently use a system CLI for source runs', async () => {
    assets.sea = false;
    await expect(resolveAzureCli()).rejects.toThrow('packaged application');
  });
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
      expect(await resolveAzureCli()).toBe(join(directory, 'python.exe'));
      writeFileSync(join(directory, 'python.exe'), 'tampered');
      await expect(resolveAzureCli()).rejects.toThrow('integrity');
      writeFileSync(join(directory, 'python.exe'), 'verified');
      writeFileSync(join(directory, 'injected.py'), 'untrusted');
      await expect(resolveAzureCli()).rejects.toThrow('integrity');
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
});
