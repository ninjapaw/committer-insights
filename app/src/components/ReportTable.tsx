import { useEffect } from 'react';
import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  useReactTable,
} from '@tanstack/react-table';

export function ReportTable<Row>({
  data,
  columns,
  globalFilter,
  caption,
  emptyMessage = 'No matching committers.',
}: {
  data: Row[];
  columns: ColumnDef<Row>[];
  globalFilter: string;
  caption: string;
  emptyMessage?: string;
}): JSX.Element {
  const table = useReactTable({
    data,
    columns,
    state: { globalFilter },
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
  });
  useEffect(() => {
    table.setPageIndex(0);
  }, [globalFilter, data, table]);
  return (
    <section className="report-table" aria-label={caption}>
      <h2>{caption}</h2>
      <div className="table-scroll">
        <table>
          <caption className="visually-hidden">{caption}</caption>
          <thead>
            {table.getHeaderGroups().map((group) => (
              <tr key={group.id}>
                {group.headers.map((header) => (
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
      </div>
      {table.getFilteredRowModel().rows.length === 0 && <p>{emptyMessage}</p>}
      <nav className="table-pagination" aria-label={`${caption} pages`}>
        <button
          type="button"
          disabled={!table.getCanPreviousPage()}
          onClick={() => table.previousPage()}
        >
          Previous
        </button>
        <span aria-live="polite">
          Page {table.getState().pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())}
        </span>
        <button type="button" disabled={!table.getCanNextPage()} onClick={() => table.nextPage()}>
          Next
        </button>
      </nav>
    </section>
  );
}
