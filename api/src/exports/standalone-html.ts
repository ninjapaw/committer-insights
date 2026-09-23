import type { StoredReport } from '../reports/report-store.js';

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
      (source) => `<tr>
        <td>${escapeHtml(source.provider)}</td><td>${escapeHtml(source.subject)}</td>
        <td>${escapeHtml(source.status)}</td><td>${source.committerCount}</td>
        <td>${escapeHtml(source.reason)}</td><td>${escapeHtml(source.remediation)}</td>
        <td>${escapeHtml(source.scope)}</td>
      </tr>`,
    )
    .join('');
}

export function generateStandaloneHtml(report: StoredReport): string {
  const summary = report.executiveSummary;
  const providerSections = (report.providerSummaries ?? [])
    .map(
      (provider) => `<section>
<h2>${escapeHtml(provider.displayName)}</h2><p>${escapeHtml(provider.measurement)}</p>
<dl><dt>${escapeHtml(provider.sourceLabel)} included</dt><dd>${provider.includedSources}</dd>
<dt>Sources skipped</dt><dd>${provider.skippedSources}</dd><dt>Identity records</dt><dd>${provider.identityRecords}</dd>
<dt>Unique identities</dt><dd>${provider.uniqueIdentities}</dd>
${provider.totalCommits === undefined ? '' : `<dt>Commits</dt><dd>${provider.totalCommits}</dd>`}
<dt>API version</dt><dd>${escapeHtml(provider.apiVersion)}</dd></dl>
<p>${escapeHtml(provider.methodology)}</p></section>`,
    )
    .join('');
  const azureRows = report.azureDevOpsCommitters
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.displayName)}</td><td>${escapeHtml(item.organization)}</td><td>${escapeHtml(item.plan)}</td></tr>`,
    )
    .join('');
  const githubRows = report.gitHubCommitters
    .map(
      (item) =>
        `<tr><td>${escapeHtml(item.login)}</td><td>${escapeHtml(item.displayName)}</td><td>${escapeHtml(item.repository)}</td><td>${item.commitCount}</td><td>${escapeHtml(item.lastCommitAt)}</td></tr>`,
    )
    .join('');
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width">
<title>Committer Insights - ${escapeHtml(report.subject)}</title>
<style>body{font:15px/1.5 "Segoe UI",sans-serif;color:#201f1e;max-width:1100px;margin:32px auto;padding:0 20px}h1,h2{color:#005a9e}header{border-bottom:4px solid #0078d4;margin-bottom:24px}.summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.metric{border:1px solid #e1dfdd;padding:12px;border-radius:6px}.metric strong{display:block;font-size:24px}table{width:100%;border-collapse:collapse;margin:12px 0 28px}th,td{padding:8px;border-bottom:1px solid #e1dfdd;text-align:left;vertical-align:top}th{background:#eff6fc}.skipped{color:#a4262c}.notice{border-left:4px solid #ca5010;background:#fff4ce;padding:12px}@media print{body{margin:0}.metric{break-inside:avoid}}</style>
</head><body><header><h1>Committer Insights</h1><p>Executive report generated ${escapeHtml(report.generatedAt)}</p></header>
${
  summary
    ? `<section><h2>Executive summary</h2><div class="summary">
<div class="metric"><strong>${summary.uniqueProviderIdentities}</strong>Unique provider identities</div>
<div class="metric"><strong>${summary.includedSources}</strong>Sources included</div>
<div class="metric"><strong>${summary.skippedSources}</strong>Sources skipped</div>
<div class="metric"><strong>${summary.azureIdentityRecords + summary.gitHubIdentityRecords}</strong>Identity records</div></div></section>`
    : ''
}
${providerSections}
${report.sourceStatuses ? `<section><h2>Source status</h2><table><thead><tr><th>Provider</th><th>Source</th><th>Status</th><th>Count</th><th>Reason</th><th>How to fix</th><th>Scope</th></tr></thead><tbody>${sourceRows(report)}</tbody></table></section>` : ''}
${azureRows ? `<section><h2>Azure DevOps committers</h2><table><thead><tr><th>Display name</th><th>Organization</th><th>Plan</th></tr></thead><tbody>${azureRows}</tbody></table></section>` : ''}
${githubRows ? `<section><h2>GitHub committers</h2><table><thead><tr><th>Login</th><th>Display name</th><th>Repository</th><th>Commits</th><th>Last commit</th></tr></thead><tbody>${githubRows}</tbody></table></section>` : ''}
<p class="notice">Cross-provider identities are not automatically merged. Skipped sources are excluded from totals and listed with remediation above.</p>
</body></html>`;
}
