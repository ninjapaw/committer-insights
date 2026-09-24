import { z } from 'zod';
import {
  gitHubTargetSchema,
  reportingWindow,
  type GitHubBillingSnapshot,
  type MultiSource,
  type ReportInsights,
} from '@ninjapaw/contracts';
import { API_ORIGIN, MAX_PAGES, nextPage, request } from './http-client.js';

const version = '2026-03-10';
const count = z.number().int().nonnegative();
const securitySchema = z.object({
  total_advanced_security_committers: count,
  total_count: count,
  maximum_advanced_security_committers: count.optional(),
  purchased_advanced_security_committers: count.optional(),
  repositories: z
    .array(
      z.object({
        name: z.string().min(1),
        advanced_security_committers: count,
        advanced_security_committers_breakdown: z
          .array(
            z.object({
              user_login: z.string().min(1),
              last_pushed_date: z.string().refine((value) => Number.isFinite(Date.parse(value))),
              last_pushed_email: z.string(),
            }),
          )
          .max(100000),
      }),
    )
    .max(100),
});
const amount = z.number().finite();
const usageItem = z.object({
  product: z.string(),
  sku: z.string(),
  unitType: z.string(),
  model: z.string().optional(),
  pricePerUnit: amount,
  grossAmount: amount,
  discountAmount: amount,
  netAmount: amount,
  organizationName: z.string().optional(),
  repositoryName: z.string().optional(),
});
const detailSchema = z.object({
  usageItems: z
    .array(
      usageItem.extend({
        date: z.string().refine((value) => Number.isFinite(Date.parse(value))),
        quantity: amount,
      }),
    )
    .max(100000),
});
const summarySchema = z.object({
  timePeriod: z.object({ year: count, month: count, day: count.optional() }),
  organization: z.string().optional(),
  enterprise: z.string().optional(),
  usageItems: z
    .array(
      usageItem.extend({ grossQuantity: amount, discountQuantity: amount, netQuantity: amount }),
    )
    .max(100000),
});

