import type { StoredReport } from '../reports/report-store.js';
import {
  getGitHubContributions,
  formatReportDateTime as formatDateTime,
  resolveReportTimeZone,
  repositoryWebUrl,
  insightTables,
  solutionPricingNote,
  solutionPricingRows,
  providerReport,
  reportProviderNames,
  buildCioBrief,
  cioBriefTables,
  cioMethodology,
  azureBillingNote,
  azureAdoptionNote,
  githubBillingNote,
  type InsightTable,
  reportOverviewTables,
  reportOverviewNote,
} from '@ninjapaw/contracts';
import { uniqueAzureDevOpsCommitters } from '@ninjapaw/contracts';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function repositoryLink(name: unknown, url: string | undefined): string {
  return url
    ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" title="Open repository in a new tab">${escapeHtml(name)}</a>`
    : escapeHtml(name);
}

function sourceRows(report: StoredReport): string {
  return (report.sourceStatuses ?? [])
    .map(
      (source) => `<tr class="status-${escapeHtml(source.status)}">
        <td>${escapeHtml(source.provider)}</td><td>${escapeHtml(source.subject)}</td>
        <td>${escapeHtml(source.status)}</td><td>${source.committerCount}</td>
        <td>${escapeHtml(source.reason || 'Not applicable')}</td><td>${escapeHtml(source.remediation || 'Not applicable')}</td>
        <td>${escapeHtml(source.scope)}</td>
      </tr>`,
    )
    .join('');
}

function costRows(report: StoredReport): string {
  return (report.costEstimates ?? [])
    .map(
      (item) => `<tr>
        <td>${escapeHtml(item.provider)}</td><td>${escapeHtml(item.label)}</td>
        <td>${item.count}</td><td>$${item.unitPriceUsd.toFixed(2)}</td>
        <td>$${item.estimatedMonthlyCostUsd.toFixed(2)}</td>
        <td>${escapeHtml(item.basis)}<br><span>${escapeHtml(item.source)}</span></td>
      </tr>`,
    )
    .join('');
}

function solutionTotals(report: StoredReport): string {
  const rows = solutionPricingRows(report.costEstimates);
  return `<h3>Solution pricing totals</h3><p>${escapeHtml(solutionPricingNote)}</p>${rows.length ? `<div class="table-wrap" tabindex="0" role="region" aria-label="Solution pricing totals"><table class="solution-totals"><thead><tr><th scope="col">Provider</th><th scope="col">Solution / scenario</th><th scope="col">Estimated quantity</th><th scope="col">Monthly USD</th><th scope="col">Annualized USD</th></tr></thead><tbody>${rows.map((row) => `<tr><td>${escapeHtml(row.provider)}</td><th scope="row">${escapeHtml(row.solution)}</th><td>${escapeHtml(row.quantity)}</td><td>$${row.monthlyUsd.toFixed(2)}</td><td>$${row.annualizedUsd.toFixed(2)}</td></tr>`).join('')}</tbody></table></div>` : '<p>Pricing totals unavailable. No complete cost estimates were collected; this is not zero cost.</p>'}`;
}

function reportNavigation(
  report: StoredReport,
  azureRows: string,
  githubRows: string,
  prefix: string,
): string {
  const links = [
    ...(report.executiveSummary ? [['#executive-summary', 'Executive summary']] : []),
    ['#cio-brief', 'Recommendations'],
    ...(report.insights ? [['#billing-evidence', 'Billing evidence']] : []),
    ...(!report.insights?.azureEstimates?.length
      ? [['#estimated-billing', 'Estimated billing']]
      : []),
    ...(report.insights ? [['#usage-evidence', 'Repositories and activity']] : []),
    ...(report.insights?.azureServiceEstimates?.length
      ? [['#service-estimates', 'Other service estimates']]
      : []),
    ...(report.sourceStatuses ? [['#source-status', 'Collection coverage']] : []),
    ...(azureRows ? [['#azure-devops-committers', 'Azure DevOps committers']] : []),
    ...(githubRows ? [['#github-committers', 'GitHub committers']] : []),
  ];
  return `<nav class="report-nav" aria-label="Report sections">${links
    .map(([href, label]) => `<a href="#${prefix}${href!.slice(1)}">${label}</a>`)
    .join('')}</nav>`;
}

