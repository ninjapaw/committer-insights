import type { Report } from './index.js';
import type { InsightTable } from './insights.js';
import { providerReport, reportProviderNames } from './provider-report.js';

export const reportOverviewNote =
  'Collected rows are evidence records, not licensed users. Usage subtotals keep source, scope, period, product and unit separate. Complete monthly usage summaries take precedence over overlapping daily detail; premium/AI breakdowns remain in the evidence appendix. Never add organizations to a parent enterprise or treat these amounts as invoices. Empty results and inaccessible datasets do not establish zero liability.';

export function reportOverviewTables(input: Report): InsightTable[] {
  const providers =
    input.provider === 'combined' ? (['azure-devops', 'github'] as const) : [input.provider];
  const overview: InsightTable = {
    title: 'Collection at a glance',
    columns: ['Provider', 'Dataset', 'Collected', 'Interpretation'],
    rows: [],
  };
  const amounts: InsightTable = {
    title: 'Reported usage subtotals',
    columns: [
      'Provider',
      'Source',
      'Scope',
      'Period UTC',
      'Product',
      'Unit',
      'Gross USD',
      'Discount USD',
      'Net USD',
      'Basis',
      'Coverage',
    ],
    rows: [],
  };
  for (const provider of providers) {
    const report = providerReport(input, provider);
    const label = reportProviderNames[provider];
    const insights = report.insights;
    const repositories = insights?.repositories ?? [];
    const snapshots =
      provider === 'azure-devops'
        ? (insights?.azureBilling ?? [])
        : (insights?.githubBilling ?? []);
    const statusCounts = ['complete', 'partial', 'unavailable']
      .map((status) => `${snapshots.filter((item) => item.status === status).length} ${status}`)
      .join('; ');
    overview.rows.push(
      [
        label,
        'Source coverage',
        `${report.executiveSummary?.includedSources ?? 0} included; ${report.executiveSummary?.skippedSources ?? 0} skipped`,
        'Included means some data was accessible, not that every dataset succeeded.',
      ],
      [
        label,
        'Repository inventory',
        repositories.length,
        `${repositories.filter((repository) => repository.activity.status === 'complete').length} with complete default-branch activity. Visible scope only.`,
      ],
      [
        label,
        'Provider billing datasets',
        snapshots.length ? statusCounts : 'Not recorded',
        'Each product/period has separate status; unavailable is not zero. See coverage details.',
      ],
      [
        label,
        'Daily usage detail',
        insights?.billing.length ?? 0,
        'Raw usage rows, not seats. Summarized separately below; do not add to monthly aggregates.',
      ],
    );
    if (provider === 'azure-devops')
      overview.rows.push([
        label,
        'Enablement estimates',
        insights?.azureEstimates?.length ?? 'Legacy identity-only estimate',
        'Potential usage if enabled, not current charges. Two product rows can describe the same person.',
      ]);
    const groups = new Map<
      string,
      { gross: number; discount: number; net: number; fields: string[] }
    >();
    const add = (
      source: string,
      scope: string,
      period: string,
      product: string,
      unit: string,
      basis: string,
      coverage: string,
      gross: number,
      discount: number,
      net: number,
    ) => {
      const fields = [label, source, scope, period, product, unit, basis, coverage];
      const key = JSON.stringify(fields);
      const group = groups.get(key) ?? { gross: 0, discount: 0, net: 0, fields };
      group.gross += gross;
      group.discount += discount;
      group.net += net;
      groups.set(key, group);
    };
    if (provider === 'github' && insights?.githubBilling?.length) {
      const scopes = new Map<string, typeof insights.githubBilling>();
      for (const snapshot of insights.githubBilling) {
        if (snapshot.dataset !== 'usage' && snapshot.dataset !== 'usage-summary') continue;
        const key = JSON.stringify([
          snapshot.scope,
          snapshot.source.toLowerCase(),
          snapshot.period,
        ]);
        scopes.set(key, [...(scopes.get(key) ?? []), snapshot]);
      }
      for (const candidates of scopes.values()) {
        const summaries = candidates.filter(
          (item) => item.dataset === 'usage-summary' && item.status === 'complete',
        );
        const details = candidates.filter(
          (item) => item.dataset === 'usage' && item.status !== 'unavailable',
        );
        const selected =
          summaries.length === 1
            ? summaries[0]
            : summaries.length === 0 && details.length === 1
              ? details[0]
              : undefined;
        if (!selected) {
          overview.rows.push([
            label,
            `Usage subtotal: ${candidates[0]!.source} ${candidates[0]!.period}`,
            'Unavailable',
            'No unambiguous readable dataset; inspect original snapshots.',
          ]);
          continue;
        }
        if (!selected.usage.length)
          overview.rows.push([
            label,
            `Usage subtotal: ${selected.source} ${selected.period}`,
            'No rows returned',
            'No monetary total inferred from an empty response.',
          ]);
        for (const usage of selected.usage)
          add(
            selected.source,
            selected.scope,
            selected.period,
            usage.product,
            usage.unit,
            selected.dataset,
            `${selected.status}: ${selected.coverage}`,
            usage.grossUsd,
            usage.discountUsd,
            usage.netUsd,
          );
      }
    } else {
      for (const usage of insights?.billing ?? [])
        add(
          usage.source,
          'Scope not recorded',
          usage.date.slice(0, 7),
          usage.product,
          usage.unit,
          'Returned daily rows only',
          'Legacy detail subtotal; completeness and billing scope not independently verified.',
          usage.grossUsd,
          usage.discountUsd,
          usage.netUsd,
        );
    }
    for (const { fields, gross, discount, net } of groups.values())
      amounts.rows.push([
        ...fields.slice(0, 6),
        `$${gross.toFixed(2)}`,
        `$${discount.toFixed(2)}`,
        `$${net.toFixed(2)}`,
        ...fields.slice(6),
      ]);
  }
  return [overview, amounts];
}
