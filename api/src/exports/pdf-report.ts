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
  azureBillingNote,
  azureBillingTables,
  azureAdoptionTables,
  azureAdoptionNote,
  githubBillingTables,
  githubBillingNote,
  reportOverviewTables,
  reportOverviewNote,
} from '@ninjapaw/contracts';
import { PRODUCT } from '@ninjapaw/developer-usage-insights-metadata';

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

const palette = {
  blue: rgb(0, 0.47, 0.83),
  ink: rgb(0.125, 0.122, 0.118),
  muted: rgb(0.376, 0.369, 0.361),
  border: rgb(0.88, 0.875, 0.867),
  tint: rgb(0.937, 0.965, 0.988),
  alternate: rgb(0.973, 0.977, 0.984),
};

async function generateProviderPdf(report: StoredReport): Promise<PDFDocument> {
  if (report.provider === 'combined') throw new Error('PDF sections require a single provider.');
  const providerKey = report.provider;
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  const characterSets = new Map(
    [regular, bold].map((font) => [font, new Set(font.getCharacterSet())]),
  );
  let page: PDFPage;
  let y = 0;
  const bottom = 64;
  const top = 710;
  const width = 520;
  const newPage = () => {
    page = document.addPage([612, 792]);
    page.drawRectangle({ x: 0, y: 786, width: 612, height: 6, color: palette.blue });
    page.drawText(PRODUCT.displayName.toUpperCase(), {
      x: 46,
      y: 752,
      font: bold,
      size: 10,
      color: palette.blue,
    });
    const provider = reportProviderNames[providerKey];
    page.drawText(provider, {
      x: 566 - regular.widthOfTextAtSize(provider, 9),
      y: 752,
      font: regular,
      size: 9,
      color: palette.muted,
    });
    page.drawLine({
      start: { x: 46, y: 735 },
      end: { x: 566, y: 735 },
      color: palette.border,
      thickness: 0.6,
    });
    y = top;
  };
  const ensureSpace = (height: number) => {
    if (y - Math.min(height, top - bottom) < bottom) newPage();
  };
  newPage();
  const addLine = (
    text: string,
    options: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb>; url?: string } = {},
  ) => {
    const font = options.bold ? bold : regular;
    const size = options.size ?? 10;
    const lines = wrap(text, font, characterSets.get(font)!, size, width);
    if (size >= 12) {
      ensureSpace(lines.length * (size + 5) + 65);
      y -= 16;
      if (size >= 15 && size < 22) {
        page.drawLine({
          start: { x: 46, y: y + 12 },
          end: { x: 566, y: y + 12 },
          color: palette.border,
          thickness: 0.6,
        });
      }
    } else ensureSpace(lines.length * (size + 5));
    for (const line of lines) {
      ensureSpace(size + 5);
      page.drawText(line, {
        x: 46,
        y,
        font,
        size,
        color: options.color ?? (options.url || size >= 15 ? palette.blue : palette.ink),
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
    y -= 4;
  };

  const addTable = (
    title: string,
    columns: string[],
    rows: (string | number)[][],
    compact = false,
  ) => {
    addLine(title, { bold: true, size: 12 });
    const indexes = columns
      .map((_, index) => index)
      .filter((index) => columns[index] !== 'Provider');
    const labels = indexes.map((index) => columns[index]!);
    const values = rows.map((row) => indexes.map((index) => String(row[index] ?? '')));
    if (!rows.length) {
      addLine('No rows collected. See collection evidence for availability.', {
        size: 9,
        color: palette.muted,
      });
      return;
    }
    if (!compact) {
      for (const [index, row] of values.entries()) {
        const fields = row
          .map((value, column) => ({ value, column }))
          .filter((field) => field.value !== '');
        const height = fields.reduce((sum, { value, column }) => {
          const font = column === 0 ? bold : regular;
          return (
            sum +
            wrap(`${labels[column]}: ${value}`, font, characterSets.get(font)!, 10, width).length *
              15 +
            4
          );
        }, 22);
        ensureSpace(height <= top - bottom ? height : 65);
        y -= 6;
        page.drawLine({
          start: { x: 46, y: y + 10 },
          end: { x: 566, y: y + 10 },
          color: palette.border,
          thickness: 0.5,
        });
        for (const { column, value } of fields) {
          addLine(`${labels[column]}: ${value}`, { size: 10, bold: column === 0 });
        }
        if (index < values.length - 1) y -= 6;
      }
      return;
    }
    const widths =
      labels[0] === 'Fact ID'
        ? [60, 460]
        : title === 'Daily activity'
          ? [130, 210, 125, 55]
          : title === 'Cost scenarios (USD)'
            ? [200, 140, 90, 90]
            : labels.map(() => width / labels.length);
    const positions = widths.map(
      (_, index) => 46 + widths.slice(0, index).reduce((sum, value) => sum + value, 0),
    );
    const lineHeight = 13;
    const headerLines = labels.map((label, index) =>
      wrap(label, bold, characterSets.get(bold)!, 9, widths[index]! - 16),
    );
    const headerHeight = Math.max(...headerLines.map((lines) => lines.length)) * lineHeight + 14;
    const header = () => {
      ensureSpace(headerHeight + 40);
      page.drawRectangle({
        x: 46,
        y: y - headerHeight,
        width,
        height: headerHeight,
        color: palette.tint,
      });
      for (const [column, lines] of headerLines.entries()) {
        for (const [index, line] of lines.entries()) {
          page.drawText(line, {
            x: positions[column]! + 8,
            y: y - 17 - index * lineHeight,
            font: bold,
            size: 9,
            color: palette.ink,
          });
        }
      }
      y -= headerHeight;
    };
    header();
    for (const [rowIndex, row] of values.entries()) {
      const cells = row.map((value, index) =>
        wrap(value, regular, characterSets.get(regular)!, 9, widths[index]! - 16),
      );
      let remaining = Math.max(...cells.map((lines) => lines.length));
      let offset = 0;
      if (
        remaining * lineHeight + 16 <= top - bottom - headerHeight &&
        y - remaining * lineHeight - 16 < bottom
      ) {
        newPage();
        header();
      }
      while (remaining > 0) {
        let capacity = Math.floor((y - bottom - 16) / lineHeight);
        if (capacity < 1) {
          newPage();
          header();
          capacity = Math.floor((y - bottom - 16) / lineHeight);
        }
        const count = Math.min(remaining, capacity);
        const height = count * lineHeight + 16;
        page.drawRectangle({
          x: 46,
          y: y - height,
          width,
          height,
          color: rowIndex % 2 ? palette.alternate : rgb(1, 1, 1),
        });
        for (const [column, lines] of cells.entries()) {
          for (const [index, line] of lines.slice(offset, offset + count).entries()) {
            const numeric = ['Commits', 'Monthly', 'Annualized'].includes(labels[column]!);
            page.drawText(line, {
              x: numeric
                ? positions[column]! + widths[column]! - 8 - regular.widthOfTextAtSize(line, 9)
                : positions[column]! + 8,
              y: y - 17 - index * lineHeight,
              font: regular,
              size: 9,
              color: palette.ink,
            });
          }
        }
        y -= height;
        page.drawLine({
          start: { x: 46, y },
          end: { x: 566, y },
          color: palette.border,
          thickness: 0.4,
        });
        remaining -= count;
        offset += count;
      }
    }
    y -= 10;
  };

  addLine('Executive report', { bold: true, size: 26 });
  addLine(report.subject, { bold: true, size: 18, color: palette.ink });
  addLine(
    `Executive report generated ${formatReportDateTime(report.generatedAt, report.timeZone)}`,
    { size: 10 },
  );
  addLine(
    `Planning report, not an invoice. ${report.provider === 'azure-devops' ? 'Azure values are preview estimates.' : 'Observed GitHub activity is not licensed-seat inventory or confirmed billable usage.'} Prices are USD scenarios, excluding tax and discounts.`,
    { size: 9 },
  );
  y -= 10;
  if (report.executiveSummary) {
    const summary = report.executiveSummary;
    addLine('Executive summary', { bold: true, size: 15 });
    ensureSpace(84);
    page!.drawRectangle({ x: 46, y: y - 64, width, height: 64, color: palette.tint });
    const metrics = [
      ['Unique identities', String(summary.uniqueProviderIdentities)],
      ['Sources included', `${summary.includedSources} / ${summary.requestedSources}`],
      ['Sources skipped', String(summary.skippedSources)],
    ];
    for (const [index, metric] of metrics.entries()) {
      page!.drawText(metric[0]!, {
        x: 58 + index * 173,
        y: y - 19,
        font: regular,
        size: 9,
        color: palette.muted,
      });
      const value = metric[1]!;
      const size = Math.min(22, 145 / bold.widthOfTextAtSize(value, 1));
      page!.drawText(value, {
        x: 58 + index * 173,
        y: y - 47,
        font: bold,
        size,
        color: palette.blue,
      });
    }
    y -= 84;
    addLine(
      report.provider === 'azure-devops'
        ? `Azure identity records: ${summary.azureIdentityRecords}`
        : `GitHub identity records: ${summary.gitHubIdentityRecords}`,
    );
    y -= 10;
  }
  for (const table of reportOverviewTables(report)) {
    if (table.rows.length) addTable(table.title, table.columns, table.rows);
  }
  addLine(reportOverviewNote, { size: 9 });
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
  if (report.costEstimates?.length && !report.insights?.azureEstimates?.length) {
    ensureSpace(250);
    addLine('Estimated billing', { bold: true, size: 15 });
    addLine(solutionPricingNote, { size: 9 });
    addTable(
      'Cost scenarios (USD)',
      ['Solution', 'Quantity', 'Monthly', 'Annualized'],
      solutionPricingRows(report.costEstimates).map((row) => [
        row.solution,
        row.quantity,
        `$${row.monthlyUsd.toFixed(2)}`,
        `$${row.annualizedUsd.toFixed(2)}`,
      ]),
      true,
    );
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
  if (report.insights?.azureBilling?.length || report.insights?.azureEstimates?.length) {
    addLine('Provider-reported Azure billing', { bold: true, size: 15 });
    if (report.insights.azureEstimates?.length) {
      addLine(azureAdoptionNote, { size: 9 });
      for (const table of azureAdoptionTables(
        report.insights.azureEstimates,
        report.insights.azureBilling,
        report.insights.repositories,
      ))
        addTable(table.title, table.columns, table.rows);
    }
    addLine(azureBillingNote, { size: 9 });
    for (const table of azureBillingTables(report.insights.azureBilling ?? [], {
      readableDates: true,
      timeZone: report.timeZone,
    })) {
      addTable(table.title, table.columns, table.rows);
    }
  }
  if (report.insights?.githubBilling?.length) {
    addLine('Provider-reported GitHub billing', { bold: true, size: 15 });
    addLine(githubBillingNote, { size: 9 });
    for (const table of githubBillingTables(report.insights.githubBilling))
      addTable(table.title, table.columns, table.rows);
  }
  addLine('Source status', { bold: true, size: 15 });
  for (const source of report.sourceStatuses ?? []) {
    addLine(`${source.status.toUpperCase()}: ${source.subject}`, {
      bold: true,
      color: source.status === 'skipped' ? rgb(0.64, 0.15, 0.17) : rgb(0.06, 0.49, 0.06),
    });
    addLine(`Returned identity rows: ${source.committerCount}`, { size: 9 });
    if (source.scope) addLine(`Scope: ${source.scope}`);
    if (source.reason) addLine(`Reason: ${source.reason}`);
    if (source.remediation) addLine(`How to fix: ${source.remediation}`);
    y -= 5;
  }
  if (report.gitHubCommitters.length)
    addLine('GitHub contribution detail', { bold: true, size: 15 });
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
      addLine(committer.displayName || 'Unnamed identity', { bold: true });
      addLine(
        `Organization: ${committer.organization}; Plan: ${committer.plan}; Billing: ${committer.billableCommitter}`,
        { size: 9 },
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
      if (
        table.title.startsWith('Azure bill') ||
        [
          'GitHub billing snapshots',
          'GitHub security billing identities',
          'GitHub provider usage charges',
          'GitHub security billing repositories',
        ].includes(table.title)
      )
        continue;
      addTable(table.title, table.columns, table.rows, table.title === 'Daily activity');
    }
    addLine('Repository links', { bold: true, size: 13 });
    for (const repository of report.insights.repositories) {
      addLine(
        `${repository.source} / ${repository.project ? `${repository.project} / ` : ''}${repository.name}`,
        {
          size: 9,
          url: repositoryWebUrl(repository),
        },
      );
    }
  }
  addLine('Recommended next steps', { bold: true, size: 15 });
  addLine('CIO decision brief', { bold: true, size: 15 });
  for (const table of cioBriefTables(buildCioBrief(report, report.provider))) {
    addTable(table.title, table.columns, table.rows, table.title === 'CIO evidence');
  }
  addLine(
    'Resolve skipped sources, review identity matches, and verify official membership, product enablement and billable usage before making purchasing decisions. Costs are scenarios; overlapping counts are not an invoice total.',
    { size: 9 },
  );
  addLine(
    'Cross-provider identities are not automatically merged. Skipped sources are excluded from totals.',
    { size: 9 },
  );
  addLine('Export notes', { bold: true, size: 12 });
  addLine('Unsupported PDF font characters appear as ?. CSV and HTML retain full Unicode text.', {
    size: 9,
    color: palette.muted,
  });
  return document;
}

export async function generateExecutivePdf(report: StoredReport): Promise<Uint8Array> {
  let document: PDFDocument;
  if (report.provider === 'combined') {
    document = await PDFDocument.create();
    for (const provider of ['azure-devops', 'github'] as const) {
      const scoped = providerReport(report, provider);
      scoped.subject = report.subject;
      scoped.warnings = report.warnings.map((warning) => `Report-wide warning: ${warning}`);
      const section = await generateProviderPdf(scoped);
      for (const page of await document.copyPages(section, section.getPageIndices()))
        document.addPage(page);
    }
  } else document = await generateProviderPdf(report);
  document.setTitle(`${PRODUCT.displayName} - Executive report`);
  document.setAuthor(PRODUCT.displayName);
  document.setSubject(report.subject);
  document.setCreator(PRODUCT.displayName);
  const font = await document.embedFont(StandardFonts.Helvetica);
  for (const [index, page] of document.getPages().entries()) {
    page.drawLine({
      start: { x: 46, y: 46 },
      end: { x: 566, y: 46 },
      color: palette.border,
      thickness: 0.6,
    });
    page.drawText('Planning estimates | Not an invoice', {
      x: 46,
      y: 30,
      font,
      size: 8,
      color: palette.muted,
    });
    const number = `${index + 1} / ${document.getPageCount()}`;
    page.drawText(number, {
      x: 566 - font.widthOfTextAtSize(number, 8),
      y: 30,
      font,
      size: 8,
      color: palette.muted,
    });
  }
  return document.save();
}
