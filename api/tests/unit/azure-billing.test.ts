import { describe, expect, it, vi } from 'vitest';
import {
  emptyInsights,
  azureBillingGroups,
  azureBillingTables,
  azureAdoptionTables,
  type AzureAdoptionEstimate,
  multiSourceSchema,
  providerReport,
  type Report,
} from '@ninjapaw/contracts';
import { collectAzureBilling } from '../../src/adapters/azure-devops/billing-client.js';
import { generateCsv } from '../../src/exports/csv-report.js';
import { generateStandaloneHtml } from '../../src/exports/standalone-html.js';
import { generateExecutivePdf } from '../../src/exports/pdf-report.js';
import { PDFDocument, PDFPage } from 'pdf-lib';

const tenant = '11111111-1111-4111-8111-111111111111';
const subscription = '22222222-2222-4222-8222-222222222222';
const source = {
  provider: 'azure-devops' as const,
  organization: 'example',
  plans: ['codeSecurity' as const],
  includeAzureBilling: true,
};
const raw = {
  accountId: '33333333-3333-4333-8333-333333333333',
  azureSubscriptionId: subscription,
  tenantId: tenant,
  billingDate: '2026-09-20T00:00:00Z',
  isPlanEnabled: true,
  billedUsers: {
    uniqueCommitterCount: 1,
    billedUsers: [
      { cuid: 'cuid-one', userIdentity: { id: 'identity-one', displayName: 'Example Person' } },
    ],
  },
};
const token = async () => 'synthetic-token';

