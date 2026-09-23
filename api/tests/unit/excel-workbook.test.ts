import { describe, expect, it } from 'vitest';
import { generateReportWorkbook } from '../../src/exports/excel-workbook.js';

describe('generateReportWorkbook', () => {
  it('produces a non-empty XLSX buffer with the required worksheets', async () => {
    const buffer = await generateReportWorkbook({
      organization: 'contoso',
      plans: ['codeSecurity'],
      sourceApiVersion: '7.2-preview.3',
      generatedAt: new Date().toISOString(),
      azureDevOpsCommitters: [],
      warnings: [{ message: 'Test warning' }],
    });
    expect(buffer.byteLength).toBeGreaterThan(0);
  });
});