async function json(response: Response): Promise<unknown> {
  if (!response.body) throw new Error('Missing billing response.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > 16 * 1024 * 1024) throw new Error('Billing response exceeds limit.');
      chunks.push(result.value);
    }
  } finally {
    await reader.cancel();
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function collectGitHubBillingSnapshots(
  source: Extract<MultiSource, { provider: 'github' }>,
  token: string,
  insights: ReportInsights,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const check = { provider: 'github' as const, source: source.target, dataset: 'Billing usage' };
  if (!source.includeBilling) {
    insights.checks.push({
      ...check,
      status: 'not-requested',
      detail: 'Optional billing collection was not selected. Payment status is unknown.',
    });
    return;
  }
  const target = gitHubTargetSchema.parse(source.target);
  const collectedAt = new Date().toISOString();
  const window = reportingWindow(source.sinceDays);
  const snapshots: GitHubBillingSnapshot[] = [];
  const base = (
    dataset: GitHubBillingSnapshot['dataset'],
    url: URL,
    period: string,
    coverage: string,
  ): GitHubBillingSnapshot => ({
    source: target,
    scope: source.targetType,
    dataset,
    period,
    collectedAt,
    sourceUrl: url.href,
    apiVersion: version,
    status: 'unavailable',
    coverage,
    warnings: [],
    repositories: [],
    usage: [],
  });
  for (const dataset of ['advanced-security', 'code-security', 'secret-protection'] as const) {
    const url = new URL(`/orgs/${target}/settings/billing/advanced-security`, API_ORIGIN);
    if (dataset !== 'advanced-security')
      url.searchParams.set('advanced_security_product', dataset.replace('-', '_'));
    url.searchParams.set('per_page', '100');
    url.searchParams.set('page', '1');
    const snapshot = base(
      dataset,
      url,
      'Current snapshot',
      'Current provider active committers; not selected-window commit counts. Product views may overlap and must not be summed.',
    );
    snapshots.push(snapshot);
    if (source.targetType === 'enterprise') {
      snapshot.sourceUrl = 'https://docs.github.com/en/rest/billing/billing';
      snapshot.warnings.push(
        'The documented security billing endpoint is organization-scoped. Collect member organizations separately; no enterprise-wide security seat total is inferred.',
      );
      continue;
    }
    try {
      let next: URL | undefined = url;
      const visited = new Set<string>();
      const repositories = new Set<string>();
      let identityRows = 0;
      while (next) {
        if (
          visited.size >= MAX_PAGES ||
          visited.has(next.href) ||
          next.origin !== API_ORIGIN ||
          next.pathname !== url.pathname ||
          next.username ||
          next.password ||
          next.searchParams.get('advanced_security_product') !==
            url.searchParams.get('advanced_security_product')
        )
          throw new Error('Invalid billing pagination.');
        visited.add(next.href);
        const response = await request(next, token, fetchImpl, version);
        const body = securitySchema.parse(await json(response));
        if (
          snapshot.providerCount !== undefined &&
          (snapshot.providerCount !== body.total_advanced_security_committers ||
            snapshot.repositoryCount !== body.total_count ||
            snapshot.maximumCommitters !== body.maximum_advanced_security_committers ||
            snapshot.purchasedCommitters !== body.purchased_advanced_security_committers)
        )
          throw new Error('Snapshot changed during pagination.');
        snapshot.providerCount = body.total_advanced_security_committers;
        snapshot.repositoryCount = body.total_count;
        snapshot.maximumCommitters = body.maximum_advanced_security_committers;
        snapshot.purchasedCommitters = body.purchased_advanced_security_committers;
        for (const repository of body.repositories) {
          const name = repository.name.toLowerCase();
          if (repositories.has(name)) throw new Error('Duplicate billing repository.');
          repositories.add(name);
          identityRows += repository.advanced_security_committers_breakdown.length;
          if (identityRows > 100000) throw new Error('Billing identity limit exceeded.');
          snapshot.repositories.push({
            name: repository.name,
            providerCount: repository.advanced_security_committers,
            identities: repository.advanced_security_committers_breakdown.map((identity) => ({
              login: identity.user_login,
              lastPushedAt: identity.last_pushed_date,
              lastPushedEmail: identity.last_pushed_email,
            })),
          });
        }
        next = nextPage(response);
        if (!next && repositories.size < body.total_count && body.repositories.length) {
          next = new URL(url);
          next.searchParams.set('page', String(visited.size + 1));
        }
      }
      // Repository memberships overlap; compare distinct logins with the provider's seat count.
      const identities = new Set(
        snapshot.repositories.flatMap((repository) =>
          repository.identities.map((identity) => identity.login.toLowerCase()),
        ),
      );
      const complete =
        snapshot.repositoryCount === snapshot.repositories.length &&
        snapshot.providerCount === identities.size &&
        snapshot.repositories.every(
          (repository) =>
            repository.providerCount === repository.identities.length &&
            new Set(repository.identities.map((identity) => identity.login.toLowerCase())).size ===
              repository.identities.length,
        );
      snapshot.status = complete ? 'complete' : 'partial';
      if (!complete)
        snapshot.warnings.push(
          'Provider counts and returned identities/repositories do not reconcile. Counts retained; detail is incomplete, not zero.',
        );
    } catch {
      snapshot.status = snapshot.providerCount !== undefined ? 'partial' : 'unavailable';
      snapshot.warnings.push(
        'Security billing unavailable, denied, incomplete, or unsupported for this plan/token. Bundle and standalone product requests are not interchangeable. No permission changes requested.',
      );
    }
  }
  const start = new Date(window.from);
  const end = new Date(window.to);
  for (
    const month = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
    month <= end;
    month.setUTCMonth(month.getUTCMonth() + 1)
  ) {
    const prefix = source.targetType === 'enterprise' ? 'enterprises' : 'organizations';
    for (const [dataset, path] of [
      ['usage', 'usage'],
      ['usage-summary', 'usage/summary'],
      ['premium-requests', 'premium_request/usage'],
      ['ai-credits', 'ai_credit/usage'],
    ] as const) {
      const url = new URL(`/${prefix}/${target}/settings/billing/${path}`, API_ORIGIN);
      url.searchParams.set('year', String(month.getUTCFullYear()));
      url.searchParams.set('month', String(month.getUTCMonth() + 1));
      const period = month.toISOString().slice(0, 7);
      // Aggregates cover the full month and overlap detail; only daily rows can be window-filtered.
      const coverage =
        dataset === 'usage'
          ? `Daily rows filtered to ${window.from.slice(0, 10)} through ${window.to.slice(0, 10)}. ${source.targetType === 'enterprise' ? 'Enterprise detail excludes assigned cost centers by API default; use usage-summary for all-cost-center amounts.' : 'Only usage billed to this organization; enterprise-paid usage may be absent.'}`
          : 'Full calendar-month aggregate (current month to date), NOT clipped to the activity window. Enterprise summary spans all cost centers. Overlaps other datasets; never add them together.';
      const snapshot = base(dataset, url, period, coverage);
      snapshots.push(snapshot);
      try {
        const response = await request(url, token, fetchImpl, version);
        if (response.headers.get('link')?.includes('rel="next"'))
          throw new Error('Unexpected paginated aggregate.');
        const body = await json(response);
        if (dataset === 'usage') {
          const parsed = detailSchema.parse(body);
          if (
            parsed.usageItems.some(
              (item) =>
                item.date.slice(0, 7) !== period ||
                (source.targetType === 'organization' &&
                  item.organizationName &&
                  item.organizationName.toLowerCase() !== target.toLowerCase()),
            )
          )
            throw new Error('Unexpected billing scope.');
          snapshot.usage = parsed.usageItems
            .filter((item) => {
              const date = new Date(item.date).toISOString().slice(0, 10);
              return date >= window.from.slice(0, 10) && date <= window.to.slice(0, 10);
            })
            .map((item) => ({
              date: item.date,
              organization: item.organizationName,
              repository: item.repositoryName,
              product: item.product,
              sku: item.sku,
              unit: item.unitType,
              pricePerUnit: item.pricePerUnit,
              quantity: item.quantity,
              grossUsd: item.grossAmount,
              discountUsd: item.discountAmount,
              netUsd: item.netAmount,
            }));
          insights.billing.push(
            ...snapshot.usage.map((item) => ({
              provider: 'github' as const,
              source: target,
              date: item.date!.slice(0, 10),
              product: item.product,
              sku: item.sku,
              repository: item.repository,
              quantity: item.quantity,
              unit: item.unit,
              grossUsd: item.grossUsd,
              discountUsd: item.discountUsd,
              netUsd: item.netUsd,
            })),
          );
        } else {
          const parsed = summarySchema.parse(body);
          if (
            parsed.timePeriod.year !== month.getUTCFullYear() ||
            parsed.timePeriod.month !== month.getUTCMonth() + 1 ||
            parsed.timePeriod.day !== undefined ||
            (source.targetType === 'enterprise'
              ? parsed.enterprise
              : parsed.organization
            )?.toLowerCase() !== target.toLowerCase()
          )
            throw new Error('Unexpected aggregate period or scope.');
          snapshot.usage = parsed.usageItems.map((item) => ({
            product: item.product,
            sku: item.sku,
            model: item.model,
            unit: item.unitType,
            pricePerUnit: item.pricePerUnit,
            quantity: item.grossQuantity,
            discountQuantity: item.discountQuantity,
            netQuantity: item.netQuantity,
            grossUsd: item.grossAmount,
            discountUsd: item.discountAmount,
            netUsd: item.netAmount,
          }));
        }
        snapshot.status = 'complete';
        if (!snapshot.usage.length)
          snapshot.warnings.push(
            'No usage rows returned. This does not prove a free plan or no billing obligations.',
          );
      } catch {
        snapshot.warnings.push(
          'Dataset unavailable, denied, truncated, or incompatible with this API version. Check billing-account scope and existing billing permissions; missing usage is not zero.',
        );
      }
    }
  }
  insights.githubBilling ??= [];
  insights.githubBilling.push(...snapshots);
  const successes = snapshots.filter((snapshot) => snapshot.status !== 'unavailable');
  insights.checks.push({
    ...check,
    status: !successes.length
      ? 'unavailable'
      : snapshots.every((snapshot) => snapshot.status === 'complete')
        ? 'complete'
        : 'partial',
    detail: `${successes.length} of ${snapshots.length} requested billing datasets returned evidence. Review per-dataset coverage. Not an invoice, payment confirmation, or an additive cross-scope total.`,
  });
}
