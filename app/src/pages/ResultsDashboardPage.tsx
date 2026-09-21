import { useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { createColumnHelper, flexRender, getCoreRowModel, getFilteredRowModel, getPaginationRowModel, getSortedRowModel, useReactTable } from '@tanstack/react-table';
import { getPortalApiToken } from '../auth/get-token';
import type { AzureDevOpsCommitter } from '@ninjapaw/contracts';

interface ReportResponse {
  reportId: string;
  organization: string;
  generatedAt: string;
  azureDevOpsCommitters: AzureDevOpsCommitter[];
  warnings: string[];
}

async function fetchReport(reportId: string): Promise<ReportResponse> {
  const token = await getPortalApiToken();
  const response = await fetch(`/api/reports/${reportId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Unable to load report');
  return (await response.json()) as ReportResponse;
}

const columnHelper = createColumnHelper<AzureDevOpsCommitter>();

const columns = [
  columnHelper.accessor('displayName', { header: 'Display name' }),
  columnHelper.accessor('userPrincipalName', { header: 'User principal name' }),
  columnHelper.accessor('organization', { header: 'Organization' }),
  columnHelper.accessor('resultType', { header: 'Result type' }),
  columnHelper.accessor('plan', { header: 'Effective plan' }),
  columnHelper.accessor('cuid', { header: 'CUID' }),
  columnHelper.accessor('identityId', { header: 'Identity ID' }),
  columnHelper.accessor('collectedAt', { header: 'Collected at' }),
];

export function ResultsDashboardPage(): JSX.Element {
  const { reportId } = useParams();
  const [globalFilter, setGlobalFilter] = useState('');
  const query = useQuery({
    queryKey: ['report', reportId],
    queryFn: () => fetchReport(reportId!),
    enabled: Boolean(reportId),
  });

  const data = useMemo(() => query.data?.azureDevOpsCommitters ?? [], [query.data]);

  const table = useReactTable({
    data,
    columns,
    state: { globalFilter },
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });

  if (query.isLoading) {
    return <p aria-live="polite">Loading report...</p>;
  }
  if (query.isError) {
    return <div role="alert">{(query.error as Error).message}</div>;
  }

  return (
    <section aria-labelledby="results-title">
      <h1 id="results-title">Results dashboard</h1>
      {query.data && query.data.warnings.length > 0 && (
        <ul role="status">
          {query.data.warnings.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      )}

      <label htmlFor="results-search">Search</label>
      <input
        id="results-search"
        value={globalFilter}
        onChange={(event) => setGlobalFilter(event.currentTarget.value)}
      />

      {data.length === 0 ? (
        <p>No committers were returned for this report.</p>
      ) : (
        <table>
          <caption className="visually-hidden">Azure DevOps committers</caption>
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id} scope="col">
                    {flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {reportId && (
        <a href={`/api/reports/${reportId}/export.xlsx`}>Download Excel</a>
      )}
    </section>
  );
}
