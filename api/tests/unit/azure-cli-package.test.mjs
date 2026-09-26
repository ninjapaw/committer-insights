import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import process from 'node:process';
import {
  keepAzureCliFile,
  reduceAzureCli,
  packReducedAzureCli,
} from '../../../scripts/reduce-azure-cli.mjs';

let root;
afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  root = undefined;
});

describe('build-time Azure CLI reduction', () => {
  it('retains shared dependencies, required command modules, SDKs and nested legal notices', () => {
    for (const name of [
      'python.exe',
      'python314.zip',
      'Lib/site-packages/certifi/cacert.pem',
      'Lib/site-packages/msal/application.py',
      'Lib/site-packages/msal_extensions/persistence.py',
      'Lib/site-packages/azure/cli/core/auth/identity.pyc',
      'Lib/site-packages/azure/cli/command_modules/profile/custom.pyc',
      'Lib/site-packages/azure/cli/command_modules/resource/__init__.pyc',
      'Lib/site-packages/azure/cli/command_modules/util/__init__.pyc',
      'Lib/site-packages/azure/mgmt/resource/subscriptions/models.pyc',
      'Lib/site-packages/azure/storage/LICENSE',
      'Lib/site-packages/azure/cli/command_modules/vm/licenses/dependency.txt',
    ])
      expect(keepAzureCliFile(name)).toBe(true);
    for (const name of [
      'Lib/site-packages/azure/cli/command_modules/vm/custom.pyc',
      'Lib/site-packages/azure/cli/command_modules/storage/custom.pyc',
      'Lib/site-packages/azure/mgmt/compute/models.pyc',
      'Lib/site-packages/azure/storage/blob/client.pyc',
    ])
      expect(keepAzureCliFile(name)).toBe(false);
  });

  it('copies retained bytes without modifying the source and refuses an existing output', async () => {
    root = await mkdtemp(join(tmpdir(), 'cli-reduction-test-'));
    const source = join(root, 'source');
    const removed = 'Lib/site-packages/azure/storage/blob/client.pyc';
    await mkdir(dirname(join(source, removed)), { recursive: true });
    await writeFile(join(source, removed), 'removed');
    await writeFile(join(source, 'python.exe'), 'kept');
    const destination = join(root, 'reduced');
    expect(await reduceAzureCli(source, destination)).toEqual({
      originalFiles: 2,
      retainedFiles: 1,
      originalBytes: 11,
      retainedBytes: 4,
    });
    expect(await readFile(join(destination, 'python.exe'), 'utf8')).toBe('kept');
    expect(await readFile(join(source, removed), 'utf8')).toBe('removed');
    await expect(readFile(join(destination, removed))).rejects.toThrow();
    await expect(reduceAzureCli(source, destination)).rejects.toThrow();
  });

  it('creates repeatable archives from the same retained files', async () => {
    root = await mkdtemp(join(tmpdir(), 'cli-reduction-test-'));
    const runtime = join(root, 'runtime');
    await mkdir(runtime);
    await writeFile(join(runtime, 'python.exe'), 'synthetic');
    packReducedAzureCli(runtime, join(root, 'first.zip'));
    packReducedAzureCli(runtime, join(root, 'second.zip'));
    expect(await readFile(join(root, 'first.zip'))).toEqual(
      await readFile(join(root, 'second.zip')),
    );
  });
});
