import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  exportFormats,
  formatReportDateTime,
  resolveReportTimeZone,
  getGitHubContributions,
  solutionPricingNote,
  solutionPricingRows,
  providerReport,
  reportProviderNames,
  uniqueAzureDevOpsCommitters,
  type ExportFormat,
  type Report,
} from '@ninjapaw/contracts';
import { ReportTable } from '../components/ReportTable';
import { RepositoryLink } from '../components/RepositoryLink';
import { ReportInsightsPanel } from '../components/ReportInsightsPanel';
import { CioBriefPanel } from '../components/CioBriefPanel';
import { AzureBillingPanel, GitHubBillingPanel } from '../components/AzureBillingPanel';
import { ReportOverview } from '../components/ReportOverview';
import { AzureServicePricing } from '../components/AzureServicePricing';
import { azureColumns } from '../providers/azure-devops';
import { githubColumnsForTimeZone } from '../providers/github';
import { localRequest, requestJson } from '../services/local-api';

async function downloadExport(
  reportId: string,
  extension: ExportFormat,
  staticExportBase?: string,
): Promise<void> {
  const theme = document.documentElement.dataset.theme === 'light' ? 'light' : 'dark';
  const response = staticExportBase
    ? await fetch(`${staticExportBase}${encodeURIComponent(reportId)}.${extension}`)
    : await localRequest(`/api/reports/${reportId}/export.${extension}`);
  if (!response.ok) throw new Error(`Unable to download ${extension.toUpperCase()} report`);
  const disposition = response.headers.get('Content-Disposition') ?? '';
  const filename =
    disposition.match(/filename="([^"]+)"/)?.[1] ?? `committer-insights.${extension}`;
  let blob: Blob;
  if (extension === 'html') {
    const exported = new DOMParser().parseFromString(await response.text(), 'text/html');
    exported.documentElement.dataset.theme = theme;
    blob = new Blob(['<!doctype html>\n', exported.documentElement.outerHTML], {
      type: 'text/html;charset=utf-8',
    });
  } else {
    blob = await response.blob();
  }
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function selectReport(report: Report) {
  return { ...report, azureDisplayRows: uniqueAzureDevOpsCommitters(report.azureDevOpsCommitters) };
}

