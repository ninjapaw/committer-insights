import type { ExportFormat, Report } from '@ninjapaw/contracts';
import { safeExportFilename } from './sanitize.js';
import { generateCsv } from './csv-report.js';
import { generateExecutivePdf } from './pdf-report.js';
import { generateStandaloneHtml } from './standalone-html.js';

const contentTypes: Record<ExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  pdf: 'application/pdf',
  html: 'text/html; charset=utf-8',
};

export async function generateReportExport(report: Report, format: ExportFormat) {
  let body: string | Buffer;
  switch (format) {
    case 'pdf':
      body = Buffer.from(await generateExecutivePdf(report));
      break;
    case 'html':
      body = generateStandaloneHtml(report);
      break;
    case 'csv':
      body = generateCsv(report);
      break;
    default:
      throw new Error('Unsupported report format. Choose CSV, PDF, or HTML.');
  }
  return {
    body,
    contentType: contentTypes[format],
    filename: safeExportFilename(report.subject, report.generatedAt, format),
  };
}