export function generateStandaloneHtml(report: StoredReport): string {
  return renderHtml(report);
}

function renderHtml(report: StoredReport, sectionOnly = false, prefix = ''): string {
  const timeZone = resolveReportTimeZone(report.timeZone);
  const formatReportDateTime = (value: string) => formatDateTime(value, timeZone);
  const summary = report.executiveSummary;
  const cio =
    report.provider === 'combined'
      ? ''
      : `<section id="${prefix}cio-brief"><h2>CIO decision brief</h2><p>${escapeHtml(cioMethodology)}</p>${cioBriefTables(
          buildCioBrief(report, report.provider),
        )
          .map(
            (table) =>
              `<h3>${escapeHtml(table.title)}</h3><div class="table-wrap" tabindex="0" role="region" aria-label="${escapeHtml(table.title)}"><table><thead><tr>${table.columns.map((column) => `<th scope="col">${escapeHtml(column)}</th>`).join('')}</tr></thead><tbody>${table.rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`,
          )
          .join('')}</section>`;
  const providerSections = (report.providerSummaries ?? [])
    .map(
      (
        provider,
      ) => `<section class="card provider-card" id="${prefix}provider-${escapeHtml(provider.provider)}">
<div class="section-heading"><h2>${escapeHtml(provider.displayName)}</h2><span>${escapeHtml(provider.measurement)}</span></div>
<dl class="stat-list"><dt>${escapeHtml(provider.sourceLabel)} included</dt><dd>${provider.includedSources}</dd>
<dt>Sources skipped</dt><dd>${provider.skippedSources}</dd><dt>Identity records</dt><dd>${provider.identityRecords}</dd>
<dt>Unique identities</dt><dd>${provider.uniqueIdentities}</dd>
${provider.totalRepositories === undefined ? '' : `<dt>Repositories</dt><dd>${provider.totalRepositories}</dd>`}
${provider.totalCommits === undefined ? '' : `<dt>Commits</dt><dd>${provider.totalCommits}</dd>`}
<dt>API version</dt><dd>${escapeHtml(provider.apiVersion)}</dd></dl>
<p class="methodology">${escapeHtml(provider.methodology)}</p></section>`,
    )
    .join('');
  const azureRows = uniqueAzureDevOpsCommitters(report.azureDevOpsCommitters)
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.displayName)}</td><td>${escapeHtml(item.organization)}</td><td>${escapeHtml(item.plan)}</td><td>${escapeHtml(item.billableCommitter)}</td></tr>`,
    )
    .join('');
  const githubRows = report.gitHubCommitters
    .map((item) => {
      const contributions = getGitHubContributions(item);
      return `<tr><th scope="row">${escapeHtml(item.login)}</th><td>${escapeHtml(item.displayName)}</td><td>${contributions.length || 'Unavailable'}</td><td>Unknown</td><td>${item.commitCount}</td><td>${escapeHtml(formatReportDateTime(item.lastCommitAt))}</td></tr>
    <tr><td colspan="6"><h3>${escapeHtml(item.login)}: repository contributions</h3>${contributions.length ? `<table class="contributions"><thead><tr><th scope="col">Repository</th><th scope="col">Commits</th><th scope="col">Last authored commit (${escapeHtml(timeZone)})</th></tr></thead><tbody>${contributions.map((contribution) => `<tr><td>${repositoryLink(contribution.repository, repositoryWebUrl({ provider: 'github', source: '', name: contribution.repository }))}</td><td>${contribution.commitCount}</td><td>${escapeHtml(formatReportDateTime(contribution.lastCommitAt))}</td></tr>`).join('')}</tbody></table>` : '<p>Per-repository counts are unavailable in this older report. Generate a new report for the breakdown.</p>'}</td></tr>`;
    })
    .join('');
  const nav = reportNavigation(report, azureRows, githubRows, prefix);
  const renderTable = (table: InsightTable) =>
    `<details class="evidence-dataset"${['Collection at a glance', 'Reported usage subtotals', 'Azure billing and enablement scenarios'].includes(table.title) ? ' open' : ''}><summary>${escapeHtml(table.title)} (${table.rows.length} rows)</summary>${table.rows.length ? `<div class="table-wrap" tabindex="0" role="region" aria-label="${escapeHtml(table.title)}"><table style="min-width:${Math.max(760, table.columns.length * 140)}px"><thead><tr>${table.columns.map((column) => `<th scope="col">${escapeHtml(column)}</th>`).join('')}</tr></thead><tbody>${table.rows.map((row, rowIndex) => `<tr>${row.map((cell, columnIndex) => `<td>${table.columns[columnIndex] === 'Repository' ? repositoryLink(cell, table.repositoryUrls?.[rowIndex]) : escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody></table></div>` : '<p>No rows collected. Check collection coverage; this does not establish zero usage.</p>'}</details>`;
  const overview = reportOverviewTables(report);
  const amountColumns = ['Source', 'Period UTC', 'Product', 'Net USD', 'Basis'];
  const compactAmounts = {
    ...overview[1]!,
    columns: amountColumns,
    rows: overview[1]!.rows.map((row) =>
      amountColumns.map((column) => row[overview[1]!.columns.indexOf(column)]!),
    ),
  };
  const tables = report.insights
    ? insightTables(report.insights, { readableDates: true, timeZone })
    : [];
  const billingTable = (table: InsightTable) =>
    /billing|billed identities|usage charges/i.test(table.title);
  const serviceTable = (table: InsightTable) => table.title.startsWith('Azure DevOps ');
  const serviceHtml = tables.some(serviceTable)
    ? `<section id="${prefix}service-estimates"><h2>Other Azure DevOps services</h2><p>User-entered what-if quantities, separate from provider billing. Blank quantities remain unavailable.</p>${tables.filter(serviceTable).map(renderTable).join('')}</section>`
    : '';
  const billingHtml = report.insights
    ? `<section id="${prefix}billing-evidence"><h2>Provider-reported billing and enablement evidence</h2><p>Billing snapshots, enablement estimates and usage charges are separate datasets. Do not add overlapping scopes or summaries to detail.</p>${tables.filter(billingTable).map(renderTable).join('')}${report.insights.azureEstimates?.length ? `<p>${escapeHtml(azureAdoptionNote)}</p>` : ''}${report.insights.azureBilling?.length ? `<p>${escapeHtml(azureBillingNote)}</p>` : ''}${report.insights.githubBilling?.length ? `<p>${escapeHtml(githubBillingNote)}</p>` : ''}</section>`
    : '';
  const insightsHtml = report.insights
    ? `<section id="${prefix}usage-evidence"><h2>Usage and security evidence</h2><p>Settings are current snapshots, not proof of recent scanning or payment. Reported billing usage is not an invoice; missing rows do not mean zero cost. ${report.provider === 'azure-devops' ? 'Activity uses committer dates, including automation.' : 'Activity uses authored dates, excluding two automation accounts.'} Date windows are UTC; the final day may be incomplete.</p>${insightTables(
        report.insights,
        { readableDates: true, timeZone },
      )
        .filter(
          (table) =>
            !billingTable(table) && !serviceTable(table) && table.title !== 'Collection evidence',
        )
        .map(renderTable)
        .join('')}</section>`
    : '';
  const start = `<!doctype html>
<html lang="en" data-theme="dark"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Committer Insights - ${escapeHtml(report.subject)}</title>
<style>:root{color-scheme:dark;--bg:#0b1118;--panel:#121821;--panel2:#182333;--border:#273345;--border2:#3b4a60;--text:#f3f7fb;--soft:#d5dde8;--muted:#9facbd;--blue:#2899f5;--blue2:#102a40;--warn:#ffe6a6;--warnbg:#3d300b;--warnborder:#7d6117;--ok:#6ccb5f;--bad:#ff7a85}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);background-image:linear-gradient(rgb(120 180 230 / 5%) 1px,transparent 1px),linear-gradient(90deg,rgb(120 180 230 / 5%) 1px,transparent 1px);background-size:32px 32px;color:var(--text);font:15px/1.55 "Segoe UI","Segoe UI Variable",sans-serif}main{width:min(100%,1180px);margin:0 auto;padding:24px 24px 48px}header{background:var(--panel);border-bottom:1px solid var(--border);box-shadow:0 1px 3px rgb(0 0 0 / 22%)}.header-inner{width:min(100%,1180px);margin:0 auto;padding:22px 24px;display:flex;gap:18px;align-items:center;justify-content:space-between}.brand{display:flex;align-items:center;gap:12px}.logo{display:grid;grid-template-columns:10px 10px;grid-template-rows:10px 10px;gap:2px}.logo span:nth-child(1){background:#f25022}.logo span:nth-child(2){background:#7fba00}.logo span:nth-child(3){background:#00a4ef}.logo span:nth-child(4){background:#ffb900}h1,h2{margin:0;color:var(--text);line-height:1.2}h1{font-size:1.65rem}.generated{color:var(--muted);font-size:.9rem}.report-nav{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;gap:8px;margin:0 -24px 24px;padding:14px 24px;background:color-mix(in srgb,var(--bg) 94%,transparent);border-bottom:1px solid var(--border);backdrop-filter:blur(12px)}.report-nav a{border:1px solid var(--border2);border-radius:999px;color:var(--soft);padding:6px 12px;text-decoration:none;font-weight:650}.report-nav a:hover{border-color:var(--blue);color:var(--text)}.card{scroll-margin-top:72px;margin-top:24px;padding:20px;border:1px solid var(--border);border-radius:8px;background:var(--panel);box-shadow:0 4px 16px rgb(0 0 0 / 28%)}.section-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px}.section-heading span{color:var(--muted);font-weight:650}.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.metric{padding:16px;border:1px solid var(--border);border-radius:8px;background:#071018}.metric strong{display:block;color:#8ecbff;font-size:2rem;line-height:1}.metric span{display:block;margin-top:8px;color:var(--muted)}.stat-list{display:grid;grid-template-columns:minmax(180px,1fr) auto;gap:8px 18px;margin:0}.stat-list dt{color:var(--muted)}.stat-list dd{margin:0;text-align:right;font-weight:700}.methodology{margin:16px 0 0;color:var(--soft)}.table-wrap{margin-top:12px;overflow-x:auto;border:1px solid var(--border);border-radius:8px}table{width:100%;border-collapse:collapse;min-width:760px}th,td{padding:12px 14px;border-bottom:1px solid var(--border);text-align:left;vertical-align:top}th{background:#0f304a;color:var(--soft);font-weight:750}tbody tr:last-child td{border-bottom:0}tbody tr:hover{background:var(--panel2)}.status-skipped td:nth-child(3){color:var(--bad);font-weight:700}.status-included td:nth-child(3){color:var(--ok);font-weight:700}.notice{margin:24px 0 0;border-left:4px solid var(--warnborder);border-radius:0 8px 8px 0;background:var(--warnbg);color:var(--warn);padding:14px 16px}.recommendations ul{margin:0;padding-left:1.25rem}.recommendations li{margin:.35rem 0;color:var(--soft)}@media print{:root{color-scheme:light}body{background:#fff;color:#201f1e}header,.card,.metric{background:#fff;box-shadow:none}.report-nav{display:none}.generated,.metric span,.stat-list dt{color:#605e5c}th{background:#eff6fc;color:#201f1e}.card,.metric,.table-wrap{border-color:#d2d0ce}main{padding:20px}.card,.metric{break-inside:avoid}}</style>
</head><body><header><div class="header-inner"><div class="brand"><div class="logo" aria-hidden="true"><span></span><span></span><span></span><span></span></div><h1>Committer Insights</h1></div><div class="generated">Generated <time datetime="${escapeHtml(report.generatedAt)}" title="${escapeHtml(report.generatedAt)}">${escapeHtml(formatReportDateTime(report.generatedAt))}</time></div></div></header><main>`;
  const body =
    report.provider === 'combined'
      ? `<nav class="report-nav" aria-label="Provider sections"><a href="#area-azure-devops">Azure DevOps</a><a href="#area-github">GitHub Enterprise</a></nav>${(['azure-devops', 'github'] as const).map((provider) => `<section class="provider-area" id="area-${provider}" aria-label="${reportProviderNames[provider]}"><h2>${reportProviderNames[provider]}</h2>${renderHtml(providerReport(report, provider), true, `${provider}-`)}</section>`).join('')}${report.warnings.length ? `<section><h2>Report-wide collection warnings</h2><ul>${report.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul></section>` : ''}`
      : `
<div class="report-layout">${nav}<div class="report-content">
<section aria-labelledby="${prefix}reading-guide"><h2 id="${prefix}reading-guide">How to read this report</h2><p>${report.provider === 'azure-devops' ? 'Estimated means potential usage returned by the Azure preview API, not proof that a product is enabled.' : 'GitHub default-branch authored-date activity does not establish 90-day pushed-commit billing eligibility or Enterprise seat usage.'} Unknown does not mean free. Costs are monthly USD list-price scenarios, not a quote. Do not add subtotals to their component rows.</p></section>
${
  summary
    ? `<section class="card" id="${prefix}executive-summary"><div class="section-heading"><h2>Executive summary</h2><span>${escapeHtml(report.subject)}</span></div><div class="summary">
<div class="metric"><strong>${summary.uniqueProviderIdentities}</strong><span>Unique provider identities</span></div>
<div class="metric"><strong>${summary.includedSources}</strong><span>Sources included</span></div>
<div class="metric"><strong>${summary.skippedSources}</strong><span>Sources skipped</span></div>
<div class="metric"><strong>${summary.azureIdentityRecords + summary.gitHubIdentityRecords}</strong><span>Identity records</span></div></div></section>`
    : ''
}
${renderTable(overview[0]!)}
${overview[1]!.rows.length ? `${renderTable(compactAmounts)}<p>${escapeHtml(reportOverviewNote)}</p>${renderTable({ ...overview[1]!, title: 'Usage subtotal scope, units and adjustments' })}` : report.provider === 'azure-devops' ? '' : '<p>No readable usage amounts were collected. Estimates are separate from actual charges.</p>'}
${billingHtml}
${serviceHtml}
${insightsHtml}
${providerSections ? `<details id="${prefix}provider-summary"><summary>Provider methodology and source counts</summary>${providerSections}</details>` : ''}
${tables
  .filter((table) => table.title === 'Collection evidence')
  .map(renderTable)
  .join('')}
${report.sourceStatuses ? `<section class="card" id="${prefix}source-status"><div class="section-heading"><h2>Source status</h2></div><div class="table-wrap" tabindex="0" role="region" aria-label="Source status table"><table><thead><tr><th>Provider</th><th>Source</th><th>Status</th><th>Returned identity rows</th><th>Reason</th><th>How to fix</th><th>Scope</th></tr></thead><tbody>${sourceRows(report)}</tbody></table></div></section>` : ''}
${!report.insights?.azureEstimates?.length ? `<section class="card" id="${prefix}estimated-billing"><div class="section-heading"><h2>Estimated billing</h2><span>Public price assumptions</span></div>${solutionTotals(report)}${report.costEstimates?.length ? `<h3>Unit prices and estimation basis</h3><div class="table-wrap"><table><thead><tr><th>Provider</th><th>Estimate</th><th>Count</th><th>Unit price</th><th>Estimated monthly cost</th><th>Basis</th></tr></thead><tbody>${costRows(report)}</tbody></table></div>` : ''}</section>` : ''}
${azureRows ? `<section class="card" id="${prefix}azure-devops-committers"><div class="section-heading"><h2>Azure DevOps committers</h2></div><p>One row per identity and organization, with estimated products combined. Settings evidence, when available, is reported separately. Non-estimated organization users were not collected.</p><div class="table-wrap" tabindex="0" role="region" aria-label="Azure DevOps committer table"><table><thead><tr><th>Display name</th><th>Organization</th><th>Effective plans</th><th>Billing status</th></tr></thead><tbody>${azureRows}</tbody></table></div></section>` : ''}
${githubRows ? `<section class="card" id="${prefix}github-committers"><div class="section-heading"><h2>GitHub committers</h2></div><p>Summary followed by each repository contribution. Dependabot and GitHub Actions bots are excluded. Name-based matches require human review and do not prove billing identity.</p><div class="table-wrap" tabindex="0" role="region" aria-label="GitHub committer table"><table><thead><tr><th>Login</th><th>Display name</th><th>Repository count</th><th>Billing status</th><th>Total commits</th><th>Last authored commit (${escapeHtml(timeZone)})</th></tr></thead><tbody>${githubRows}</tbody></table></div></section>` : ''}
<section class="recommendations"><h2>Evidence-based recommendations</h2>${cio}</section>
${report.warnings.length ? `<section class="card"><h2>Collection warnings</h2><ul>${report.warnings.map((warning) => `<li>${escapeHtml(warning)}</li>`).join('')}</ul></section>` : ''}
<p class="notice">Cross-provider identities are not automatically merged. Skipped sources are excluded from totals and listed with remediation above.</p>
</div></div>
`;
  if (sectionOnly) return body;
  const end = `<footer class="notice">Independent community project. Not affiliated with, sponsored by, or endorsed by Microsoft or GitHub. Validate all estimates with official billing sources before purchasing. This exported file contains report data; share it only with authorized recipients.</footer>
</main><style>
:root{--container-max:1120px;--navbar-h:60px;--link:#8ecbff}
:root[data-theme="light"]{color-scheme:light;--bg:#f8f9fb;--panel:#fff;--panel2:#f3f6fa;--border:#e1dfdd;--border2:#c8c6c4;--text:#201f1e;--soft:#424242;--muted:#605e5c;--blue:#106ebe;--blue2:#eff6fc;--link:#005a9e;--warn:#5a3e08;--warnbg:#fff4ce;--warnborder:#f0d896;--ok:#107c10;--bad:#a4262c}
body{font:16px/1.55 "Segoe UI","Segoe UI Variable",-apple-system,BlinkMacSystemFont,sans-serif}
main,.header-inner{max-width:var(--container-max)}
.header-inner{min-height:var(--navbar-h);padding-block:12px}header h1{font-size:1.1rem;font-weight:650}
.report-layout{display:grid;grid-template-columns:180px minmax(0,1fr);gap:2rem;align-items:start}
.report-content{min-width:0}.report-content>section{margin-bottom:2rem}.report-content>section+section{border-top:1px solid var(--border);padding-top:1.5rem}
.report-layout>.report-nav{display:grid;position:sticky;top:1rem;gap:.25rem;margin:0;padding:0;border:0;border-inline-start:2px solid var(--border);background:transparent;backdrop-filter:none}
.report-layout>.report-nav a{border:0;padding:.65rem .75rem;font-size:.875rem;font-weight:400;color:var(--soft)}
.report-layout>.report-nav a:hover,.report-layout>.report-nav a:focus-visible{color:var(--link);background:var(--panel2)}
.provider-area>h2{border-bottom:1px solid var(--border);padding-bottom:1rem}
.report-content h2{font-size:1.25rem}.report-content p{color:var(--soft)}
.metric{background:var(--panel)}.metric strong{color:var(--blue)}.metric span{color:var(--muted)}
th{background:var(--panel2);color:var(--soft)}tbody tr:nth-child(even){background:var(--panel)}
section{min-width:0;scroll-margin-top:24px}main>section{margin-top:32px}
.card{padding:20px 0;border:0;border-top:1px solid var(--border);border-radius:0;background:transparent;box-shadow:none}
.contributions{min-width:0}.contributions th{background:var(--panel2)}h3{font-size:1rem;margin:0 0 12px}
[id$="estimated-billing"] table{min-width:1100px;table-layout:fixed}
[id$="estimated-billing"] th:nth-child(1){width:110px}[id$="estimated-billing"] th:nth-child(2){width:230px}[id$="estimated-billing"] th:nth-child(3){width:65px}[id$="estimated-billing"] th:nth-child(4){width:95px}[id$="estimated-billing"] th:nth-child(5){width:150px}
[id$="estimated-billing"] td:nth-child(3),[id$="estimated-billing"] td:nth-child(4),[id$="estimated-billing"] td:nth-child(5){white-space:nowrap;text-align:right}
.solution-totals,[id$="estimated-billing"] .solution-totals{min-width:800px;table-layout:auto}.solution-totals th,[id$="estimated-billing"] .solution-totals th{width:auto}.solution-totals th[scope=row]{background:transparent}.solution-totals td:nth-child(3),[id$="estimated-billing"] .solution-totals td:nth-child(3){white-space:normal;text-align:left}.solution-totals td:nth-last-child(-n+2){white-space:nowrap;text-align:right}h3{margin-top:20px}
[id$="source-status"] td:nth-child(3),[id$="source-status"] td:nth-child(4){white-space:nowrap}
.provider-area{margin-block:2rem 4rem}.provider-area>h2{font-size:1.5rem;margin-bottom:1rem}.provider-area>section{margin-top:2rem}
.report-nav{position:static}.report-nav a{border:0;border-bottom:2px solid var(--border2);border-radius:0}
.evidence-dataset{margin:16px 0;border-block:1px solid var(--border);padding:12px 0}.evidence-dataset>summary,details>summary{cursor:pointer;font-weight:650;color:var(--soft)}details[open]>summary{margin-bottom:12px}
.evidence-dataset th,.evidence-dataset td{min-width:110px;overflow-wrap:break-word;word-break:normal}.evidence-dataset td{max-width:420px}.evidence-dataset th{white-space:nowrap}
.header-inner,.section-heading{flex-wrap:wrap}.brand{min-width:0}.logo{flex:none}
h1,h2,.generated,.section-heading span,dt,dd,td,th{overflow-wrap:anywhere;letter-spacing:0}
.stat-list{grid-template-columns:minmax(0,1fr) minmax(0,auto)}
td{font-variant-numeric:tabular-nums}td a{color:var(--link);text-underline-offset:3px}td a:hover{color:var(--text)}.table-wrap:focus-visible,a:focus-visible{outline:2px solid var(--blue);outline-offset:3px}
@media(max-width:900px){.report-layout{grid-template-columns:minmax(0,1fr);gap:1rem}.report-layout>.report-nav{position:static;display:flex;flex-wrap:wrap;border-inline-start:0;border-bottom:1px solid var(--border)}}
@media(max-width:600px){main{padding:16px}.header-inner{padding:20px 16px}.report-nav{margin:0 0 20px;padding:12px 0}.stat-list{gap:8px 12px}.summary{grid-template-columns:repeat(2,minmax(0,1fr))}.metric{padding:12px}.metric strong{font-size:1.5rem}}
@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
@media print{:root{--bg:#fff;--panel:#fff;--panel2:#fff;--text:#201f1e;--soft:#323130;--muted:#605e5c;--border:#c8c6c4;--border2:#c8c6c4;--warn:#503800;--warnbg:#fff;--warnborder:#605e5c;--ok:#145522;--bad:#8b1820}.card{break-inside:auto}.table-wrap{overflow:visible;border:0}table{min-width:0;table-layout:fixed;font-size:9pt}th,td{padding:6px}thead{display:table-header-group}tr{break-inside:avoid}h2{break-after:avoid}.metric strong{color:#005a9e}header{box-shadow:none}}
@media print{.report-layout{display:block}.report-nav{display:none!important}:root,:root[data-theme="light"]{color-scheme:light;--bg:#fff;--panel:#fff;--panel2:#fff;--text:#201f1e;--soft:#424242;--muted:#605e5c;--link:#005a9e;--border:#c8c6c4}[id$="estimated-billing"] table,.solution-totals,[id$="estimated-billing"] .solution-totals{min-width:0}[id$="estimated-billing"] th:nth-child(n){width:auto}[id$="estimated-billing"] td:nth-child(n){white-space:normal}.provider-area+.provider-area{break-before:page}}
</style></body></html>`;
  return start + body + end;
}
