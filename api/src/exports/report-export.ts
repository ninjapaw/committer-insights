import type { ExportFormat, Report } from '@ninjapaw/contracts';
import { generateReportWorkbook, safeExportFilename } from './excel-workbook.js';
import { generateCsv } from './csv-report.js';
import { generateExecutivePdf } from './pdf-report.js';
import { generateStandaloneHtml } from './standalone-html.js';

const contentTypes: Record<ExportFormat, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  csv: 'text/csv; charset=utf-8',
  pdf: 'application/pdf',
  html: 'text/html; charset=utf-8',
};

export async function generateReportExport(report: Report, format: ExportFormat) {
  let body: string | Buffer;
  switch (format) {
    case 'xlsx':
      body = Buffer.from(
        await generateReportWorkbook({
          ...report,
          warnings: report.warnings.map((message) => ({ message })),
        }),
      );
      break;
    case 'pdf':
      body = Buffer.from(await generateExecutivePdf(report));
      break;
    case 'html':
      body = generateStandaloneHtml(report);
      break;
    case 'csv':
      body = generateCsv(report);
      break;
  }
  return {
    body,
    contentType: contentTypes[format],
    filename: safeExportFilename(report.subject, report.generatedAt, format),
  };
}
