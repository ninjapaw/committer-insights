import { useState } from 'react';
import {
  azureBillingTables,
  azureBillingNote,
  type AzureBillingSnapshot,
  azureAdoptionTables,
  azureAdoptionNote,
  azureEstimateSummaryNote,
  type AzureAdoptionEstimate,
  type RepositoryInsight,
  githubBillingTables,
  githubBillingNote,
  type GitHubBillingSnapshot,
  type InsightTable,
} from '@ninjapaw/contracts';
import type { ColumnDef } from '@tanstack/react-table';
import { ReportTable } from './ReportTable';

export function AzureBillingPanel({
  snapshots,
  timeZone,
  estimates = [],
  repositories = [],
}: {
  snapshots: AzureBillingSnapshot[];
  timeZone?: string;
  estimates?: AzureAdoptionEstimate[];
  repositories?: RepositoryInsight[];
}): JSX.Element {
  return (
    <BillingEvidencePanel
      title="Provider-reported Azure billing"
      note={estimates.length ? azureEstimateSummaryNote : azureBillingNote}
      methodology={estimates.length ? `${azureAdoptionNote} ${azureBillingNote}` : undefined}
      tables={[
        ...azureAdoptionTables(estimates, snapshots, repositories),
        ...azureBillingTables(snapshots, { readableDates: true, timeZone }),
      ]}
    />
  );
}

export function GitHubBillingPanel({
  snapshots,
}: {
  snapshots: GitHubBillingSnapshot[];
}): JSX.Element {
  return (
    <BillingEvidencePanel
      title="Provider-reported GitHub billing"
      note={githubBillingNote}
      tables={githubBillingTables(snapshots)}
    />
  );
}

function BillingEvidencePanel({
  title,
  note,
  tables,
  methodology,
}: {
  title: string;
  note: string;
  tables: InsightTable[];
  methodology?: string;
}): JSX.Element {
  const [view, setView] = useState(tables[0]?.title ?? '');
  const [filter, setFilter] = useState('');
  const table = tables.find((item) => item.title === view) ?? tables[0];
  const columns: ColumnDef<(string | number)[]>[] =
    table?.columns.map((label, index) => ({
      id: String(index),
      header: label,
      accessorFn: (row) => String(row[index] ?? ''),
    })) ?? [];
  return (
    <>
      <h2>{title}</h2>
      <p>{note}</p>
      {methodology && (
        <details>
          <summary>Pricing assumptions and billing comparison limits</summary>
          <p>{methodology}</p>
        </details>
      )}
      {!table ? (
        <p>Billing evidence was not requested or is unavailable in this report.</p>
      ) : (
        <>
          <label>
            Billing dataset
            <select
              value={view}
              onChange={(event) => {
                setView(event.currentTarget.value);
                setFilter('');
              }}
            >
              {tables.map((item) => (
                <option key={item.title} value={item.title}>
                  {item.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            Filter billing rows
            <input
              type="search"
              value={filter}
              onChange={(event) => setFilter(event.currentTarget.value)}
            />
          </label>
          <ReportTable
            key={view}
            data={table.rows}
            columns={columns}
            globalFilter={filter}
            caption={table.title}
            emptyMessage="No rows in this view. Check snapshot and detail status; missing evidence is not zero billing."
          />
        </>
      )}
    </>
  );
}
