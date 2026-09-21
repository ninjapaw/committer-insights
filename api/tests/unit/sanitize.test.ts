import { describe, expect, it } from 'vitest';
import { sanitizeCellValue, sanitizeCsvField, toCsv } from '../../src/exports/sanitize.js';

describe('sanitizeCellValue', () => {
  it.each(['=SUM(A1:A2)', '+1+1', '-1+1', '@SUM(1+1)', '\tmalicious'])(
    'neutralizes formula-injection prefix in %s',
    (value) => {
      expect(sanitizeCellValue(value).startsWith("'")).toBe(true);
    },
  );

  it('passes through safe values unchanged', () => {
    expect(sanitizeCellValue('Jane Doe')).toBe('Jane Doe');
  });
});

describe('toCsv', () => {
  it('quotes fields containing commas and neutralizes formulas', () => {
    const csv = toCsv([{ name: '=cmd', note: 'a,b' }], ['name', 'note']);
    expect(csv).toContain("'=cmd");
    expect(csv).toContain('"a,b"');
  });
});

describe('sanitizeCsvField', () => {
  it('escapes embedded quotes', () => {
    expect(sanitizeCsvField('he said "hi"')).toBe('"he said ""hi"""');
  });
});
