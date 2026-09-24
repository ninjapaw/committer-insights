import { describe, expect, it } from 'vitest';
import {
  reportOverviewTables,
  buildCioBrief,
  type Report,
  type GitHubBillingSnapshot,
} from '@ninjapaw/contracts';
const usage = {
  product: 'Actions',
  sku: 'linux',
  unit: 'minutes',
  quantity: 100,
  grossUsd: 2,
  discountUsd: 0.5,
  netUsd: 1.5,
};
const snapshot: GitHubBillingSnapshot = {
  source: 'example',
  scope: 'organization',
  dataset: 'usage-summary',
  period: '2026-09',
  collectedAt: '2026-09-24T12:00:00Z',
  sourceUrl: 'https://example.invalid',
  apiVersion: 'test',
  status: 'complete',
  coverage: 'Full month',
  warnings: [],
  repositories: [],
  usage: [usage],
};
const report: Report = {
  reportId: 'test',
  provider: 'github',
  subject: 'example',
  organization: 'example',
  plans: [],
  generatedAt: snapshot.collectedAt,
  sourceApiVersion: 'test',
  azureDevOpsCommitters: [],
  gitHubCommitters: [],
  warnings: [],
  insights: { repositories: [], billing: [], checks: [], githubBilling: [snapshot] },
};
describe('report consolidation', () => {
  it('uses the summary once rather than adding overlapping daily, premium and AI rows', () => {
    const input = {
      ...report,
      insights: {
        ...report.insights!,
        githubBilling: [
          snapshot,
          { ...snapshot, dataset: 'usage' as const },
          { ...snapshot, dataset: 'ai-credits' as const },
          { ...snapshot, dataset: 'premium-requests' as const },
        ],
      },
    };
    const totals = reportOverviewTables(input)[1]!;
    expect(totals.rows).toHaveLength(1);
    expect(totals.rows[0]).toContain('$1.50');
    expect(buildCioBrief(input, 'github').readiness).not.toBe('No evidence');
    expect(buildCioBrief(input, 'github').facts.find((fact) => fact.id === 'F5')?.text).toContain(
      '4 readable billing datasets',
    );
  });
  it('does not combine different sources, periods, units or products', () => {
    const totals = reportOverviewTables({
      ...report,
      insights: {
        ...report.insights!,
        githubBilling: [
          snapshot,
          { ...snapshot, source: 'other' },
          { ...snapshot, period: '2026-08' },
          {
            ...snapshot,
            scope: 'enterprise',
            usage: [
              { ...usage, unit: 'hours' },
              { ...usage, product: 'Codespaces' },
            ],
          },
        ],
      },
    })[1]!;
    expect(totals.rows).toHaveLength(5);
  });
  it('uses only returned detail when summaries are denied and exposes incomplete coverage', () => {
    const totals = reportOverviewTables({
      ...report,
      insights: {
        ...report.insights!,
        githubBilling: [
          { ...snapshot, status: 'unavailable', usage: [] },
          { ...snapshot, dataset: 'usage', status: 'partial', coverage: 'Some days unavailable' },
        ],
      },
    })[1]!;
    expect(totals.rows[0]).toContain('partial: Some days unavailable');
    expect(totals.rows[0]).toContain('usage');
  });
  it('does not infer zero totals from empty or ambiguous summaries', () => {
    for (const snapshots of [[{ ...snapshot, usage: [] }], [snapshot, snapshot]]) {
      expect(
        reportOverviewTables({
          ...report,
          insights: { ...report.insights!, githubBilling: snapshots },
        })[1]!.rows,
      ).toEqual([]);
    }
  });
});
