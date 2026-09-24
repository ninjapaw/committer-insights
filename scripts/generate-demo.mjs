import { mkdir, rm, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { PDFDocument } from 'pdf-lib';
import { generateReportExport } from '../api/dist/src/exports/report-export.js';
import { createDemoReports, demoDate } from './demo-fixtures.mjs';

const output = new URL('../demo/public/generated/', import.meta.url);
await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const reports = createDemoReports();
const files = [];
async function emit(name, body) {
  await writeFile(new URL(name, output), body);
  files.push({ name, sha256: createHash('sha256').update(body).digest('hex') });
}
for (const report of reports) {
  await emit(`${report.reportId}.json`, `${JSON.stringify(report, null, 2)}\n`);
  for (const format of ['csv', 'html', 'pdf']) {
    let { body } = await generateReportExport(report, format);
    if (format === 'pdf') {
      const pdf = await PDFDocument.load(body);
      pdf.setCreationDate(new Date(demoDate));
      pdf.setModificationDate(new Date(demoDate));
      body = await pdf.save();
    }
    await emit(`${report.reportId}.${format}`, body);
  }
}
await emit(
  'catalog.json',
  `${JSON.stringify(
    reports.map((report) => ({ id: report.reportId, title: report.subject })),
    null,
    2,
  )}\n`,
);
await writeFile(
  new URL('manifest.json', output),
  `${JSON.stringify({ synthetic: true, fixtureVersion: 1, generatedAt: demoDate, files }, null, 2)}\n`,
);
process.stdout.write(
  `Generated ${reports.length} synthetic reports and production CSV/HTML/PDF exports. No provider calls or credentials used.\n`,
);
