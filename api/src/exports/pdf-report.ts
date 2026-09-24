import { PDFDocument, PDFString, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { StoredReport } from '../reports/report-store.js';
import {
  getGitHubContributions,
  formatReportDateTime,
  repositoryWebUrl,
  insightTables,
  solutionPricingNote,
  solutionPricingRows,
  providerReport,
  reportProviderNames,
  buildCioBrief,
  cioBriefTables,
  uniqueAzureDevOpsCommitters,
} from '@ninjapaw/contracts';

function wrap(
  text: string,
  font: PDFFont,
  supported: Set<number>,
  size: number,
  width: number,
): string[] {
  const lines: string[] = [];
  let current = '';
  const printable = Array.from(text)
    .map((character) =>
      /\s/.test(character) || supported.has(character.codePointAt(0)!) ? character : '?',
    )
    .join('');
  for (const word of printable.split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) current = candidate;
    else {
      if (current) lines.push(current);
      current = '';
      for (const character of word) {
        if (current && font.widthOfTextAtSize(current + character, size) > width) {
          lines.push(current);
          current = character;
        } else current += character;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function generateExecutivePdf(report: StoredReport): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  if (report.provider === 'combined') {
    for (const provider of ['azure-devops', 'github'] as const) {
      const scoped = providerReport(report, provider);
      scoped.warnings = report.warnings.map((warning) => `Report-wide warning: ${warning}`);
      const section = await PDFDocument.load(await generateExecutivePdf(scoped));
      for (const page of await document.copyPages(section, section.getPageIndices()))
        document.addPage(page);
    }
    return document.save();
  }
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const characterSets = new Map(
    [regular, bold].map((font) => [font, new Set(font.getCharacterSet())]),
  );
  let page: PDFPage = document.addPage([612, 792]);
  let y = 744;
  const addLine = (
    text: string,
    options: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb>; url?: string } = {},
  ) => {
    const font = options.bold ? bold : regular;
    const size = options.size ?? 10;
    for (const line of wrap(text, font, characterSets.get(font)!, size, 520)) {
      if (y < 48) {
        page = document.addPage([612, 792]);
        y = 744;
      }
      page.drawText(line, {
        x: 46,
        y,
        font,
        size,
        color: options.color ?? (options.url ? rgb(0, 0.35, 0.62) : rgb(0.13, 0.12, 0.12)),
      });
      if (options.url) {
        const annotation = document.context.obj({
          Type: 'Annot',
          Subtype: 'Link',
          Rect: [46, y - 2, 46 + font.widthOfTextAtSize(line, size), y + size],
          Border: [0, 0, 0],
          A: { Type: 'Action', S: 'URI', URI: PDFString.of(options.url) },
        });
        page.node.addAnnot(document.context.register(annotation));
      }
      y -= size + 5;
    }
  };

  addLine('Committer Insights', { bold: true, size: 22, color: rgb(0, 0.35, 0.62) });
  addLine(reportProviderNames[report.provider], { bold: true, size: 18 });
  addLine(
    `Executive report generated ${formatReportDateTime(report.generatedAt, report.timeZone)}`,
    { size: 10 },
  );
  addLine(`Report: ${report.subject}`, { size: 10 });
  addLine(
    'PDF font limitations: unsupported characters appear as ?. CSV and HTML retain full Unicode text.',
    { size: 9 },
  );
  addLine(
    `Planning report, not an invoice. ${report.provider === 'azure-devops' ? 'Azure values are preview estimates.' : 'Observed GitHub activity is not licensed-seat inventory or confirmed billable usage.'} Prices are USD scenarios, excluding tax and discounts.`,
    { size: 9 },
  );
  y -= 10;
  addLine('CIO decision brief', { bold: true, size: 15 });
  for (const table of cioBriefTables(buildCioBrief(report, report.provider))) {
    addLine(table.title, { bold: true, size: 12 });
    for (const row of table.rows)
      addLine(row.map((cell, index) => `${table.columns[index]}: ${cell}`).join(' | '), {
        size: 9,
      });
  }
  if (report.executiveSummary) {
    const summary = report.executiveSummary;
    addLine('Executive summary', { bold: true, size: 15 });
    addLine(`Unique provider identities: ${summary.uniqueProviderIdentities}`);
    addLine(`Sources included: ${summary.includedSources} of ${summary.requestedSources}`);
    addLine(`Sources skipped: ${summary.skippedSources}`);
    addLine(
      report.provider === 'azure-devops'
        ? `Azure identity records: ${summary.azureIdentityRecords}`
        : `GitHub identity records: ${summary.gitHubIdentityRecords}`,
    );
    y -= 10;
  }
  for (const summary of report.providerSummaries ?? []) {
    addLine(summary.displayName, { bold: true, size: 15 });
    addLine(`Measurement: ${summary.measurement}`);
    addLine(
      `${summary.sourceLabel}: ${summary.includedSources} included, ${summary.skippedSources} skipped`,
    );
    addLine(
      `Identity records: ${summary.identityRecords}; unique identities: ${summary.uniqueIdentities}`,
    );
    if (summary.totalRepositories !== undefined)
      addLine(`Repositories: ${summary.totalRepositories}`);
    if (summary.totalCommits !== undefined) addLine(`Commits: ${summary.totalCommits}`);
    addLine(`API version: ${summary.apiVersion}`);
    addLine(summary.methodology, { size: 9 });
    y -= 10;
  }
  if (report.costEstimates?.length) {
    addLine('Estimated billing', { bold: true, size: 15 });
    addLine('Solution pricing totals', { bold: true });
    addLine(solutionPricingNote, { size: 9 });
    for (const row of solutionPricingRows(report.costEstimates)) {
      addLine(
        `${row.provider} | ${row.solution} | Quantity: ${row.quantity} | Monthly USD: $${row.monthlyUsd.toFixed(2)} | Annualized USD: $${row.annualizedUsd.toFixed(2)}`,
        { bold: true },
      );
    }
    for (const item of report.costEstimates) {
      addLine(
        `${item.label}: ${item.count} x $${item.unitPriceUsd.toFixed(2)} = $${item.estimatedMonthlyCostUsd.toFixed(2)} / month`,
        { bold: true },
      );
      addLine(item.basis, { size: 9 });
      addLine(item.source, { size: 9 });
    }
    y -= 10;
  }
  addLine('Source status', { bold: true, size: 15 });
  for (const source of report.sourceStatuses ?? []) {
    addLine(
      `${source.status.toUpperCase()} | ${source.provider} | ${source.subject} | ${source.committerCount} returned identity rows`,
      {
        bold: true,
        color: source.status === 'skipped' ? rgb(0.64, 0.15, 0.17) : rgb(0.06, 0.49, 0.06),
      },
    );
    if (source.scope) addLine(`Scope: ${source.scope}`);
    if (source.reason) addLine(`Reason: ${source.reason}`);
    if (source.remediation) addLine(`How to fix: ${source.remediation}`);
    y -= 5;
  }
  for (const committer of report.gitHubCommitters) {
    const contributions = getGitHubContributions(committer);
    addLine(
      `${committer.login}: ${contributions.length || 'Unknown'} repositories, ${committer.commitCount} commits; billing unknown`,
      { bold: true },
    );
    if (!contributions.length)
      addLine('Per-repository counts unavailable in this older report. Regenerate for detail.', {
        size: 9,
      });
    for (const item of contributions)
      addLine(
        `${item.repository}: ${item.commitCount} commits; last authored ${formatReportDateTime(item.lastCommitAt, report.timeZone)}`,
        {
          size: 9,
          url: repositoryWebUrl({ provider: 'github', source: '', name: item.repository }),
        },
      );
  }
  if (report.azureDevOpsCommitters.length) {
    addLine('Azure DevOps committer estimates', { bold: true, size: 15 });
    for (const committer of uniqueAzureDevOpsCommitters(report.azureDevOpsCommitters)) {
      addLine(
        `${committer.displayName || 'Unnamed identity'} | ${committer.organization} | ${committer.plan} | Billing: ${committer.billableCommitter}`,
      );
    }
  }
  if (report.warnings.length) {
    addLine('Collection warnings', { bold: true, size: 15 });
    for (const warning of report.warnings) addLine(warning, { size: 9 });
  }
  if (report.insights) {
    addLine('Usage and security evidence', { bold: true, size: 15 });
    addLine(
      'Current settings do not prove recent scans or payment. Reported billing usage is not an invoice. Missing data is not zero. Daily activity uses GitHub authored dates (excluding two automation accounts) and Azure committer dates (including automation).',
      { size: 9 },
    );
    for (const table of insightTables(report.insights, {
      readableDates: true,
      timeZone: report.timeZone,
    })) {
      addLine(table.title, { bold: true, size: 13 });
      if (!table.rows.length)
        addLine('No rows collected. See collection evidence for availability.', { size: 9 });
      for (const row of table.rows) {
        addLine(
          table.columns.map((column, index) => `${column}: ${row[index] ?? ''}`).join(' | '),
          { size: 9 },
        );
        y -= 4;
      }
    }
    addLine('Repository links', { bold: true, size: 13 });
    for (const repository of report.insights.repositories) {
      addLine(
        `${repository.source} | ${repository.project ? `${repository.project} | ` : ''}${repository.name}`,
        {
          size: 9,
          url: repositoryWebUrl(repository),
        },
      );
    }
  }
  addLine('Recommended next steps', { bold: true, size: 15 });
  addLine(
    'Resolve skipped sources, review identity matches, and verify official membership, product enablement and billable usage before making purchasing decisions. Costs are scenarios; overlapping counts are not an invoice total.',
    { size: 9 },
  );
  addLine(
    'Cross-provider identities are not automatically merged. Skipped sources are excluded from totals.',
    { size: 9 },
  );
  return document.save();
}
