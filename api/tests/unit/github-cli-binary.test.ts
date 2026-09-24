import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, isAbsolute } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveGitHubCli } from '../../src/auth/github-cli-binary.js';

const sea = vi.hoisted(() => ({ isSea: vi.fn(), getAsset: vi.fn() }));
vi.mock('node:sea', () => sea);
const directories: string[] = [];
afterEach(() => {
  vi.resetAllMocks();
  vi.unstubAllEnvs();
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true });
});

function embeddedBinary() {
  const directory = mkdtempSync(join(tmpdir(), 'committer-gh-binary-'));
  directories.push(directory);
  vi.stubEnv('LOCALAPPDATA', directory);
  vi.stubEnv('PATH', '');
  const binary = Buffer.from('synthetic-gh-executable');
  const manifest = {
    version: '2.101.0',
    architecture: process.arch,
    sha256: createHash('sha256').update(binary).digest('hex'),
  };
  sea.isSea.mockReturnValue(true);
  sea.getAsset.mockImplementation((name: string) => {
    if (name === 'github-cli/manifest.json') return JSON.stringify(manifest);
    if (name === 'github-cli/LICENSE') return 'Synthetic license fixture';
    if (name === 'github-cli/gh.exe') return binary;
    throw new Error('Unexpected asset');
  });
  return { binary, manifest };
}

describe('bundled GitHub CLI resolver', () => {
  it('retains the system CLI for source development', () => {
    sea.isSea.mockReturnValue(false);
    expect(resolveGitHubCli()).toBe('gh');
    expect(sea.getAsset).not.toHaveBeenCalled();
  });

  it.skipIf(process.platform !== 'win32')(
    'extracts and reuses a verified private binary with no PATH dependency',
    () => {
      const fixture = embeddedBinary();
      const executable = resolveGitHubCli();
      expect(isAbsolute(executable)).toBe(true);
      expect(readFileSync(executable)).toEqual(fixture.binary);
      expect(readFileSync(join(dirname(executable), 'LICENSE'), 'utf8')).toBe(
        'Synthetic license fixture',
      );
      expect(resolveGitHubCli()).toBe(executable);
      expect(sea.getAsset.mock.calls.filter(([name]) => name === 'github-cli/gh.exe')).toHaveLength(
        1,
      );
      expect(process.env.PATH).toBe('');
    },
  );

  it.skipIf(process.platform !== 'win32')(
    'repairs tampering from the embedded bytes and removes extraction staging',
    () => {
      const fixture = embeddedBinary();
      const executable = resolveGitHubCli();
      writeFileSync(executable, 'corrupted');
      expect(resolveGitHubCli()).toBe(executable);
      expect(readFileSync(executable)).toEqual(fixture.binary);
      expect(readdirSync(dirname(executable)).sort()).toEqual(['LICENSE', 'gh.exe']);
    },
  );

  it.skipIf(process.platform !== 'win32')(
    'fails closed for corrupt embedded bytes instead of using the system CLI',
    () => {
      const fixture = embeddedBinary();
      fixture.manifest.sha256 = '0'.repeat(64);
      expect(() => resolveGitHubCli()).toThrow('integrity');
    },
  );

  it.skipIf(process.platform !== 'win32')('rejects unsafe manifest versions', () => {
    const fixture = embeddedBinary();
    fixture.manifest.version = '../escape';
    expect(() => resolveGitHubCli()).toThrow('metadata');
  });
});
