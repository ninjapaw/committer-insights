import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { exportFormats, type ExportFormat, type Report } from '@ninjapaw/contracts';
import { ReportTable } from '../components/ReportTable';
import { azureColumns } from '../providers/azure-devops';
import { githubColumns } from '../providers/github';
import { localRequest, requestJson } from '../services/local-api';

async function downloadExport(reportId: string, extension: ExportFormat): Promise<void> {
  const response = await localRequest(`/api/reports/${reportId}/export.${extension}`);
  if (!response.ok) throw new Error(`Unable to download ${extension.toUpperCase()} report`);
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const filename =
    disposition.match(/filename="([^"]+)"/)?.[1] ?? `committer-insights.${extension}`;
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function ResultsDashboardPage(): JSX.Element {
  const { reportId } = useParams();
  const [globalFilter, setGlobalFilter] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const query = useQuery({
    queryKey: ['report', reportId],
    queryFn: () => requestJson<Report>(`/api/reports/${reportId!}`),
    enabled: Boolean(reportId),
  });

  if (query.isLoading) {
    return <p aria-live="polite">Loading report...</p>;
  }
  if (query.isError) {
    return <div role="alert">{(query.error as Error).message}</div>;
  }

  return (
    <section className="results-page" aria-labelledby="results-title">
      <h1 id="results-title">Results dashboard</h1>
      <Link to="/connections" className="btn btn-secondary">
        Change sources
      </Link>
      {query.data?.executiveSummary && (
        <section className="executive-summary" aria-labelledby="executive-summary-title">
          <h2 id="executive-summary-title">Executive summary</h2>
          <div className="metric-grid">
            <div className="metric-card">
              <strong>{query.data.executiveSummary.uniqueProviderIdentities}</strong>
              <span>Unique provider identities</span>
            </div>
            <div className="metric-card">
              <strong>{query.data.executiveSummary.includedSources}</strong>
              <span>Sources included</span>
            </div>
            <div className="metric-card">
              <strong>{query.data.executiveSummary.skippedSources}</strong>
              <span>Sources skipped</span>
            </div>
            <div className="metric-card">
              <strong>
                {query.data.executiveSummary.azureIdentityRecords +
                  query.data.executiveSummary.gitHubIdentityRecords}
              </strong>
              <span>Identity records</span>
            </div>
          </div>
        </section>
      )}
      {query.data?.providerSummaries && (
        <section aria-labelledby="provider-summary-title">
          <h2 id="provider-summary-title">Provider summary</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th scope="col">Provider</th>
                  <th scope="col">Measurement</th>
                  <th scope="col">Sources included</th>
                  <th scope="col">Sources skipped</th>
                  <th scope="col">Identity records</th>
                  <th scope="col">Unique identities</th>
                  <th scope="col">Commits</th>
                  <th scope="col">API version</th>
                </tr>
              </thead>
              <tbody>
                {query.data.providerSummaries.map((summary) => (
                  <tr key={summary.provider}>
                    <th scope="row">{summary.displayName}</th>
                    <td>{summary.measurement}</td>
                    <td>
                      {summary.includedSources} {summary.sourceLabel.toLowerCase()}
                    </td>
                    <td>{summary.skippedSources}</td>
                    <td>{summary.identityRecords}</td>
                    <td>{summary.uniqueIdentities}</td>
                    <td>{summary.totalCommits ?? 'Not applicable'}</td>
                    <td>{summary.apiVersion}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {query.data.providerSummaries.map((summary) => (
            <p key={summary.provider}>
              <strong>{summary.displayName}:</strong> {summary.methodology}
            </p>
          ))}
        </section>
      )}
      {query.data?.sourceStatuses && (
        <section aria-labelledby="source-status-title">
          <h2 id="source-status-title">Source status</h2>
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>Provider</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Count</th>
                  <th>Reason</th>
                  <th>How to fix</th>
                  <th>Scope</th>
                </tr>
              </thead>
              <tbody>
                {query.data.sourceStatuses.map((source) => (
                  <tr key={`${source.provider}:${source.subject}`}>
                    <td>{source.provider}</td>
                    <td>{source.subject}</td>
                    <td>{source.status}</td>
                    <td>{source.committerCount}</td>
                    <td>{source.reason}</td>
                    <td>{source.remediation}</td>
                    <td>{source.scope}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
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

      {query.data &&
        (query.data.provider === 'azure-devops' ||
          query.data.azureDevOpsCommitters.length > 0 ||
          query.data.sourceStatuses?.some(
            (source) => source.provider === 'azure-devops' && source.status === 'included',
          )) && (
          <ReportTable
            data={query.data.azureDevOpsCommitters}
            columns={azureColumns}
            globalFilter={globalFilter}
            caption="Azure DevOps committers"
          />
        )}
      {query.data &&
        (query.data.provider === 'github' ||
          query.data.gitHubCommitters.length > 0 ||
          query.data.sourceStatuses?.some(
            (source) => source.provider === 'github' && source.status === 'included',
          )) && (
          <ReportTable
            data={query.data.gitHubCommitters}
            columns={githubColumns}
            globalFilter={globalFilter}
            caption="GitHub committers"
          />
        )}

      {reportId && (
        <div className="results-actions">
          {exportFormats.map((format) => (
            <button
              key={format}
              type="button"
              onClick={() =>
                void downloadExport(reportId, format).catch((error: unknown) =>
                  setDownloadError(error instanceof Error ? error.message : 'Download failed'),
                )
              }
            >
              Download {format === 'xlsx' ? 'Excel' : format.toUpperCase()}
            </button>
          ))}
        </div>
      )}
      {downloadError && <div role="alert">{downloadError}</div>}
    </section>
  );
}
