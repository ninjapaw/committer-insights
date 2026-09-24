import { afterEach, describe, expect, it, vi } from 'vitest';
import { emptyInsights, githubBillingTables } from '@ninjapaw/contracts';
import { collectGitHubBillingSnapshots } from '../../src/adapters/github/billing-client.js';

const source = {
  provider: 'github' as const,
  targetType: 'organization' as const,
  target: 'example',
  sinceDays: 7,
  includeBilling: true,
};
const identity = {
  user_login: 'sample',
  last_pushed_date: '2026-09-20T10:00:00Z',
  last_pushed_email: 'sample@example.test',
};
const repository = (name: string) => ({
  name,
  advanced_security_committers: 1,
  advanced_security_committers_breakdown: [identity],
});
const security = {
  total_advanced_security_committers: 1,
  total_count: 1,
  repositories: [repository('example/one')],
};
const usage = {
  product: 'Actions',
  sku: 'linux',
  unitType: 'minutes',
  pricePerUnit: 0.01,
  grossAmount: 1,
  discountAmount: 0.4,
  netAmount: 0.6,
};
afterEach(() => {
  vi.useRealTimers();
});
async function collect(handler: (url: URL) => Response, enterprise = false) {
  vi.useFakeTimers().setSystemTime(new Date('2026-09-24T12:00:00Z'));
  const insights = emptyInsights();
  const fetchImpl = vi.fn(async (input: string | URL | Request) => handler(new URL(String(input))));
  await collectGitHubBillingSnapshots(
    { ...source, targetType: enterprise ? 'enterprise' : 'organization' },
    'not-exported-token',
    insights,
    fetchImpl,
  );
  return { insights, fetchImpl };
}
describe('GitHub provider-reported billing', () => {
  it('paginates repository breakdowns without summing overlapping users', async () => {
    const { insights } = await collect((url) =>
      url.pathname.endsWith('advanced-security')
        ? Response.json({
            ...security,
            total_count: 2,
            repositories: [repository(`example/${url.searchParams.get('page')}`)],
          })
        : new Response('', { status: 403 }),
    );
    expect(
      insights.githubBilling?.slice(0, 3).every((snapshot) => snapshot.status === 'complete'),
    ).toBe(true);
    expect(insights.githubBilling?.[0]).toMatchObject({ providerCount: 1, repositoryCount: 2 });
    expect(insights.githubBilling?.[0]?.repositories).toHaveLength(2);
    expect(githubBillingTables(insights.githubBilling!)[1]?.rows).toHaveLength(6);
    expect(JSON.stringify(insights)).not.toContain('not-exported-token');
  });
  it('retains provider counts when later pages are denied', async () => {
    const { insights } = await collect((url) =>
      url.pathname.endsWith('advanced-security') && url.searchParams.get('page') === '1'
        ? Response.json({ ...security, total_count: 2 })
        : new Response('', { status: 403 }),
    );
    expect(insights.githubBilling?.[0]).toMatchObject({
      status: 'partial',
      providerCount: 1,
      repositoryCount: 2,
    });
    expect(insights.githubBilling?.[0]?.repositories).toHaveLength(1);
  });
  it('rejects pagination that changes scope or endpoint without forwarding credentials', async () => {
    const { insights, fetchImpl } = await collect((url) =>
      url.pathname.endsWith('advanced-security')
        ? Response.json(security, {
            headers: {
              link: '<https://api.github.com/orgs/other/settings/billing/advanced-security?page=2>; rel="next"',
            },
          })
        : new Response('', { status: 403 }),
    );
    expect(insights.githubBilling?.[0]?.status).toBe('partial');
    expect(fetchImpl.mock.calls.every(([url]) => !String(url).includes('/other/'))).toBe(true);
  });
  it('keeps missing and mismatched security counts unavailable or partial, not zero', async () => {
    const { insights } = await collect((url) =>
      url.pathname.endsWith('advanced-security')
        ? Response.json({ ...security, total_advanced_security_committers: 12 })
        : new Response('', { status: 403 }),
    );
    expect(insights.githubBilling?.[0]).toMatchObject({ status: 'partial', providerCount: 12 });
    expect(
      insights.githubBilling?.find((item) => item.dataset === 'usage')?.providerCount,
    ).toBeUndefined();
  });
  it('preserves enterprise aggregate fields and distinguishes cost-center detail from all-center summary', async () => {
    const { insights, fetchImpl } = await collect(
      (url) =>
        url.pathname.endsWith('/billing/usage')
          ? Response.json({
              usageItems: [
                {
                  ...usage,
                  date: '2026-09-20',
                  quantity: 100,
                  organizationName: 'child-org',
                  repositoryName: 'child-org/repo',
                },
              ],
            })
          : Response.json({
              enterprise: 'example',
              timePeriod: { year: 2026, month: 9 },
              usageItems: [
                {
                  ...usage,
                  model: 'example-model',
                  grossQuantity: 100,
                  discountQuantity: 40,
                  netQuantity: 60,
                },
              ],
            }),
      true,
    );
    expect(fetchImpl).toHaveBeenCalledTimes(4);
    expect(
      insights.githubBilling?.find((item) => item.dataset === 'advanced-security')?.status,
    ).toBe('unavailable');
    const summary = insights.githubBilling?.find((item) => item.dataset === 'usage-summary');
    expect(summary).toMatchObject({ status: 'complete', period: '2026-09' });
    expect(summary?.usage[0]).toMatchObject({
      quantity: 100,
      discountQuantity: 40,
      netQuantity: 60,
      pricePerUnit: 0.01,
      netUsd: 0.6,
    });
    expect(summary?.coverage).toContain('Full calendar-month');
    expect(insights.githubBilling?.find((item) => item.dataset === 'usage')?.coverage).toContain(
      'excludes assigned cost centers',
    );
    expect(insights.billing).toHaveLength(1);
  });
  it('rejects aggregate scope and period mismatches independently', async () => {
    const { insights } = await collect((url) =>
      url.pathname.endsWith('/billing/usage')
        ? new Response('', { status: 403 })
        : Response.json({
            organization: 'wrong',
            timePeriod: { year: 2025, month: 8 },
            usageItems: [],
          }),
    );
    expect(insights.githubBilling?.every((item) => item.status === 'unavailable')).toBe(true);
    expect(insights.checks[0]?.status).toBe('unavailable');
  });
  it('keeps successful months when another month is denied', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-01-05T12:00:00Z'));
    const insights = emptyInsights();
    await collectGitHubBillingSnapshots(
      source,
      'token',
      insights,
      vi.fn(async (input) => {
        const url = new URL(String(input));
        return url.pathname.endsWith('/billing/usage') && url.searchParams.get('year') === '2025'
          ? Response.json({ usageItems: [{ ...usage, date: '2025-12-31', quantity: 100 }] })
          : new Response('', { status: 403 });
      }),
    );
    expect(insights.billing).toHaveLength(1);
    expect(
      insights.githubBilling?.filter((item) => item.dataset === 'usage').map((item) => item.status),
    ).toEqual(['complete', 'unavailable']);
  });
});
