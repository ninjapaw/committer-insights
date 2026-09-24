import type { DailyActivity } from './github.js';
import { formatReportDateTime, resolveReportTimeZone } from './date-display.js';

export const reportingWindows = [7, 30, 90, 180, 365] as const;
export type ReportingProvider = 'github' | 'azure-devops';
export type SettingState = 'enabled' | 'disabled' | 'unknown';
export interface SecurityFeature {
  name: string;
  state: SettingState;
}
export interface RepositoryInsight {
  provider: ReportingProvider;
  source: string;
  id: string;
  name: string;
  project?: string;
  visibility: string;
  state: 'active' | 'archived' | 'disabled' | 'unknown';
  features: SecurityFeature[];
  observedAt: string;
  activity: {
    status: 'complete' | 'unavailable';
    from: string;
    to: string;
    daily: DailyActivity[];
    reason?: string;
  };
}
export interface CollectionCheck {
  provider: ReportingProvider;
  source: string;
  dataset: string;
  status: 'complete' | 'partial' | 'unavailable' | 'not-requested';
  detail: string;
}
export interface BillingUsage {
  provider: ReportingProvider;
  source: string;
  date: string;
  product: string;
  sku: string;
  repository?: string;
  quantity: number;
  unit: string;
  grossUsd: number;
  discountUsd: number;
  netUsd: number;
}
export interface ReportInsights {
  repositories: RepositoryInsight[];
  billing: BillingUsage[];
  checks: CollectionCheck[];
}
export function emptyInsights(): ReportInsights {
  return { repositories: [], billing: [], checks: [] };
}
export function repositoryWebUrl(
  repository: Pick<RepositoryInsight, 'provider' | 'source' | 'name' | 'project'>,
): string | undefined {
  const validPart = (part: string) =>
    Boolean(part.trim()) &&
    part !== '.' &&
    part !== '..' &&
    !/[\\/]/.test(part) &&
    Array.from(part).every(
      (character) => character.charCodeAt(0) >= 32 && character.charCodeAt(0) !== 127,
    );
  if (repository.provider === 'github') {
    const parts = repository.name.includes('/')
      ? repository.name.split('/')
      : [repository.source, repository.name];
    if (parts.length !== 2 || !parts.every(validPart)) return undefined;
    return `https://github.com/${parts.map(encodeURIComponent).join('/')}`;
  }
  const parts = [repository.source, repository.project ?? '', repository.name];
  if (!parts.every(validPart)) return undefined;
  return `https://dev.azure.com/${encodeURIComponent(parts[0]!)}/${encodeURIComponent(parts[1]!)}/_git/${encodeURIComponent(parts[2]!)}`;
}
export function reportingWindow(days: number, now = new Date()): { from: string; to: string } {
  const start = new Date(now);
  start.setUTCHours(0, 0, 0, 0);
  start.setUTCDate(start.getUTCDate() - days + 1);
  return { from: start.toISOString(), to: now.toISOString() };
}
export function mergeDailyActivity(...series: (DailyActivity[] | undefined)[]): DailyActivity[] {
  const totals = new Map<string, number>();
  for (const point of series.flatMap((items) => items ?? [])) {
    totals.set(point.date, (totals.get(point.date) ?? 0) + point.commits);
  }
  return [...totals]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([date, commits]) => ({ date, commits }));
}
export function repositoryKey(repository: RepositoryInsight): string {
  return `${repository.provider}:${repository.provider === 'azure-devops' ? repository.source.toLowerCase() + ':' : ''}${repository.id.toLowerCase()}`;
}
export function uniqueRepositories(repositories: RepositoryInsight[]): RepositoryInsight[] {
  const unique = new Map<string, RepositoryInsight>();
  for (const repository of repositories) {
    const key = repositoryKey(repository);
    const previous = unique.get(key);
    if (
      !previous ||
      (repository.activity.status === 'complete' &&
        (previous.activity.status !== 'complete' ||
          repository.activity.from < previous.activity.from))
    ) {
      unique.set(key, repository);
    }
  }
  return [...unique.values()].sort((left, right) => left.name.localeCompare(right.name));
}
export function activityInWindow(
  repository: RepositoryInsight,
  from: string,
  to: string,
): number | undefined {
  if (repository.activity.status !== 'complete' || from < repository.activity.from.slice(0, 10))
    return undefined;
  return repository.activity.daily
    .filter((point) => point.date >= from && point.date <= to)
    .reduce((total, point) => total + point.commits, 0);
}

