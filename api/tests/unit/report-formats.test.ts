import { describe, expect, it, vi } from 'vitest';
import { PDFDocument, PDFPage } from 'pdf-lib';
import ExcelJS from 'exceljs';
import { generateExecutivePdf } from '../../src/exports/pdf-report.js';
import { generateStandaloneHtml } from '../../src/exports/standalone-html.js';
import type { StoredReport } from '../../src/reports/report-store.js';
import { exportFormats } from '@ninjapaw/contracts';
import { generateReportExport } from '../../src/exports/report-export.js';
import { generateCsv } from '../../src/exports/csv-report.js';

const report: StoredReport = {
  reportId: 'report-id',
  provider: 'combined',
  subject: 'combined-report',
  organization: 'multiple',
  plans: ['combined'],
  generatedAt: '2026-09-23T10:00:00.000Z',
  sourceApiVersion: 'multiple',
  azureDevOpsCommitters: [],
  gitHubCommitters: [],
  sourceStatuses: [
    {
      provider: 'github',
      subject: '<unsafe>',
      status: 'skipped',
      committerCount: 0,
      reason: 'Not accessible',
      remediation: 'Grant read access',
      scope: 'Default branch, last 90 days',
    },
  ],
  executiveSummary: {
    requestedSources: 1,
    includedSources: 0,
    skippedSources: 1,
    azureIdentityRecords: 0,
    gitHubIdentityRecords: 0,
    uniqueProviderIdentities: 0,
  },
  warnings: [],
};

