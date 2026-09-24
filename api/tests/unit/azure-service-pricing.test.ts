import { describe, expect, it } from 'vitest';
import { azureServicePricingTables, azureServiceScenarioSchema } from '@ninjapaw/contracts';

function rows(inputs: Record<string, number> = {}) {
  return azureServicePricingTables([
    { organization: 'example', inputs: azureServiceScenarioSchema.parse(inputs) },
  ])[0]!.rows;
}

describe('Azure DevOps other-service pricing', () => {
  it('keeps all unknown quantities unpriced, but prices explicit zero', () => {
    expect(rows()).toHaveLength(8);
    expect(rows().every((row) => row[5] === 'Unavailable')).toBe(true);
    expect(rows({ basicUsers: 0 })[0]?.[5]).toBe('$0.00');
  });
  it('uses the allocated Basic allowance and does not add Basic to Test Plans', () => {
    const result = rows({ basicUsers: 12, testPlanUsers: 3 });
    expect(result[0]?.slice(4, 7)).toEqual(['max(0, 12 - 5 free) x $6', '$42.00', '$504.00']);
    expect(result[1]?.slice(4, 7)).toEqual(['3 x $52', '$156.00', '$1872.00']);
    expect(rows({ basicUsers: 12, basicFreeUsers: 0 })[0]?.[5]).toBe('$72.00');
  });
  it('prices paid pipeline capacity, macOS minutes and billable AI credits independently', () => {
    const result = rows({
      hostedPaidJobs: 1,
      selfHostedPaidJobs: 2,
      macStandardMinutes: 100,
      macXlMinutes: 100,
      aiCredits: 500,
    });
    expect(result.slice(2, 7).map((row) => row[5])).toEqual([
      '$40.00',
      '$30.00',
      '$6.20',
      '$10.20',
      '$5.00',
    ]);
  });
  it.each([
    [0, '$0.00'],
    [2, '$0.00'],
    [2.5, '$1.00'],
    [10, '$16.00'],
    [100, '$106.00'],
    [1000, '$556.00'],
    [1001, '$556.25'],
  ])('applies progressive storage tiers at %s GiB', (artifactGiB, expected) => {
    expect(rows({ artifactGiB: Number(artifactGiB) }).at(-1)?.[5]).toBe(expected);
  });
  it('rejects negative, non-finite, fractional seats, excess allowances and unknown keys', () => {
    for (const invalid of [
      { basicUsers: -1 },
      { artifactGiB: Infinity },
      { testPlanUsers: 1.5 },
      { basicFreeUsers: 6 },
      { committers: 100 },
    ]) {
      expect(azureServiceScenarioSchema.safeParse(invalid).success).toBe(false);
    }
  });
  it('keeps organizations separate without inventing a shared total', () => {
    const tables = azureServicePricingTables(
      ['first', 'second'].map((organization) => ({
        organization,
        inputs: azureServiceScenarioSchema.parse({ basicUsers: 6 }),
      })),
    );
    expect(tables[0]?.rows).toHaveLength(16);
    expect(tables[0]?.rows.filter((row) => row[1] === 'Basic').map((row) => row[5])).toEqual([
      '$6.00',
      '$6.00',
    ]);
  });
});
