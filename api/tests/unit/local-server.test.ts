import { describe, expect, it } from 'vitest';
import { providerStatusForErrorCode } from '../../src/local-server.js';

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
