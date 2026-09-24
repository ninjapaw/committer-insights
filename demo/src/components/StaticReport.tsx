import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { Report } from '@ninjapaw/contracts';
import { ResultsDashboardPage } from '../../../app/src/pages/ResultsDashboardPage';

export default function StaticReport({ report, base }: { report: Report; base: string }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { retry: false, staleTime: Infinity, refetchOnWindowFocus: false },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[`/reports/${report.reportId}`]}>
        <Routes>
          <Route
            path="/reports/:reportId"
            element={
              <ResultsDashboardPage
                staticReport={report}
                staticExportBase={`${base}generated/`}
                sourceHref={base}
              />
            }
          />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}
