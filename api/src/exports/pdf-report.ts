import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { StoredReport } from '../reports/report-store.js';

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let current = '';
  for (const word of text.split(/\s+/)) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= width) current = candidate;
    else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

export async function generateExecutivePdf(report: StoredReport): Promise<Uint8Array> {
  const document = await PDFDocument.create();
  const regular = await document.embedFont(StandardFonts.Helvetica);
  const bold = await document.embedFont(StandardFonts.HelveticaBold);
  let page: PDFPage = document.addPage([612, 792]);
  let y = 744;
  const addLine = (
    text: string,
    options: { bold?: boolean; size?: number; color?: ReturnType<typeof rgb> } = {},
  ) => {
    const font = options.bold ? bold : regular;
    const size = options.size ?? 10;
    for (const line of wrap(text, font, size, 520)) {
      if (y < 48) {
        page = document.addPage([612, 792]);
        y = 744;
      }
      page.drawText(line, { x: 46, y, font, size, color: options.color ?? rgb(0.13, 0.12, 0.12) });
      y -= size + 5;
    }
  };

  addLine('Committer Insights', { bold: true, size: 22, color: rgb(0, 0.35, 0.62) });
  addLine(`Executive report generated ${report.generatedAt}`, { size: 10 });
  y -= 10;
  if (report.executiveSummary) {
    const summary = report.executiveSummary;
    addLine('Executive summary', { bold: true, size: 15 });
    addLine(`Unique provider identities: ${summary.uniqueProviderIdentities}`);
    addLine(`Sources included: ${summary.includedSources} of ${summary.requestedSources}`);
    addLine(`Sources skipped: ${summary.skippedSources}`);
    addLine(`Azure identity records: ${summary.azureIdentityRecords}`);
    addLine(`GitHub identity records: ${summary.gitHubIdentityRecords}`);
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
    if (summary.totalCommits !== undefined) addLine(`Commits: ${summary.totalCommits}`);
    addLine(`API version: ${summary.apiVersion}`);
    addLine(summary.methodology, { size: 9 });
    y -= 10;
  }
  addLine('Source status', { bold: true, size: 15 });
  for (const source of report.sourceStatuses ?? []) {
    addLine(
      `${source.status.toUpperCase()} | ${source.provider} | ${source.subject} | ${source.committerCount} committers`,
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
  addLine(
    'Cross-provider identities are not automatically merged. Skipped sources are excluded from totals.',
    { size: 9 },
  );
  return document.save();
}