describe('standalone report formats', () => {
  it('retains distinct provider measurements in Excel, HTML, CSV and PDF', async () => {
    const withProviders: StoredReport = {
      ...report,
      providerSummaries: [
        {
          provider: 'azure-devops',
          displayName: 'Azure DevOps',
          sourceLabel: 'Organizations',
          measurement: 'Security estimate',
          apiVersion: '7.2-preview.3',
          methodology: 'Estimate methodology',
          includedSources: 1,
          skippedSources: 0,
          identityRecords: 2,
          uniqueIdentities: 1,
        },
        {
          provider: 'github',
          displayName: 'GitHub',
          sourceLabel: 'Repositories',
          measurement: 'Commit activity',
          apiVersion: '2022-11-28',
          methodology: 'Commit methodology',
          includedSources: 1,
          skippedSources: 1,
          identityRecords: 1,
          uniqueIdentities: 1,
          totalRepositories: 3,
          totalCommits: 6,
        },
      ],
      costEstimates: [
        {
          provider: 'azure-devops',
          label: 'Azure DevOps Advanced Security billable committers',
          count: 2,
          unitPriceUsd: 49,
          estimatedMonthlyCostUsd: 98,
          basis: 'Azure basis',
          source: 'Azure source',
        },
        {
          provider: 'github',
          label: 'GitHub Enterprise observed users',
          count: 1,
          unitPriceUsd: 21,
          estimatedMonthlyCostUsd: 21,
          basis: 'GitHub Enterprise basis',
          source: 'GitHub Enterprise source',
        },
      ],
    };
    const xlsx = await generateReportExport(withProviders, 'xlsx');
    const workbook = new ExcelJS.Workbook();
    if (typeof xlsx.body === 'string') throw new Error('Expected a binary Excel export');
    await workbook.xlsx.load(Uint8Array.from(xlsx.body).buffer);
    const sheet = workbook.getWorksheet('Provider Summary')!;
    expect(sheet.getCell('A2').value).toBe('Azure DevOps');
    expect(sheet.getCell('A3').value).toBe('GitHub');
    expect(sheet.getCell('H2').value).toBe('Not applicable');
    expect(sheet.getCell('H3').value).toBe('3');
    expect(sheet.getCell('I3').value).toBe('6');
    const billing = workbook.getWorksheet('Estimated Billing')!;
    expect(billing.getCell('B2').value).toBe('Azure DevOps Advanced Security billable committers');
    expect(billing.getCell('E2').value).toBe('98');
    for (const content of [generateCsv(withProviders), generateStandaloneHtml(withProviders)]) {
      expect(content).toContain('Security estimate');
      expect(content).toContain('Commit activity');
      expect(content).toContain('Estimate methodology');
      expect(content).toContain('Commit methodology');
      expect(content).toMatch(/Estimated billing|cost-estimate/);
      expect(content).toContain('Azure DevOps Advanced Security billable committers');
      expect(content).toContain('GitHub Enterprise observed users');
    }
    expect(generateCsv(withProviders)).toContain('provider-summary');
    const draw = vi.spyOn(PDFPage.prototype, 'drawText');
    try {
      await generateExecutivePdf(withProviders);
      const lines = draw.mock.calls.map(([line]) => line);
      expect(lines).toEqual(
        expect.arrayContaining([
          'Azure DevOps',
          'GitHub',
          'Estimated billing',
          'Azure DevOps Advanced Security billable committers: 2 x $49.00 = $98.00 / month',
          'Commits: 6',
          'Repositories: 3',
          'Measurement: Security estimate',
          'Measurement: Commit activity',
        ]),
      );
      expect(lines.filter((line) => line.startsWith('Commits:'))).toHaveLength(1);
    } finally {
      draw.mockRestore();
    }
  });

  const contentTypes = {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv: 'text/csv; charset=utf-8',
    pdf: 'application/pdf',
    html: 'text/html; charset=utf-8',
  };
  it.each(exportFormats)('dispatches %s through the shared export service', async (format) => {
    const output = await generateReportExport(report, format);
    expect(output.filename).toMatch(new RegExp(`\\.${format}$`));
    expect(output.body.length).toBeGreaterThan(0);
    expect(output.contentType).toBe(contentTypes[format]);
    expect(typeof output.body === 'string').toBe(format === 'csv' || format === 'html');
  });

  it('includes skipped sources and remediation in combined CSV', () => {
    const csv = generateCsv(report);
    expect(csv).toContain('skipped');
    expect(csv).toContain('Grant read access');
    expect(csv).toContain('Default branch, last 90 days');
    expect(csv).not.toContain('identityId');
    expect(csv).not.toContain('userPrincipalName');
  });

  it('escapes standalone HTML and includes remediation', () => {
    const html = generateStandaloneHtml(report);
    expect(html).toContain('&lt;unsafe&gt;');
    expect(html).not.toContain('<unsafe>');
    expect(html).toContain('Grant read access');
    expect(html).toContain('Default branch, last 90 days');
    expect(html).not.toContain('<script');
  });

  it('produces a valid PDF document', async () => {
    const pdf = await generateExecutivePdf(report);
    expect(Buffer.from(pdf).subarray(0, 5).toString()).toBe('%PDF-');
    const document = await PDFDocument.load(pdf);
    expect(document.getPageCount()).toBe(1);
    expect(document.getPage(0).getSize()).toEqual({ width: 612, height: 792 });
  });

  it('paginates long PDF source status lists', async () => {
    const pdf = await generateExecutivePdf({
      ...report,
      sourceStatuses: Array.from({ length: 60 }, (_, index) => ({
        ...report.sourceStatuses![0]!,
        subject: `octocat/repo-${index}`,
      })),
    });
    const document = await PDFDocument.load(pdf);
    expect(document.getPageCount()).toBeGreaterThan(1);
  });

  it('includes both providers but redacts sensitive identifier values in executive CSV and HTML', () => {
    const populated: StoredReport = {
      ...report,
      azureDevOpsCommitters: [
        {
          provider: 'azure-devops',
          organization: 'contoso',
          displayName: '<script>alert("x")</script>',
          plan: 'codeSecurity',
          resultType: 'estimated',
          userPrincipalName: 'private-upn@example.invalid',
          cuid: 'private-cuid',
          identityId: 'private-identity',
          isEstimated: true,
          isLicensed: false,
          collectedAt: report.generatedAt,
          sourceApiVersion: '7.2-preview.3',
        },
        {
          provider: 'azure-devops',
          organization: 'contoso',
          displayName: '<script>alert("x")</script>',
          plan: 'secretProtection',
          resultType: 'estimated',
          userPrincipalName: 'private-upn@example.invalid',
          cuid: 'private-cuid',
          identityId: 'private-identity',
          isEstimated: true,
          isLicensed: false,
          collectedAt: report.generatedAt,
          sourceApiVersion: '7.2-preview.3',
        },
      ],
      gitHubCommitters: [
        {
          provider: 'github',
          repository: 'octocat/example',
          login: 'octocat',
          displayName: '=formula',
          userId: 'private-github-id',
          profileUrl: 'https://github.com/private-profile',
          commitCount: 2,
          lastCommitAt: report.generatedAt,
          collectedAt: report.generatedAt,
          sourceApiVersion: '2022-11-28',
        },
      ],
    };
    for (const output of [generateCsv(populated), generateStandaloneHtml(populated)]) {
      expect(output).toContain('contoso');
      expect(output).toContain('octocat/example');
      expect(output).toContain('Code Security, Secret Protection');
      expect(output).toMatch(/Billable committer|billableCommitter/);
      expect(output).toContain('Yes');
      expect(output).toContain('No');
      for (const secret of [
        'private-upn',
        'private-cuid',
        'private-identity',
        'private-github-id',
        'private-profile',
      ])
        expect(output).not.toContain(secret);
    }
    const html = generateStandaloneHtml(populated);
    expect(html).toContain('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;');
    expect(html.match(/&lt;script&gt;alert/g) ?? []).toHaveLength(1);
    expect(html).not.toMatch(/<script|<iframe|<link\b|\ssrc=/i);
    const csv = generateCsv({
      ...populated,
      sourceStatuses: [{ ...report.sourceStatuses![0]!, remediation: '=formula' }],
    });
    expect(csv).toContain("'=formula");
  });
});