describe('Azure provider billing collection', () => {
  it('produces a product-specific estimate with no billing snapshot when visible repositories are off', () => {
    const estimate: AzureAdoptionEstimate = {
      organization: 'example',
      plan: 'secretProtection',
      status: 'complete',
      providerCount: 5,
      returnedIdentities: 5,
      collectedAt: '2026-09-24T12:00:00Z',
      apiVersion: 'test',
      sourceUrl: 'https://example.invalid/estimate',
      warnings: [],
    };
    const tables = azureAdoptionTables(
      [estimate],
      [],
      [
        {
          provider: 'azure-devops',
          source: 'example',
          id: 'repo',
          name: 'repo',
          visibility: 'private',
          state: 'active',
          observedAt: estimate.collectedAt,
          features: [{ name: 'Secret Protection', state: 'disabled' }],
          activity: {
            from: estimate.collectedAt,
            to: estimate.collectedAt,
            status: 'complete',
            daily: [{ date: '2026-09-24', commits: 9000 }],
          },
        },
      ],
    );
    const summary = Object.fromEntries(
      tables[0]!.columns.map((column, index) => [column, tables[0]!.rows[0]![index]]),
    );
    const evidence = Object.fromEntries(
      tables[1]!.columns.map((column, index) => [column, tables[1]!.rows[0]![index]]),
    );
    expect(summary).toMatchObject({
      'Provider enablement estimate count': 5,
      'Monthly calculation': '5 x $19.00/month',
      'Enablement scenario monthly USD': '$95.00',
      'Enablement scenario annualized USD': '$1140.00',
      'Estimate basis': 'Provider count; identity detail reconciled',
    });
    expect(evidence).toMatchObject({
      'Product state (observed scope)': 'Off in visible repositories',
      'Snapshot billable count': 'Unavailable',
      'Actual invoiced charges': 'Not collected; reconcile with the billing owner',
    });
    expect(evidence.Assessment).toContain('remains usable without billing history');
    expect(evidence.Assessment).toContain('does not prove organization-wide coverage');
    expect(summary['Provider enablement estimate count']).not.toBe(9000);
  });
  it.each([401, 403, 404, 429, 503])(
    'reports safe HTTP %i diagnostics without leaking provider bodies',
    async (status) => {
      const insights = emptyInsights();
      await collectAzureBilling(
        { ...source, includeAzureBillingDetails: true },
        insights,
        token,
        vi.fn().mockResolvedValue(new Response('private-provider-response', { status })),
      );
      expect(insights.azureBilling?.[0]?.warnings.join(' ')).toContain(`HTTP ${status}`);
      expect(JSON.stringify(insights)).not.toContain('private-provider-response');
      expect(insights.checks[1]?.detail).toContain('not attempted');
    },
  );
  it('distinguishes an unsupported response schema from a permission failure', async () => {
    const insights = emptyInsights();
    await collectAzureBilling(
      source,
      insights,
      token,
      vi.fn().mockResolvedValue(Response.json({ billedUsers: 'unsupported-private-shape' })),
    );
    expect(insights.azureBilling?.[0]?.warnings.join(' ')).toContain(
      'Unsupported provider response format',
    );
    expect(JSON.stringify(insights)).not.toContain('unsupported-private-shape');
  });
  it('prices provider enablement counts even when the product is disabled and no identities are returned', async () => {
    const insights = emptyInsights();
    await collectAzureBilling(
      source,
      insights,
      token,
      vi.fn().mockResolvedValue(
        Response.json({
          ...raw,
          isPlanEnabled: false,
          billedUsers: { uniqueCommitterCount: 0, billedUsers: [] },
        }),
      ),
    );
    const estimate: AzureAdoptionEstimate = {
      organization: 'example',
      plan: 'codeSecurity',
      status: 'partial',
      providerCount: 12,
      returnedIdentities: 0,
      collectedAt: '2026-09-24T12:00:00Z',
      apiVersion: 'test',
      sourceUrl: 'https://example.invalid/estimate',
      warnings: ['Names unavailable'],
    };
    insights.azureEstimates = [
      estimate,
      { ...estimate, plan: 'secretProtection', providerCount: 8 },
    ];
    const tables = azureAdoptionTables(insights.azureEstimates, insights.azureBilling);
    const code = Object.fromEntries(
      tables[0]!.columns.map((column, index) => [column, tables[0]!.rows[0]![index]]),
    );
    expect(code).toMatchObject({
      'Provider enablement estimate count': 12,
      'Monthly calculation': '12 x $30.00/month',
      'Estimate basis': 'Provider count; identity detail incomplete',
      'Enablement scenario monthly USD': '$360.00',
      'Enablement scenario annualized USD': '$4320.00',
    });
    expect(tables[1]!.rows[0]!.at(-1)).toContain('Product disabled');
    expect(tables[0]!.rows[1]).toContain('$152.00');
    const report: Report = {
      reportId: 'adoption',
      provider: 'combined',
      subject: 'Synthetic adoption',
      organization: 'example',
      plans: ['all'],
      generatedAt: estimate.collectedAt,
      sourceApiVersion: 'test',
      azureDevOpsCommitters: [],
      gitHubCommitters: [],
      warnings: [],
      insights,
    };
    expect(providerReport(report, 'github').insights?.azureEstimates).toBeUndefined();
    expect(providerReport(report, 'azure-devops').insights?.azureEstimates).toHaveLength(2);
    for (const output of [generateCsv(report), generateStandaloneHtml(report)]) {
      expect(output).toContain('$360.00');
      expect(output).toContain('$152.00');
      expect(output).toContain('Names unavailable');
      expect(output).toContain('not actual charges');
    }
    const draw = vi.spyOn(PDFPage.prototype, 'drawText');
    try {
      await generateExecutivePdf(report);
      const lines = draw.mock.calls.map(([line]) => line);
      expect(
        lines.filter((line) => line === 'Azure billing and enablement scenarios'),
      ).toHaveLength(1);
      expect(lines.join(' ')).toContain('$360.00');
    } finally {
      draw.mockRestore();
    }
  });
  it('distinguishes an unavailable adoption estimate from a genuine zero and does not merge organization totals', () => {
    const estimate: AzureAdoptionEstimate = {
      organization: 'example',
      plan: 'codeSecurity',
      status: 'complete',
      providerCount: 0,
      returnedIdentities: 0,
      collectedAt: '2026-09-24T12:00:00Z',
      apiVersion: 'test',
      sourceUrl: 'https://example.invalid/estimate',
      warnings: [],
    };
    const tables = azureAdoptionTables([
      estimate,
      { ...estimate, organization: 'other', status: 'unavailable', providerCount: undefined },
    ]);
    expect(tables[0]!.rows).toHaveLength(2);
    expect(tables[0]!.rows[0]).toContain('$0.00');
    expect(tables[0]!.rows[1]).not.toContain('$0.00');
    expect(tables[1]!.rows[0]!.at(-1)).toContain('no zero-charge conclusion');
  });
  it('exports billing evidence separately and never leaks it into the GitHub provider section', async () => {
    const insights = emptyInsights();
    const unsafe = '<img src=x onerror=alert(1)>';
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          ...raw,
          billedUsers: {
            uniqueCommitterCount: 1,
            billedUsers: [
              {
                cuid: 'one',
                userIdentity: { id: 'identity-one', displayName: unsafe, uniqueName: '=unsafe' },
              },
            ],
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json([
          {
            vsid: 'unmatched-id',
            displayName: 'Other Pusher',
            committerEmail: 'private@example.test',
            repoId: 'repo',
            projectId: 'project',
            commitId: 'sha',
            pushedTime: '2026-09-19T00:00:00Z',
            pushId: 1,
          },
        ]),
      );
    await collectAzureBilling(
      { ...source, includeAzureBillingDetails: true },
      insights,
      token,
      fetchImpl,
    );
    const report: Report = {
      reportId: 'synthetic-billing',
      provider: 'combined',
      subject: 'Synthetic billing',
      organization: 'multiple',
      plans: ['combined'],
      generatedAt: '2026-09-24T12:00:00Z',
      sourceApiVersion: 'test',
      azureDevOpsCommitters: [],
      gitHubCommitters: [],
      insights,
      warnings: [],
    };
    expect(providerReport(report, 'github').insights?.azureBilling).toBeUndefined();
    expect(azureBillingTables(insights.azureBilling!).at(-1)?.rows[0]).toContain(
      'Unmatched or ambiguous; not added to totals',
    );
    const csv = generateCsv(report);
    expect(csv).toContain('azure-billing-snapshots');
    expect(csv).toContain('azure-billing-diagnostic-details');
    expect(csv).toContain("'=unsafe");
    expect(csv).toContain('private@example.test');
    const html = generateStandaloneHtml(report);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain(unsafe);
    expect(html).toContain('Provider-reported daily billing snapshots');
    const draw = vi.spyOn(PDFPage.prototype, 'drawText');
    try {
      const pdf = await generateExecutivePdf(report);
      expect((await PDFDocument.load(pdf)).getPageCount()).toBeGreaterThan(0);
      const text = draw.mock.calls.map(([line]) => line).join(' ');
      expect(text).toContain('Provider-reported Azure billing');
      expect(text).toContain('Azure billing diagnostic details');
      expect(text).toContain('private@example.test');
      expect(text).toContain('Unmatched or ambiguous; not added to totals');
    } finally {
      draw.mockRestore();
    }
  });
  it('does not collect billing or personal details without opt-in', async () => {
    const fetchImpl = vi.fn();
    await collectAzureBilling(
      { ...source, includeAzureBilling: false, includeAzureBillingDetails: true },
      emptyInsights(),
      token,
      fetchImpl,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });
  it('requests latest snapshots and pins diagnostic details to the returned date', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(Response.json(raw))
      .mockResolvedValueOnce(
        Response.json({
          value: [
            {
              vsid: 'identity-one',
              pusherId: 'different-pusher',
              repoId: 'repo',
              repoName: 'Feature repo',
              projectName: 'Project',
              pushId: 7,
              pushedTime: '2026-09-19T00:00:00Z',
              commitId: 'sha',
              commitTime: '2025-01-01T00:00:00Z',
              committerEmail: 'person@example.test',
            },
          ],
        }),
      );
    const insights = emptyInsights();
    await collectAzureBilling(
      { ...source, includeAzureBillingDetails: true },
      insights,
      token,
      fetchImpl,
    );
    expect(insights.azureBilling?.[0]).toMatchObject({
      status: 'complete',
      detailsStatus: 'complete',
      providerCount: 1,
      billingDate: raw.billingDate,
    });
    expect(String(fetchImpl.mock.calls[0]![0])).toContain('/MeterUsage/Last');
    expect(new URL(fetchImpl.mock.calls[1]![0]).searchParams.get('billingDate')).toBe(
      raw.billingDate,
    );
    expect(insights.azureBilling?.[0]?.details[0]).toMatchObject({
      pusherId: 'different-pusher',
      vsid: 'identity-one',
      commitTime: '2025-01-01T00:00:00Z',
    });
    for (const call of fetchImpl.mock.calls)
      expect(call[1]).toMatchObject({ method: 'GET', redirect: 'error' });
  });
  it('retains the provider count when identity detail is incomplete and refuses reconciliation', async () => {
    const insights = emptyInsights();
    await collectAzureBilling(
      source,
      insights,
      token,
      vi
        .fn()
        .mockResolvedValue(Response.json({ ...raw, billedUsers: { uniqueCommitterCount: 12 } })),
    );
    expect(insights.azureBilling?.[0]).toMatchObject({
      providerCount: 12,
      identities: [],
      status: 'partial',
    });
    expect(azureBillingGroups(insights.azureBilling!)[0]?.uniqueCount).toBeUndefined();
  });
  it('deduplicates CUIDs only within the same subscription, product and billing day', async () => {
    const insights = emptyInsights();
    await collectAzureBilling(
      source,
      insights,
      token,
      vi.fn().mockResolvedValue(Response.json(raw)),
    );
    const first = insights.azureBilling![0]!;
    expect(azureBillingGroups([first, { ...first, organization: 'other' }])[0]?.uniqueCount).toBe(
      1,
    );
    expect(azureBillingGroups([first, { ...first, plan: 'secretProtection' }])).toHaveLength(2);
    expect(azureBillingGroups([first, { ...first, azureSubscriptionId: tenant }])).toHaveLength(2);
    expect(
      azureBillingGroups([first, { ...first, billingDate: '2026-09-19T00:00:00Z' }]),
    ).toHaveLength(2);
    expect(azureBillingGroups([first, first])[0]?.uniqueCount).toBeUndefined();
  });
  it('keeps snapshots when details are denied and isolates failure by product', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(Response.json(raw))
      .mockResolvedValueOnce(new Response('', { status: 403 }))
      .mockResolvedValueOnce(new Response('', { status: 403 }));
    const insights = emptyInsights();
    await collectAzureBilling(
      { ...source, plans: ['all'], includeAzureBillingDetails: true },
      insights,
      token,
      fetchImpl,
    );
    expect(insights.azureBilling?.[0]).toMatchObject({
      providerCount: 1,
      status: 'complete',
      detailsStatus: 'unavailable',
    });
    expect(insights.azureBilling?.[1]).toMatchObject({ status: 'unavailable', identities: [] });
    expect(insights.azureBilling?.[1]?.providerCount).toBeUndefined();
  });
  it('rejects truncated snapshots and mismatched requested dates', async () => {
    const insights = emptyInsights();
    await collectAzureBilling(
      source,
      insights,
      token,
      vi
        .fn()
        .mockResolvedValue(Response.json(raw, { headers: { 'x-ms-continuationtoken': 'more' } })),
    );
    expect(insights.azureBilling?.[0]?.status).toBe('unavailable');
    const dated = emptyInsights();
    const fetchImpl = vi.fn().mockResolvedValue(Response.json(raw));
    await collectAzureBilling(
      { ...source, billingDate: '2026-09-19', includeAzureBillingDetails: true },
      dated,
      token,
      fetchImpl,
    );
    expect(dated.azureBilling?.[0]?.status).toBe('partial');
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('validates calendar dates and source hosts', () => {
    expect(multiSourceSchema.safeParse({ ...source, billingDate: '2026-02-30' }).success).toBe(
      false,
    );
    expect(multiSourceSchema.safeParse({ ...source, billingDate: '2099-01-01' }).success).toBe(
      false,
    );
    expect(
      multiSourceSchema.safeParse({ ...source, organization: 'https://evil.example/path' }).success,
    ).toBe(false);
  });
});
