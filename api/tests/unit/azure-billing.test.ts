import { describe, expect, it, vi } from 'vitest';
import {
  emptyInsights,
  azureBillingGroups,
  azureBillingTables,
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
