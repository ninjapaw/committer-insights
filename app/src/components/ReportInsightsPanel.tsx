import { useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import {
  activityInWindow,
  formatReportDateTime,
  resolveReportTimeZone,
  activitySeries,
  reportingWindow,
  reportingWindows,
  type Report,
  type RepositoryInsight,
  type BillingUsage,
} from '@ninjapaw/contracts';
import { ReportTable } from './ReportTable';
import { RepositoryLink } from './RepositoryLink';

const money = (value: number) =>
  value.toLocaleString('en-US', { style: 'currency', currency: 'USD' });
function BarChart({
  title,
  points,
  currency = false,
}: {
  title: string;
  points: { label: string; value: number }[];
  currency?: boolean;
}): JSX.Element {
  const maximum = Math.max(1, ...points.map((point) => Math.abs(point.value)));
  return (
    <figure className="insight-chart" aria-label={title}>
      <figcaption>{title}</figcaption>
      {!points.length ? (
        <p>Not enough collected data.</p>
      ) : (
        <div className="chart-bars">
          {points.map((point) => (
            <div className="chart-bar" key={point.label}>
              <span>{point.label}</span>
              <span className="chart-track" aria-hidden="true">
                <span style={{ width: `${(Math.abs(point.value) / maximum) * 100}%` }} />
              </span>
              <strong>{currency ? money(point.value) : point.value.toLocaleString()}</strong>
            </div>
          ))}
        </div>
      )}
    </figure>
  );
}

type InventoryRow = RepositoryInsight & { commits?: number; review: string };
const inventoryColumns = (timeZone: string): ColumnDef<InventoryRow>[] => [
  { accessorKey: 'provider', header: 'Provider' },
  { accessorKey: 'source', header: 'Source' },
  { accessorKey: 'project', header: 'Project' },
  {
    accessorKey: 'name',
    header: 'Repository',
    cell: ({ row }) => <RepositoryLink {...row.original} />,
  },
  { accessorKey: 'visibility', header: 'Visibility' },
  { accessorKey: 'state', header: 'Repository state' },
  { id: 'commits', header: 'Window commits', accessorFn: (row) => row.commits ?? 'Unavailable' },
  {
    id: 'features',
    header: 'Current security settings',
    accessorFn: (row) =>
      row.features.length
        ? row.features.map((feature) => `${feature.name}: ${feature.state}`).join('; ')
        : 'Unknown',
  },
  { accessorKey: 'review', header: 'Review signal' },
  {
    accessorKey: 'observedAt',
    header: `Observed ${timeZone}`,
    cell: ({ row }) => formatReportDateTime(row.original.observedAt, timeZone),
  },
];
const billingColumns: ColumnDef<BillingUsage>[] = [
  { accessorKey: 'source', header: 'Source' },
  {
    accessorKey: 'date',
    header: 'Date UTC',
    cell: ({ row }) => formatReportDateTime(row.original.date),
  },
  { accessorKey: 'product', header: 'Product' },
  { accessorKey: 'sku', header: 'SKU' },
  {
    accessorKey: 'repository',
    header: 'Repository',
    cell: ({ row }) => <RepositoryLink {...row.original} name={row.original.repository ?? ''} />,
  },
  { accessorKey: 'quantity', header: 'Quantity' },
  { accessorKey: 'unit', header: 'Unit' },
  ...(['grossUsd', 'discountUsd', 'netUsd'] as const).map((key) => ({
    accessorKey: key,
    header: key === 'netUsd' ? 'Net USD' : key === 'grossUsd' ? 'Gross USD' : 'Discount USD',
    cell: ({ row }: { row: { original: BillingUsage } }) => money(row.original[key]),
  })),
];

export function ReportInsightsPanel({ report }: { report: Report }): JSX.Element {
  const insights = report.insights!;
  const latest = report.generatedAt.slice(0, 10);
  const earliest = [
    ...insights.repositories.map((row) => row.activity.from.slice(0, 10)),
    ...insights.billing.map((row) => row.date),
  ].reduce((first, date) => (date < first ? date : first), latest);
  const availableDays = Math.round((Date.parse(latest) - Date.parse(earliest)) / 86400000) + 1;
  const [days, setDays] = useState(String(Math.min(30, availableDays)));
  const [customFrom, setCustomFrom] = useState(earliest);
  const [customTo, setCustomTo] = useState(latest);
  const [provider, setProvider] = useState('all');
  const [search, setSearch] = useState('');
  const [feature, setFeature] = useState('all');
  const [state, setState] = useState('all');
  const [sort, setSort] = useState('activity');
  const [interval, setInterval] = useState<'day' | 'week' | 'month'>('week');
  const [view, setView] = useState('overview');
  const from =
    days === 'custom'
      ? customFrom
      : reportingWindow(Number(days), new Date(report.generatedAt)).from.slice(0, 10);
  const to = days === 'custom' ? customTo : latest;
  const validRange =
    /^\d{4}-\d{2}-\d{2}$/.test(from) &&
    /^\d{4}-\d{2}-\d{2}$/.test(to) &&
    from <= to &&
    from >= earliest &&
    to <= latest;
  const rows = useMemo(
    () =>
      insights.repositories
        .filter(
          (row) =>
            (provider === 'all' || row.provider === provider) &&
            `${row.source} ${row.project ?? ''} ${row.name}`
              .toLowerCase()
              .includes(search.toLowerCase().trim()) &&
            (feature === 'all' ||
              state === 'all' ||
              (row.features.find((item) => item.name === feature)?.state ?? 'unknown') === state),
        )
        .map((row): InventoryRow => {
          const commits = validRange ? activityInWindow(row, from, to) : undefined;
          const enabled = row.features.some((feature) => feature.state === 'enabled');
          return {
            ...row,
            commits,
            review:
              commits === undefined
                ? 'Activity unavailable; do not infer inactivity'
                : commits === 0 && enabled
                  ? 'Enabled with no observed default-branch activity; review need, not automatic savings'
                  : commits > 0 && row.features.some((feature) => feature.state === 'disabled')
                    ? 'Active repository with disabled controls; review coverage'
                    : row.features.length === 0 ||
                        row.features.some((feature) => feature.state === 'unknown')
                      ? 'Incomplete settings visibility'
                      : 'No selected review signal',
          };
        })
        .sort((left, right) =>
          sort === 'name'
            ? left.name.localeCompare(right.name)
            : (sort === 'least' ? 1 : -1) * ((left.commits ?? -1) - (right.commits ?? -1)),
        ),
    [insights, provider, search, feature, state, sort, validRange, from, to],
  );
  const features = [
    ...new Set(insights.repositories.flatMap((row) => row.features.map((feature) => feature.name))),
  ].sort();
  const series = validRange ? activitySeries(rows, from, to, interval) : [];
  const billing = useMemo(
    () =>
      insights.billing.filter(
        (row) =>
          validRange &&
          (provider === 'all' || row.provider === provider) &&
          row.date >= from &&
          row.date <= to,
      ),
    [insights, provider, validRange, from, to],
  );
  const billedProducts = new Map<string, number>();
  for (const row of billing)
    billedProducts.set(row.product, (billedProducts.get(row.product) ?? 0) + row.netUsd);
  const windows = [
    ...new Set([...reportingWindows.filter((value) => value <= availableDays), availableDays]),
  ].sort((left, right) => left - right);
  return (
    <section className="report-insights" aria-label="Usage and coverage">
      <h2>Usage and coverage</h2>
      <div className="insight-filters">
        <label>
          Reporting period
          <select value={days} onChange={(event) => setDays(event.target.value)}>
            {windows.map((value) => (
              <option key={value} value={value}>
                Last {value} days
              </option>
            ))}
            <option value="custom">Custom dates</option>
          </select>
        </label>
        {days === 'custom' && (
          <>
            <label>
              From (UTC)
              <input
                type="date"
                min={earliest}
                max={latest}
                value={customFrom}
                onChange={(event) => setCustomFrom(event.target.value)}
              />
            </label>
            <label>
              To (UTC)
              <input
                type="date"
                min={earliest}
                max={latest}
                value={customTo}
                onChange={(event) => setCustomTo(event.target.value)}
              />
            </label>
          </>
        )}
        {report.provider === 'combined' && (
          <label>
            Provider
            <select value={provider} onChange={(event) => setProvider(event.target.value)}>
              <option value="all">All providers</option>
              <option value="github">GitHub</option>
              <option value="azure-devops">Azure DevOps</option>
            </select>
          </label>
        )}
        <label>
          Group activity by
          <select
            value={interval}
            onChange={(event) => setInterval(event.target.value as typeof interval)}
          >
            <option value="day">Day</option>
            <option value="week">Week</option>
            <option value="month">Month</option>
          </select>
        </label>
      </div>
      {!validRange && (
        <p role="alert">
          Choose dates between {earliest} and {latest}, with the start before the end.
        </p>
      )}
      <p className="insight-note">
        {formatReportDateTime(from)} to {formatReportDateTime(to)} UTC, inclusive; the final day may
        be incomplete.{' '}
        {report.provider === 'azure-devops'
          ? 'Committer dates, including automation.'
          : report.provider === 'github'
            ? 'Authored dates, excluding two automation accounts.'
            : 'GitHub: authored dates, excluding two automation accounts. Azure: committer dates, including automation.'}
        Default-branch activity is not a billing meter. Settings are current snapshots.
      </p>
      <fieldset className="insight-views">
        <legend className="visually-hidden">Reporting view</legend>
        {['overview', 'repositories', 'billing', 'evidence'].map((name) => (
          <label key={name}>
            <input
              type="radio"
              name="insight-view"
              value={name}
              checked={view === name}
              onChange={() => setView(name)}
            />
            {name[0]!.toUpperCase() + name.slice(1)}
          </label>
        ))}
      </fieldset>
      {(view === 'overview' || view === 'repositories') && (
        <div className="insight-filters">
          <label>
            Repository search
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <label>
            Security feature
            <select value={feature} onChange={(event) => setFeature(event.target.value)}>
              <option value="all">All features</option>
              {features.map((name) => (
                <option key={name}>{name}</option>
              ))}
            </select>
          </label>
          <label>
            Feature state
            <select
              value={state}
              disabled={feature === 'all'}
              onChange={(event) => setState(event.target.value)}
            >
              {['all', 'enabled', 'disabled', 'unknown'].map((value) => (
                <option key={value}>{value}</option>
              ))}
            </select>
          </label>
        </div>
      )}
      {view === 'overview' && (
        <>
          <div className="metric-grid">
            <div className="metric-card">
              <strong>{rows.length}</strong>
              <span>Visible repositories in selection</span>
            </div>
            <div className="metric-card">
              <strong>
                {rows.some((row) => row.commits !== undefined)
                  ? rows.reduce((total, row) => total + (row.commits ?? 0), 0).toLocaleString()
                  : 'Unknown'}
              </strong>
              <span>Observed window commits</span>
            </div>
            <div className="metric-card">
              <strong>{rows.filter((row) => row.commits === undefined).length}</strong>
              <span>Unavailable activity histories</span>
            </div>
            <div className="metric-card">
              <strong>{rows.filter((row) => row.commits === 0).length}</strong>
              <span>No observed window activity</span>
            </div>
          </div>
          <div className="insight-charts">
            <BarChart
              title="Default-branch activity"
              points={series.map((point) => ({
                label: formatReportDateTime(point.date),
                value: point.commits,
              }))}
            />
            <BarChart
              title="Collection-window monthly scenarios (USD, not additive)"
              currency
              points={(report.costEstimates ?? [])
                .filter((line) => provider === 'all' || line.provider === provider)
                .map((line) => ({ label: line.label, value: line.estimatedMonthlyCostUsd }))}
            />
          </div>
          <h3>Current security coverage</h3>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Feature</th>
                  <th>Enabled</th>
                  <th>Disabled</th>
                  <th>Unknown / not reported</th>
                </tr>
              </thead>
              <tbody>
                {features.map((name) => (
                  <tr key={name}>
                    <th scope="row">{name}</th>
                    {(['enabled', 'disabled', 'unknown'] as const).map((value) => {
                      const count = rows.filter(
                        (row) =>
                          (row.features.find((item) => item.name === name)?.state ?? 'unknown') ===
                          value,
                      ).length;
                      return (
                        <td key={value}>
                          <span className={`coverage-count coverage-${value}`}>
                            <meter
                              min={0}
                              max={Math.max(1, rows.length)}
                              value={count}
                              aria-label={`${name} ${value}`}
                            />
                            {count}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="insight-note">
            Enabled does not prove recent scanning or payment. Disabled default setup does not rule
            out custom pipelines. Missing or inapplicable feature fields remain unknown.
          </p>
        </>
      )}
      {view === 'repositories' && (
        <>
          <label>
            Repository order
            <select value={sort} onChange={(event) => setSort(event.target.value)}>
              <option value="activity">Most activity</option>
              <option value="least">Least activity</option>
              <option value="name">Name</option>
            </select>
          </label>
          <ReportTable
            data={rows}
            columns={inventoryColumns(resolveReportTimeZone(report.timeZone))}
            globalFilter=""
            caption="Repository inventory"
            emptyMessage="No matching repositories."
          />
        </>
      )}
      {view === 'billing' && (
        <>
          <label>
            Billing search
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <p>
            Provider-reported metered usage, not an invoice or payment receipt. Zero net usage can
            reflect discounts or enterprise billing; it does not prove a product is free. Different
            quantity units must not be summed.
          </p>
          <BarChart
            title="Reported net usage by product (USD)"
            currency
            points={[...billedProducts].map(([label, value]) => ({ label, value }))}
          />
          <ReportTable
            data={billing}
            columns={billingColumns}
            globalFilter={search}
            caption="Reported billing usage"
            emptyMessage="No billing rows available for this period. Check collection evidence; this is not proof of zero cost."
          />
        </>
      )}
      {view === 'evidence' && (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Provider</th>
                <th>Source</th>
                <th>Dataset</th>
                <th>Status</th>
                <th>Evidence and limitations</th>
              </tr>
            </thead>
            <tbody>
              {insights.checks
                .filter((check) => provider === 'all' || check.provider === provider)
                .map((check, index) => (
                  <tr key={index}>
                    <td>{check.provider}</td>
                    <td>{check.source}</td>
                    <td>{check.dataset}</td>
                    <td>{check.status}</td>
                    <td>{check.detail}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
