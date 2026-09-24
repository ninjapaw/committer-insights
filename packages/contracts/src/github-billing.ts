import type { InsightTable } from './insights.js';

export interface GitHubBillingSnapshot {
  source: string;
  scope: 'organization' | 'enterprise';
  dataset:
    | 'usage'
    | 'usage-summary'
    | 'premium-requests'
    | 'ai-credits'
    | 'advanced-security'
    | 'code-security'
    | 'secret-protection';
  period: string;
  collectedAt: string;
  sourceUrl: string;
  apiVersion: string;
  status: 'complete' | 'partial' | 'unavailable';
  coverage: string;
  warnings: string[];
  providerCount?: number;
  repositoryCount?: number;
  maximumCommitters?: number;
  purchasedCommitters?: number;
  repositories: Array<{
    name: string;
    providerCount: number;
    identities: Array<{ login: string; lastPushedAt: string; lastPushedEmail: string }>;
  }>;
  usage: Array<{
    date?: string;
    organization?: string;
    repository?: string;
    product: string;
    sku: string;
    model?: string;
    unit: string;
    pricePerUnit?: number;
    quantity: number;
    discountQuantity?: number;
    netQuantity?: number;
    grossUsd: number;
    discountUsd: number;
    netUsd: number;
  }>;
}

export const githubBillingNote =
  'Provider-reported GitHub billing evidence, not invoices or proof of payment. Do not add organizations to their parent enterprise, summaries to detail, or premium/AI usage to overlapping usage totals. Products and units remain separate. Security snapshots are current at collection, independent of the activity window; organization seats can overlap across an enterprise. Unavailable or empty responses do not establish free usage or zero liability.';

export function githubBillingTables(snapshots: GitHubBillingSnapshot[]): InsightTable[] {
  if (!snapshots.length) return [];
  return [
    {
      title: 'GitHub billing snapshots',
      columns: [
        'Provider',
        'Scope',
        'Source',
        'Dataset',
        'Period UTC',
        'Status',
        'Provider committer count',
        'Repository count',
        'Maximum committers',
        'Purchased committers',
        'Usage rows',
        'Collected at UTC',
        'Coverage',
        'Source URL',
        'API version',
        'Warnings',
      ],
      rows: snapshots.map((item) => [
        'github',
        item.scope,
        item.source,
        item.dataset,
        item.period,
        item.status,
        item.providerCount ?? 'Unavailable',
        item.repositoryCount ?? 'Unavailable',
        item.maximumCommitters ?? 'Unavailable',
        item.purchasedCommitters ?? 'Unavailable',
        item.usage.length,
        item.collectedAt,
        item.coverage,
        item.sourceUrl,
        item.apiVersion,
        item.warnings.join('; '),
      ]),
    },
    {
      title: 'GitHub security billing identities',
      columns: [
        'Provider',
        'Scope',
        'Source',
        'Product',
        'Repository',
        'Repository provider count',
        'User login',
        'Last pushed UTC',
        'Last pushed email',
        'Collected at UTC',
        'Status',
      ],
      rows: snapshots.flatMap((item) =>
        item.repositories.flatMap((repository) =>
          repository.identities.map((identity) => [
            'github',
            item.scope,
            item.source,
            item.dataset,
            repository.name,
            repository.providerCount,
            identity.login,
            identity.lastPushedAt,
            identity.lastPushedEmail,
            item.collectedAt,
            item.status,
          ]),
        ),
      ),
    },
    {
      title: 'GitHub provider usage charges',
      columns: [
        'Provider',
        'Scope',
        'Source',
        'Dataset',
        'Period UTC',
        'Date UTC',
        'Organization',
        'Repository',
        'Product',
        'SKU',
        'Model',
        'Unit',
        'Price per unit USD',
        'Gross quantity',
        'Discount quantity',
        'Net quantity',
        'Gross USD',
        'Discount USD',
        'Net USD',
        'Status',
        'Source URL',
      ],
      rows: snapshots.flatMap((item) =>
        item.usage.map((usage) => [
          'github',
          item.scope,
          item.source,
          item.dataset,
          item.period,
          usage.date ?? 'Period aggregate',
          usage.organization ?? '',
          usage.repository ?? '',
          usage.product,
          usage.sku,
          usage.model ?? '',
          usage.unit,
          usage.pricePerUnit ?? 'Unavailable',
          usage.quantity,
          usage.discountQuantity ?? 'Unavailable',
          usage.netQuantity ?? 'Unavailable',
          usage.grossUsd,
          usage.discountUsd,
          usage.netUsd,
          item.status,
          item.sourceUrl,
        ]),
      ),
    },
    {
      title: 'GitHub security billing repositories',
      columns: [
        'Provider',
        'Scope',
        'Source',
        'Product',
        'Repository',
        'Provider committer count',
        'Returned identity rows',
        'Collected at UTC',
        'Status',
      ],
      rows: snapshots.flatMap((item) =>
        item.repositories.map((repository) => [
          'github',
          item.scope,
          item.source,
          item.dataset,
          repository.name,
          repository.providerCount,
          repository.identities.length,
          item.collectedAt,
          item.status,
        ]),
      ),
    },
  ];
}
