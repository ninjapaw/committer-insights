import { describe, expect, it } from 'vitest';
import {
  appRootCandidates,
  listenForQuitKey,
  providerStatusForErrorCode,
} from '../../src/local-server.js';
import { join } from 'node:path';
import { PassThrough } from 'node:stream';

function fakeTerminal(isTTY: boolean) {
  return Object.assign(new PassThrough(), { isTTY });
}

describe('listenForQuitKey', () => {
  it('shuts down when the user presses Enter', async () => {
    const input = fakeTerminal(true);
    let shutdowns = 0;
    listenForQuitKey(() => (shutdowns += 1), input);
    input.write('\n');
    await new Promise((resolve) => setImmediate(resolve));
    expect(shutdowns).toBe(1);
  });

  it('shuts down when stdin ends, covering Ctrl+D and a closed terminal', async () => {
    const input = fakeTerminal(true);
    let shutdowns = 0;
    listenForQuitKey(() => (shutdowns += 1), input);
    input.end();
    await new Promise((resolve) => setImmediate(resolve));
    expect(shutdowns).toBe(1);
  });

  it('ignores non-interactive input so piped and CI runs are unaffected', async () => {
    const input = fakeTerminal(false);
    let shutdowns = 0;
    listenForQuitKey(() => (shutdowns += 1), input);
    input.write('\n');
    input.end();
    await new Promise((resolve) => setImmediate(resolve));
    expect(shutdowns).toBe(0);
  });

  it('does not invoke shutdown when torn down by an already-running shutdown', async () => {
    const input = fakeTerminal(true);
    let shutdowns = 0;
    const stop = listenForQuitKey(() => (shutdowns += 1), input);
    stop();
    await new Promise((resolve) => setImmediate(resolve));
    expect(shutdowns).toBe(0);
    expect(input.isPaused()).toBe(true);
  });
});

describe('appRootCandidates', () => {
  it('prefers assets shipped beside the module over a repository build', () => {
    const [first] = appRootCandidates('/Applications/App.app/Contents/Resources', '/usr/bin/node');
    expect(first).toBe(join('/Applications/App.app/Contents/Resources', 'app'));
  });

  it('includes assets beside the bundled Node.js runtime', () => {
    const candidates = appRootCandidates(
      '/somewhere/else',
      '/Applications/App.app/Contents/Resources/node',
    );
    expect(candidates).toContain(join('/Applications/App.app/Contents/Resources', 'app'));
  });

  it('keeps the repository build output as a fallback for source runs', () => {
    const candidates = appRootCandidates('/repo/api/dist/src', '/usr/bin/node');
    expect(candidates.at(-1)).toBe(join('/repo', 'app', 'dist'));
  });

  it('reports each searched directory once when the runtime sits beside the assets', () => {
    const candidates = appRootCandidates(
      '/Applications/App.app/Contents/Resources',
      '/Applications/App.app/Contents/Resources/node',
    );
    expect(candidates).toEqual([...new Set(candidates)]);
  });
});

describe('providerStatusForErrorCode', () => {
  it.each([
    ['invalid_request', 400],
    ['authentication_required', 401],
    ['insufficient_permission', 403],
    ['not_found', 404],
    ['consent_or_account_mismatch', 409],
    ['rate_limited', 429],
    ['internal_error', 500],
    ['upstream_error', 502],
    ['upstream_unavailable', 503],
  ] as const)('maps %s to %i', (code, expected) => {
    expect(providerStatusForErrorCode(code)).toBe(expected);
  });
});
