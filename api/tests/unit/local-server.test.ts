import { describe, expect, it } from 'vitest';
import { appRootCandidates, providerStatusForErrorCode } from '../../src/local-server.js';
import { join } from 'node:path';

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
