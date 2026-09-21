import { describe, expect, it } from 'vitest';
import { logger, maskIdentityValue } from '../../src/telemetry/logger.js';

describe('maskIdentityValue', () => {
  it('masks long identifiers, preserving no more than first/last two characters', () => {
    expect(maskIdentityValue('cuid-1234567')).toBe('cu...67');
  });

  it('returns a placeholder for empty values', () => {
    expect(maskIdentityValue(undefined)).toBe('(none)');
  });
});

describe('logger', () => {
  it('exposes standard pino logging methods', () => {
    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
  });
});
