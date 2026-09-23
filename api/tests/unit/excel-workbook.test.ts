import { describe, expect, it } from 'vitest';
import ExcelJS from 'exceljs';
import { generateReportWorkbook } from '../../src/exports/excel-workbook.js';

describe('generateReportWorkbook', () => {
  it('includes Azure worksheets, metadata, and warnings without a GitHub sheet', async () => {
    const buffer = await generateReportWorkbook({
      provider: 'azure-devops',
      subject: 'contoso',
      organization: 'contoso',
      plans: ['codeSecurity'],
      sourceApiVersion: '7.2-preview.3',
      generatedAt: '2026-09-23T10:00:00.000Z',
      azureDevOpsCommitters: [],
      gitHubCommitters: [],
      warnings: [{ message: 'Test warning' }],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    expect(workbook.worksheets.map(({ name }) => name)).toEqual([
      'Summary',
      'Azure DevOps Committers',
      'Report Parameters',
      'Warnings and Methodology',
    ]);
    expect(workbook.getWorksheet('Summary')!.getCell('B3').value).toBe('contoso');
    expect(workbook.getWorksheet('Summary')!.getCell('B4').value).toBe('codeSecurity');
    expect(workbook.getWorksheet('Azure DevOps Committers')!.getRow(1).values).toContain(
      'Identity ID',
    );
    expect(workbook.getWorksheet('Warnings and Methodology')!.getSheetValues().flat(2)).toContain(
      'Test warning',
    );
  });

  it('produces a GitHub workbook without Azure DevOps rows', async () => {
    const buffer = await generateReportWorkbook({
      provider: 'github',
      subject: 'octocat/example',
      organization: 'octocat',
      plans: ['last-90-days'],
      sourceApiVersion: '2022-11-28',
      generatedAt: '2026-09-23T10:00:00.000Z',
      azureDevOpsCommitters: [],
      gitHubCommitters: [
        {
          provider: 'github',
          repository: 'octocat/example',
          login: 'octocat',
          displayName: 'Octo Cat',
          profileUrl: 'https://github.com/octocat',
          commitCount: 2,
          lastCommitAt: '2026-09-23T10:00:00.000Z',
          collectedAt: '2026-09-23T10:05:00.000Z',
          sourceApiVersion: '2022-11-28',
        },
      ],
      warnings: [],
    });
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);
    expect(workbook.getWorksheet('Azure DevOps Committers')).toBeUndefined();
    const github = workbook.getWorksheet('GitHub Committers')!;
    expect(github.getCell('A2').value).toBe('octocat');
    expect(github.getCell('C2').value).toBe('octocat/example');
    expect(github.getCell('D2').value).toBe('2');
    expect(github.rowCount).toBe(2);
  });

  it('includes both provider sheets and skipped-source remediation in a combined workbook', async () => {
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(
      await generateReportWorkbook({
        provider: 'combined',
        subject: 'combined-report',
        organization: 'multiple',
        plans: ['combined'],
        sourceApiVersion: 'multiple',
        generatedAt: '2026-09-23T10:00:00.000Z',
        azureDevOpsCommitters: [],
        gitHubCommitters: [],
        warnings: [],
        sourceStatuses: [
          {
            provider: 'github',
            subject: 'octocat/private',
            status: 'skipped',
            committerCount: 0,
            reason: 'Permission denied',
            remediation: '=unsafe-formula',
          },
        ],
        executiveSummary: {
          requestedSources: 2,
          includedSources: 1,
          skippedSources: 1,
          azureIdentityRecords: 0,
          gitHubIdentityRecords: 0,
          uniqueProviderIdentities: 0,
        },
      }),
    );
    expect(workbook.worksheets.map(({ name }) => name)).toEqual([
      'Summary',
      'Azure DevOps Committers',
      'GitHub Committers',
      'Source Status',
      'Report Parameters',
      'Warnings and Methodology',
    ]);
    const source = workbook.getWorksheet('Source Status')!;
    expect(source.getCell('B2').value).toBe('octocat/private');
    expect(source.getCell('C2').value).toBe('skipped');
    expect(source.getCell('F2').value).toBe("'=unsafe-formula");
    expect(workbook.getWorksheet('Summary')!.getSheetValues().flat(2)).toEqual(
      expect.arrayContaining(['Sources included', 'Sources skipped', 'Unique provider identities']),
    );
  });
});
