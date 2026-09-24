import { reportOverviewTables, reportOverviewNote, type Report } from '@ninjapaw/contracts';
import { ReportTable } from './ReportTable';

export function ReportOverview({ report }: { report: Report }): JSX.Element {
  const tables = reportOverviewTables(report);
  const amounts = tables[1]!;
  const columns = ['Source', 'Period UTC', 'Product', 'Net USD', 'Basis'];
  const compact = {
    ...amounts,
    columns,
    rows: amounts.rows.map((row) => columns.map((column) => row[amounts.columns.indexOf(column)]!)),
  };
  return (
    <>
      {(report.provider === 'azure-devops' && !amounts.rows.length
        ? [tables[0]!]
        : [tables[0]!, compact]
      ).map((table) => (
        <ReportTable
          key={table.title}
          caption={table.title}
          data={table.rows}
          globalFilter=""
          columns={table.columns.map((header, index) => ({
            id: String(index),
            header,
            accessorFn: (row: (string | number)[]) => row[index] ?? '',
          }))}
          emptyMessage="No readable usage amounts collected. Estimates are separate; missing billing does not mean zero charges."
        />
      ))}
      {(report.provider !== 'azure-devops' || amounts.rows.length > 0) && (
        <p>{reportOverviewNote}</p>
      )}
      {amounts.rows.length > 0 && (
        <details>
          <summary>Usage subtotal scope, units and adjustments</summary>
          <ReportTable
            caption="Usage subtotal details"
            data={amounts.rows}
            globalFilter=""
            columns={amounts.columns.map((header, index) => ({
              id: String(index),
              header,
              accessorFn: (row: (string | number)[]) => row[index] ?? '',
            }))}
          />
        </details>
      )}
    </>
  );
}
