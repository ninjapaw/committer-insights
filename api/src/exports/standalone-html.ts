import type { StoredReport } from '../reports/report-store.js';
import { uniqueAzureDevOpsCommitters } from './azure-devops-display.js';

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function sourceRows(report: StoredReport): string {
  return (report.sourceStatuses ?? [])
    .map(
      (source) => `<tr class="status-${escapeHtml(source.status)}">
        <td>${escapeHtml(source.provider)}</td><td>${escapeHtml(source.subject)}</td>
        <td>${escapeHtml(source.status)}</td><td>${source.committerCount}</td>
        <td>${escapeHtml(source.reason)}</td><td>${escapeHtml(source.remediation)}</td>
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

function reportNavigation(report: StoredReport, azureRows: string, githubRows: string): string {
  const links = [
    ['#executive-summary', 'Executive summary'],
    ...(report.providerSummaries?.length ? [['#provider-summary', 'Provider summary']] : []),
    ...(report.costEstimates?.length ? [['#estimated-billing', 'Estimated billing']] : []),
    ...(report.sourceStatuses ? [['#source-status', 'Source status']] : []),
    ...(azureRows ? [['#azure-devops-committers', 'Azure DevOps committers']] : []),
    ...(githubRows ? [['#github-committers', 'GitHub committers']] : []),
    ['#recommendations', 'Recommended next steps'],
  ];
  return `<nav class="report-nav" aria-label="Report sections">${links
    .map(([href, label]) => `<a href="${href}">${label}</a>`)
    .join('')}</nav>`;
}

export function generateStandaloneHtml(report: StoredReport): string {
  const summary = report.executiveSummary;
  const providerSections = (report.providerSummaries ?? [])
    .map(
      (
        provider,
      ) => `<section class="card provider-card" id="provider-${escapeHtml(provider.provider)}">
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
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.login)}</td><td>${escapeHtml(item.displayName)}</td><td>${escapeHtml(item.repository)}</td><td>No</td><td>${item.commitCount}</td><td>${escapeHtml(item.lastCommitAt)}</td></tr>`,
    )
    .join('');
  const nav = reportNavigation(report, azureRows, githubRows);
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Committer Insights - ${escapeHtml(report.subject)}</title>
<style>:root{color-scheme:dark;--bg:#0b1118;--panel:#121821;--panel2:#182333;--border:#273345;--border2:#3b4a60;--text:#f3f7fb;--soft:#d5dde8;--muted:#9facbd;--blue:#2899f5;--blue2:#102a40;--warn:#ffe6a6;--warnbg:#3d300b;--warnborder:#7d6117;--ok:#6ccb5f;--bad:#ff7a85}*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;background:var(--bg);background-image:linear-gradient(rgb(120 180 230 / 5%) 1px,transparent 1px),linear-gradient(90deg,rgb(120 180 230 / 5%) 1px,transparent 1px);background-size:32px 32px;color:var(--text);font:15px/1.55 "Segoe UI","Segoe UI Variable",sans-serif}main{width:min(100%,1180px);margin:0 auto;padding:24px 24px 48px}header{background:var(--panel);border-bottom:1px solid var(--border);box-shadow:0 1px 3px rgb(0 0 0 / 22%)}.header-inner{width:min(100%,1180px);margin:0 auto;padding:22px 24px;display:flex;gap:18px;align-items:center;justify-content:space-between}.brand{display:flex;align-items:center;gap:12px}.logo{display:grid;grid-template-columns:10px 10px;grid-template-rows:10px 10px;gap:2px}.logo span:nth-child(1){background:#f25022}.logo span:nth-child(2){background:#7fba00}.logo span:nth-child(3){background:#00a4ef}.logo span:nth-child(4){background:#ffb900}h1,h2{margin:0;color:var(--text);line-height:1.2}h1{font-size:1.65rem}.generated{color:var(--muted);font-size:.9rem}.report-nav{position:sticky;top:0;z-index:5;display:flex;flex-wrap:wrap;gap:8px;margin:0 -24px 24px;padding:14px 24px;background:color-mix(in srgb,var(--bg) 94%,transparent);border-bottom:1px solid var(--border);backdrop-filter:blur(12px)}.report-nav a{border:1px solid var(--border2);border-radius:999px;color:var(--soft);padding:6px 12px;text-decoration:none;font-weight:650}.report-nav a:hover{border-color:var(--blue);color:var(--text)}.card{scroll-margin-top:72px;margin-top:24px;padding:20px;border:1px solid var(--border);border-radius:8px;background:var(--panel);box-shadow:0 4px 16px rgb(0 0 0 / 28%)}.section-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;margin-bottom:14px}.section-heading span{color:var(--muted);font-weight:650}.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px}.metric{padding:16px;border:1px solid var(--border);border-radius:8px;background:#071018}.metric strong{display:block;color:#8ecbff;font-size:2rem;line-height:1}.metric span{display:block;margin-top:8px;color:var(--muted)}.stat-list{display:grid;grid-template-columns:minmax(180px,1fr) auto;gap:8px 18px;margin:0}.stat-list dt{color:var(--muted)}.stat-list dd{margin:0;text-align:right;font-weight:700}.methodology{margin:16px 0 0;color:var(--soft)}.table-wrap{margin-top:12px;overflow-x:auto;border:1px solid var(--border);border-radius:8px}table{width:100%;border-collapse:collapse;min-width:760px}th,td{padding:12px 14px;border-bottom:1px solid var(--border);text-align:left;vertical-align:top}th{background:#0f304a;color:var(--soft);font-weight:750}tbody tr:last-child td{border-bottom:0}tbody tr:hover{background:var(--panel2)}.status-skipped td:nth-child(3){color:var(--bad);font-weight:700}.status-included td:nth-child(3){color:var(--ok);font-weight:700}.notice{margin:24px 0 0;border-left:4px solid var(--warnborder);border-radius:0 8px 8px 0;background:var(--warnbg);color:var(--warn);padding:14px 16px}.recommendations ul{margin:0;padding-left:1.25rem}.recommendations li{margin:.35rem 0;color:var(--soft)}@media print{:root{color-scheme:light}body{background:#fff;color:#201f1e}header,.card,.metric{background:#fff;box-shadow:none}.report-nav{display:none}.generated,.metric span,.stat-list dt{color:#605e5c}th{background:#eff6fc;color:#201f1e}.card,.metric,.table-wrap{border-color:#d2d0ce}main{padding:20px}.card,.metric{break-inside:avoid}}</style>
</head><body><header><div class="header-inner"><div class="brand"><div class="logo" aria-hidden="true"><span></span><span></span><span></span><span></span></div><h1>Committer Insights</h1></div><div class="generated">Generated ${escapeHtml(report.generatedAt)}</div></div></header><main>
${nav}
${
  summary
    ? `<section class="card" id="executive-summary"><div class="section-heading"><h2>Executive summary</h2><span>${escapeHtml(report.subject)}</span></div><div class="summary">