function SolutionPricing({ report }: { report: Report }): JSX.Element {
  const rows = solutionPricingRows(report.costEstimates);
  return (
    <>
      <h3>Solution pricing totals</h3>
      <p>{solutionPricingNote}</p>
      {rows.length ? (
        <div
          className="table-scroll"
          role="region"
          aria-label="Solution pricing totals"
          tabIndex={0}
        >
          <table>
            <thead>
              <tr>
                <th scope="col">Provider</th>
                <th scope="col">Solution / scenario</th>
                <th scope="col">Estimated quantity</th>
                <th scope="col">Monthly USD</th>
                <th scope="col">Annualized USD</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => (
                <tr key={`${row.provider}:${row.solution}:${index}`}>
                  <td>{row.provider}</td>
                  <th scope="row">{row.solution}</th>
                  <td>{row.quantity}</td>
                  <td>${row.monthlyUsd.toFixed(2)}</td>
                  <td>${row.annualizedUsd.toFixed(2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p>
          Pricing totals unavailable. No complete cost estimates were collected; this is not zero
          cost.
        </p>
      )}
    </>
  );
}

export function ResultsDashboardPage({
  staticReport,
  staticExportBase,
  sourceHref,
}: {
  staticReport?: Report;
  staticExportBase?: string;
  sourceHref?: string;
} = {}): JSX.Element {
  const { reportId } = useParams();
  const [selectedProvider, setSelectedProvider] = useState<'azure-devops' | 'github'>();
  const query = useQuery({
    queryKey: ['report', reportId],
    queryFn: () => requestJson<Report>(`/api/reports/${reportId!}`),
    enabled: Boolean(reportId) && !staticReport,
    initialData: staticReport,
  });
  if (query.isLoading) return <p aria-live="polite">Loading report...</p>;
  if (query.isError) return <div role="alert">{(query.error as Error).message}</div>;
  if (!query.data) return <p>Report unavailable.</p>;
  const hasAzure =
    query.data.provider === 'azure-devops' ||
    query.data.azureDevOpsCommitters.length > 0 ||
    query.data.sourceStatuses?.some((item) => item.provider === 'azure-devops') ||
    query.data.providerSummaries?.some((item) => item.provider === 'azure-devops') ||
    query.data.insights?.repositories.some((item) => item.provider === 'azure-devops') ||
    Boolean(query.data.insights?.azureBilling?.length) ||
    Boolean(query.data.insights?.azureEstimates?.length) ||
    query.data.costEstimates?.some((item) => item.provider === 'azure-devops');
  const provider = selectedProvider ?? (hasAzure ? 'azure-devops' : 'github');
  return (
    <section className="results-page" aria-labelledby="results-title">
      <h1 id="results-title">Results dashboard</h1>
      <p>
        Generated{' '}
        <time dateTime={query.data.generatedAt} title={query.data.generatedAt}>
          {formatReportDateTime(query.data.generatedAt, query.data.timeZone)}
        </time>{' '}
        - {query.data.subject}
      </p>
      {sourceHref ? (
        <a href={sourceHref} className="btn btn-secondary">
          Demo reports
        </a>
      ) : (
        <Link to="/connections" className="btn btn-secondary">
          Change sources
        </Link>
      )}
      <div className="provider-tabs" role="tablist" aria-label="Report provider">
        {(['azure-devops', 'github'] as const).map((value) => (
          <button
            type="button"
            role="tab"
            key={value}
            id={`tab-${value}`}
            aria-controls={`panel-${value}`}
            aria-selected={provider === value}
            tabIndex={provider === value ? 0 : -1}
            onClick={() => setSelectedProvider(value)}
            onKeyDown={(event) => {
              const next =
                event.key === 'Home'
                  ? 'azure-devops'
                  : event.key === 'End'
                    ? 'github'
                    : event.key === 'ArrowLeft' || event.key === 'ArrowRight'
                      ? value === 'github'
                        ? 'azure-devops'
                        : 'github'
                      : undefined;
              if (next) {
                event.preventDefault();
                setSelectedProvider(next);
                document.getElementById(`tab-${next}`)?.focus();
              }
            }}
          >
            {reportProviderNames[value]}
          </button>
        ))}
      </div>
      <div
        role="tabpanel"
        id={`panel-${provider}`}
        aria-labelledby={`tab-${provider}`}
        tabIndex={0}
      >
        <ProviderResults
          key={`${reportId}:${provider}`}
          report={providerReport(query.data, provider)}
          staticExportBase={staticExportBase}
        />
      </div>
      {query.data.warnings.length > 0 && (
        <section aria-label="Report-wide collection warnings">
          <h2>Report-wide collection warnings</h2>
          <ul>
            {query.data.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </section>
      )}
    </section>
  );
}

function ProviderResults({
  report,
  staticExportBase,
}: {
  report: Report;
  staticExportBase?: string;
}): JSX.Element {
  const { reportId } = useParams();
  const [globalFilter, setGlobalFilter] = useState('');
  const [downloadError, setDownloadError] = useState('');
  const query = { data: selectReport(report) };
  const hasAzureEstimate =
    report.provider === 'azure-devops' && Boolean(report.insights?.azureEstimates?.length);
  const githubRows = useMemo(
    () =>
      query.data?.gitHubCommitters.filter((item) =>
        `${item.login} ${item.displayName ?? ''} ${item.repository} ${getGitHubContributions(item)
          .map((contribution) => contribution.repository)
          .join(' ')} ${item.commitCount} ${item.lastCommitAt} ${item.profileUrl ?? ''} Unknown`
          .toLowerCase()
          .includes(globalFilter.trim().toLowerCase()),
      ) ?? [],
    [query.data, globalFilter],
  );

  return (
    <section aria-label={`${report.subject} report`}>
      <h2>{report.subject}</h2>
      {!report.executiveSummary?.requestedSources &&
        !report.azureDevOpsCommitters.length &&
        !report.gitHubCommitters.length &&
        !report.insights?.repositories.length &&
        !report.insights?.azureBilling?.length &&
        !report.insights?.azureEstimates?.length &&
        !report.insights?.githubBilling?.length &&
        !report.insights?.billing.length && (
          <p>No sources or usage collected for this provider. Pricing is unavailable, not zero.</p>
        )}
      <p>
        {report.provider === 'azure-devops'
          ? 'Azure DevOps preview estimates are not invoiced usage.'
          : 'GitHub observed activity does not establish Enterprise seats or security billing eligibility.'}{' '}
        Costs are USD list-price scenarios, excluding tax and discounts.
      </p>
      <div className="report-layout">
        <nav className="report-navigation" aria-label={`${report.subject} report sections`}>
          <a href="#report-overview">Executive summary</a>
          <a href="#report-recommendations">Recommendations</a>
          <a href="#report-usage">Usage and security</a>
          <a href="#report-evidence">Collection evidence</a>
          {!hasAzureEstimate && <a href="#report-pricing">Estimated billing</a>}
          {report.insights?.azureServiceEstimates?.length ? (
            <a href="#report-service-pricing">Other service estimates</a>
          ) : null}
          {report.provider === 'azure-devops' && (
            <a href="#report-azure-billing">Provider-reported billing</a>
          )}
          {report.provider === 'github' && (
            <a href="#report-github-billing">Provider-reported billing</a>
          )}
          <a href="#report-identities">Identity detail</a>
          <a href="#report-downloads">Export report</a>
        </nav>
        <div className="report-content">
          {query.data?.executiveSummary && (
            <section
              id="report-overview"
              tabIndex={-1}
              className="executive-summary"
              aria-labelledby="executive-summary-title"
            >
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
          <ReportOverview report={report} />
          {report.provider === 'azure-devops' && (
            <section
              id="report-azure-billing"
              tabIndex={-1}
              aria-label="Provider-reported Azure billing"
            >
              <AzureBillingPanel
                snapshots={report.insights?.azureBilling ?? []}
                estimates={report.insights?.azureEstimates ?? []}
                repositories={report.insights?.repositories ?? []}
                timeZone={report.timeZone}
              />
            </section>
          )}
          {report.provider === 'github' && (
            <section
              id="report-github-billing"
              tabIndex={-1}
              aria-label="Provider-reported GitHub billing"
            >
              <GitHubBillingPanel snapshots={report.insights?.githubBilling ?? []} />
            </section>
          )}
          <section
            id="report-recommendations"
            tabIndex={-1}
            aria-labelledby="report-recommendations-title"
          >
            <h2 id="report-recommendations-title">Recommendations</h2>
            <details>
              <summary>Evidence-based recommendations and collection plan</summary>
              <CioBriefPanel report={report} />
            </details>
          </section>
          <section id="report-usage" tabIndex={-1} aria-label="Usage and security">
            {query.data?.insights ? (
              <ReportInsightsPanel report={query.data} />
            ) : (
              <>
                <h2>Usage and security</h2>
                <p>No repository activity or security evidence was collected for this provider.</p>
              </>
            )}
          </section>
          {report.insights?.azureServiceEstimates?.length ? (
            <section
              id="report-service-pricing"
              tabIndex={-1}
              aria-label="Other Azure DevOps service estimates"
            >
              <AzureServicePricing estimates={report.insights.azureServiceEstimates} />
            </section>
          ) : null}
          <section id="report-evidence" tabIndex={-1} aria-labelledby="report-evidence-title">
            <h2 id="report-evidence-title">Collection evidence</h2>
            {!query.data.providerSummaries?.length && !query.data.sourceStatuses?.length && (
              <p>No source-level collection evidence is available.</p>
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
                        <th scope="col">Repositories with observed activity</th>
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
                          <td>{summary.totalRepositories ?? 'Not applicable'}</td>
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
                        <th>Returned identity rows</th>
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
                          <td>{source.reason || 'Not applicable'}</td>
                          <td>{source.remediation || 'Not applicable'}</td>
                          <td>{source.scope || 'Not recorded'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </section>
          {!hasAzureEstimate && (
            <section id="report-pricing" tabIndex={-1} aria-labelledby="cost-estimates-title">
              <h2 id="cost-estimates-title">Estimated billing</h2>
              <SolutionPricing report={query.data} />
              {query.data.costEstimates && query.data.costEstimates.length > 0 && (
                <>
                  <h3>Unit prices and estimation basis</h3>
                  <p>
                    Monthly USD scenarios, not actual charges. Counts may overlap across products
                    and sources; do not sum scenarios as an invoice total.
                  </p>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          <th>Provider</th>
                          <th>Estimate</th>
                          <th>Count</th>
                          <th>Unit price</th>
                          <th>Estimated monthly cost</th>
                          <th>Basis</th>
                        </tr>
                      </thead>
                      <tbody>
                        {query.data.costEstimates.map((item) => (
                          <tr key={`${item.provider}:${item.label}`}>
                            <td>{item.provider}</td>
                            <td>{item.label}</td>
                            <td>{item.count}</td>
                            <td>${item.unitPriceUsd.toFixed(2)}</td>
                            <td>${item.estimatedMonthlyCostUsd.toFixed(2)}</td>
                            <td>
                              {item.basis}
                              <br />
                              <span>{item.source}</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          )}
          {query.data && query.data.warnings.length > 0 && (
            <ul role="status">
              {query.data.warnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
          )}

          <section id="report-identities" tabIndex={-1} aria-labelledby="report-identities-title">
            <h2 id="report-identities-title">Identity detail</h2>
            <label htmlFor="results-search">Search committers or repositories</label>
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
                  data={query.data.azureDisplayRows}
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
                  data={githubRows}
                  columns={githubColumnsForTimeZone(resolveReportTimeZone(report.timeZone))}
                  globalFilter=""
                  caption="GitHub committers"
                />
              )}

            {reportId && (
              <section aria-label="Report detail and recommendations">
                {query.data?.gitHubCommitters.length ? (
                  <>
                    <h2 id="github-detail-title">GitHub repository contributions</h2>
                    {githubRows.map((item, index) => {
                      const contributions = getGitHubContributions(item);
                      return (
                        <details key={`${item.userId ?? item.login}:${index}`}>
                          <summary>
                            {item.login}: {contributions.length || 'Unknown'} repositories,{' '}
                            {item.commitCount} commits
                          </summary>
                          {contributions.length ? (
                            <div className="table-scroll">
                              <table>
                                <caption>{item.login} contribution breakdown</caption>
                                <thead>
                                  <tr>
                                    <th scope="col">Repository</th>
                                    <th scope="col">Commits</th>
                                    <th scope="col">
                                      Last authored commit ({resolveReportTimeZone(report.timeZone)}
                                      )
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {contributions.map((contribution) => (
                                    <tr key={contribution.repository}>
                                      <td>
                                        <RepositoryLink
                                          provider="github"
                                          source=""
                                          name={contribution.repository}
                                        />
                                      </td>
                                      <td>{contribution.commitCount}</td>
                                      <td>
                                        <time
                                          dateTime={contribution.lastCommitAt}
                                          title={contribution.lastCommitAt}
                                        >
                                          {formatReportDateTime(
                                            contribution.lastCommitAt,
                                            report.timeZone,
                                          )}
                                        </time>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ) : (
                            <p>
                              Per-repository detail is unavailable in this older report. Generate a
                              new report.
                            </p>
                          )}
                        </details>
                      );
                    })}
                  </>
                ) : null}
                <h2>Recommended next steps</h2>
                <ol>
                  <li>Resolve skipped sources before treating totals as complete.</li>
                  {report.provider === 'github' && (
                    <li>
                      Validate GitHub membership, repository visibility, security-product enablement
                      and 90-day push activity in official billing. Observed committers are not
                      Enterprise seats.
                    </li>
                  )}
                  <li>
                    Review identity matches and unlinked authors. Names alone are not proof of
                    identity.
                  </li>
                  {report.provider === 'azure-devops' && (
                    <li>
                      Confirm Azure per-product estimates against billing. Basic/Test Plans
                      entitlements, Pipelines and Artifacts are outside this report.
                    </li>
                  )}
                </ol>
              </section>
            )}
          </section>
          {reportId && (
            <section
              id="report-downloads"
              tabIndex={-1}
              aria-labelledby="report-downloads-title"
              className="results-actions"
            >
              <h2 id="report-downloads-title">Export report</h2>
              <p>Downloads include the complete report, not just matching search results.</p>
              <p>All providers are included in every download, regardless of the selected area.</p>
              {exportFormats.map((format) => (
                <button
                  key={format}
                  type="button"
                  onClick={() => {
                    setDownloadError('');
                    void downloadExport(reportId, format, staticExportBase).catch(
                      (error: unknown) =>
                        setDownloadError(
                          error instanceof Error ? error.message : 'Download failed',
                        ),
                    );
                  }}
                >
                  Download {format.toUpperCase()}
                </button>
              ))}
            </section>
          )}
          {downloadError && <div role="alert">{downloadError}</div>}
        </div>
      </div>
    </section>
  );
}