export function activitySeries(
  repositories: RepositoryInsight[],
  from: string,
  to: string,
  interval: 'day' | 'week' | 'month',
): DailyActivity[] {
  const complete = repositories.filter(
    (repository) => activityInWindow(repository, from, to) !== undefined,
  );
  if (!complete.length) return [];
  const daily = new Map(
    mergeDailyActivity(...complete.map((repository) => repository.activity.daily)).map((point) => [
      point.date,
      point.commits,
    ]),
  );
  const buckets = new Map<string, number>();
  for (
    const cursor = new Date(`${from}T00:00:00Z`);
    cursor <= new Date(`${to}T00:00:00Z`);
    cursor.setUTCDate(cursor.getUTCDate() + 1)
  ) {
    const date = cursor.toISOString().slice(0, 10);
    const bucket = new Date(cursor);
    if (interval === 'week')
      bucket.setUTCDate(bucket.getUTCDate() - ((bucket.getUTCDay() + 6) % 7));
    if (interval === 'month') bucket.setUTCDate(1);
    const key = bucket.toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) ?? 0) + (daily.get(date) ?? 0));
  }
  return [...buckets].map(([date, commits]) => ({ date, commits }));
}

export interface InsightTable {
  title: string;
  columns: string[];
  rows: (string | number)[][];
  repositoryUrls?: (string | undefined)[];
}
export function insightTables(
  insights: ReportInsights,
  options: { readableDates?: boolean; timeZone?: string } = {},
): InsightTable[] {
  const timeZone = options.readableDates ? resolveReportTimeZone(options.timeZone) : 'UTC';
  const displayDate = options.readableDates
    ? (value: string) => formatReportDateTime(value, timeZone)
    : (value: string) => value;
  return [
    {
      title: 'Repository inventory',
      repositoryUrls: insights.repositories.map(repositoryWebUrl),
      columns: [
        'Provider',
        'Source',
        'Repository',
        'Project',
        'Visibility',
        'State',
        `Observed ${timeZone}`,
        'Activity status',
        `From ${timeZone}`,
        `To ${timeZone}`,
        'Commits',
        'Reason',
      ],
      rows: insights.repositories.map((row) => [
        row.provider,
        row.source,
        row.name,
        row.project ?? '',
        row.visibility,
        row.state,
        displayDate(row.observedAt),
        row.activity.status,
        displayDate(row.activity.from),
        displayDate(row.activity.to),
        row.activity.status === 'complete'
          ? row.activity.daily.reduce((total, point) => total + point.commits, 0)
          : 'Unavailable',
        row.activity.reason ?? '',
      ]),
    },
    {
      title: 'Security settings',
      repositoryUrls: insights.repositories.flatMap((row) =>
        row.features.map(() => repositoryWebUrl(row)),
      ),
      columns: ['Provider', 'Source', 'Repository', 'Feature', 'State', `Observed ${timeZone}`],
      rows: insights.repositories.flatMap((row) =>
        row.features.map((feature) => [
          row.provider,
          row.source,
          row.name,
          feature.name,
          feature.state,
          displayDate(row.observedAt),
        ]),
      ),
    },
    {
      title: 'Daily activity',
      repositoryUrls: insights.repositories.flatMap((row) =>
        row.activity.daily.map(() => repositoryWebUrl(row)),
      ),
      columns: ['Provider', 'Source', 'Repository', 'Date UTC', 'Commits'],
      rows: insights.repositories.flatMap((row) =>
        row.activity.daily.map((point) => [
          row.provider,
          row.source,
          row.name,
          displayDate(point.date),
          point.commits,
        ]),
      ),
    },
    {
      title: 'Reported billing usage',
      repositoryUrls: insights.billing.map((row) =>
        repositoryWebUrl({ ...row, name: row.repository ?? '' }),
      ),
      columns: [
        'Provider',
        'Source',
        'Date UTC',
        'Product',
        'SKU',
        'Repository',
        'Quantity',
        'Unit',
        'Gross USD',
        'Discount USD',
        'Net USD',
      ],
      rows: insights.billing.map((row) => [
        row.provider,
        row.source,
        displayDate(row.date),
        row.product,
        row.sku,
        row.repository ?? '',
        row.quantity,
        row.unit,
        row.grossUsd,
        row.discountUsd,
        row.netUsd,
      ]),
    },
    {
      title: 'Collection evidence',
      columns: ['Provider', 'Source', 'Dataset', 'Status', 'Detail'],
      rows: insights.checks.map((row) => [
        row.provider,
        row.source,
        row.dataset,
        row.status,
        row.detail,
      ]),
    },
  ];
}