<div class="metric"><strong>${summary.uniqueProviderIdentities}</strong><span>Unique provider identities</span></div>
<div class="metric"><strong>${summary.includedSources}</strong><span>Sources included</span></div>
<div class="metric"><strong>${summary.skippedSources}</strong><span>Sources skipped</span></div>
<div class="metric"><strong>${summary.azureIdentityRecords + summary.gitHubIdentityRecords}</strong><span>Identity records</span></div></div></section>`
    : ''
}
${providerSections ? `<section class="card" id="provider-summary"><div class="section-heading"><h2>Provider summary</h2></div>${providerSections}</section>` : ''}
${report.costEstimates?.length ? `<section class="card" id="estimated-billing"><div class="section-heading"><h2>Estimated billing</h2><span>Public price assumptions</span></div><div class="table-wrap"><table><thead><tr><th>Provider</th><th>Estimate</th><th>Count</th><th>Unit price</th><th>Estimated monthly cost</th><th>Basis</th></tr></thead><tbody>${costRows(report)}</tbody></table></div></section>` : ''}
${report.sourceStatuses ? `<section class="card" id="source-status"><div class="section-heading"><h2>Source status</h2></div><div class="table-wrap"><table><thead><tr><th>Provider</th><th>Source</th><th>Status</th><th>Count</th><th>Reason</th><th>How to fix</th><th>Scope</th></tr></thead><tbody>${sourceRows(report)}</tbody></table></div></section>` : ''}
${azureRows ? `<section class="card" id="azure-devops-committers"><div class="section-heading"><h2>Azure DevOps committers</h2></div><div class="table-wrap"><table><thead><tr><th>Display name</th><th>Organization</th><th>Effective plans</th><th>Billable committer</th></tr></thead><tbody>${azureRows}</tbody></table></div></section>` : ''}
${githubRows ? `<section class="card" id="github-committers"><div class="section-heading"><h2>GitHub committers</h2></div><div class="table-wrap"><table><thead><tr><th>Login</th><th>Display name</th><th>Repository</th><th>Billable committer</th><th>Commits</th><th>Last commit</th></tr></thead><tbody>${githubRows}</tbody></table></div></section>` : ''}
<section class="card recommendations" id="recommendations"><div class="section-heading"><h2>Recommended next steps</h2></div><ul><li>Use Azure DevOps estimates as planning signals for Advanced Security billable committers, then validate counts in official billing before purchase decisions.</li><li>For GitHub, compare observed active committers with the GitHub Enterprise member directory and GHAS billing views; repository activity alone can undercount licensed users.</li><li>Review non-billable GitHub activity rows, bot exclusions, and unlinked author names before sharing reports externally.</li><li>Investigate skipped sources first because they are excluded from totals and may hide additional committers or repositories.</li></ul></section>
<p class="notice">Cross-provider identities are not automatically merged. Skipped sources are excluded from totals and listed with remediation above.</p>
</main></body></html>`;
}
