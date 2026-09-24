import ExcelJS from 'exceljs';
import type { ExportFormat, Report } from '@ninjapaw/contracts';
import { uniqueAzureDevOpsCommitters } from './azure-devops-display.js';
import { sanitizeCellValue } from './sanitize.js';

export interface ExportWarning {
  message: string;
}

export interface ReportExportInput extends Omit<Report, 'reportId' | 'warnings'> {
  warnings: ExportWarning[];
}

function addTable(
  worksheet: ExcelJS.Worksheet,
  name: string,
  columns: { name: string; key: string }[],
  rows: Record<string, unknown>[],
): void {
  worksheet.columns = columns.map((c) => ({
    header: c.name,
    key: c.key,
    width: Math.min(Math.max(c.name.length + 4, 14), 40),
  }));
  worksheet.views = [{ state: 'frozen', ySplit: 1 }];
  for (const row of rows) {
    const sanitized: Record<string, unknown> = {};
    for (const column of columns) {
      sanitized[column.key] = sanitizeCellValue(row[column.key]);
    }
    worksheet.addRow(sanitized);
  }
  if (rows.length > 0) {
    worksheet.addTable({
      name,
      ref: 'A1',
      headerRow: true,
      style: { theme: 'TableStyleMedium2', showRowStripes: true },
      columns: columns.map((c) => ({ name: c.name, filterButton: true })),
      rows: rows.map((row) => columns.map((c) => sanitizeCellValue(row[c.key]))),
    });
  }
}

export async function generateReportWorkbook(input: ReportExportInput): Promise<ExcelJS.Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.created = new Date(input.generatedAt);
  workbook.calcProperties.fullCalcOnLoad = true;

  const summary = workbook.addWorksheet('Summary');
  summary.addRows([
    ['Report generated at (ISO 8601)', input.generatedAt],
    ['Provider', input.provider],
    ['Subject', sanitizeCellValue(input.subject)],
    ...(input.provider === 'azure-devops' ? [['Plans', input.plans.join(', ')]] : []),
    ['Source API version', input.sourceApiVersion],
    ['Committer identities', input.azureDevOpsCommitters.length + input.gitHubCommitters.length],
  ]);
  if (input.executiveSummary) {
    summary.addRows([
      ['Sources requested', input.executiveSummary.requestedSources],
      ['Sources included', input.executiveSummary.includedSources],
      ['Sources skipped', input.executiveSummary.skippedSources],
      ['Azure identity records', input.executiveSummary.azureIdentityRecords],
      ['GitHub identity records', input.executiveSummary.gitHubIdentityRecords],
      ['Unique provider identities', input.executiveSummary.uniqueProviderIdentities],
    ]);
  }
  summary.getColumn(1).width = 32;
  summary.getColumn(2).width = 48;

  if (input.providerSummaries) {
    addTable(
      workbook.addWorksheet('Provider Summary'),
      'ProviderSummary',
      [
        { name: 'Provider', key: 'displayName' },
        { name: 'Source type', key: 'sourceLabel' },
        { name: 'Measurement', key: 'measurement' },
        { name: 'Sources included', key: 'includedSources' },
        { name: 'Sources skipped', key: 'skippedSources' },
        { name: 'Identity records', key: 'identityRecords' },
        { name: 'Unique identities', key: 'uniqueIdentities' },
        { name: 'Repositories', key: 'totalRepositories' },
        { name: 'Commits', key: 'totalCommits' },
        { name: 'API version', key: 'apiVersion' },
        { name: 'Methodology', key: 'methodology' },
      ],
      input.providerSummaries.map((summary) => ({
        ...summary,
        totalRepositories: summary.totalRepositories ?? 'Not applicable',
        totalCommits: summary.totalCommits ?? 'Not applicable',
      })),
    );
  }

  if (input.provider !== 'github') {
    const ado = workbook.addWorksheet('Azure DevOps Committers');
    addTable(
      ado,
      'AzureDevOpsCommitters',
      [
        { name: 'Display name', key: 'displayName' },
        { name: 'User principal name', key: 'userPrincipalName' },
        { name: 'Organization', key: 'organization' },
        { name: 'Result type', key: 'resultType' },
        { name: 'Effective plans', key: 'plan' },
        { name: 'CUID', key: 'cuid' },
        { name: 'Identity ID', key: 'identityId' },
        { name: 'Collected at', key: 'collectedAt' },
      ],
      uniqueAzureDevOpsCommitters(input.azureDevOpsCommitters).map((c) => ({ ...c })),
    );
  }
  if (input.provider !== 'azure-devops') {
    const github = workbook.addWorksheet('GitHub Committers');
    addTable(
      github,
      'GitHubCommitters',
      [
        { name: 'Login', key: 'login' },
        { name: 'Display name', key: 'displayName' },
        { name: 'Repository', key: 'repository' },
        { name: 'Commit count', key: 'commitCount' },
        { name: 'Last commit at', key: 'lastCommitAt' },
        { name: 'Profile URL', key: 'profileUrl' },
        { name: 'Collected at', key: 'collectedAt' },
      ],
      input.gitHubCommitters.map((c) => ({ ...c })),
    );
  }

  if (input.sourceStatuses) {
    const sources = workbook.addWorksheet('Source Status');
    addTable(
      sources,
      'SourceStatus',
      [
        { name: 'Provider', key: 'provider' },
        { name: 'Source', key: 'subject' },
        { name: 'Status', key: 'status' },
        { name: 'Committer count', key: 'committerCount' },
        { name: 'Reason', key: 'reason' },
        { name: 'How to fix', key: 'remediation' },
        { name: 'Scope', key: 'scope' },
      ],
      input.sourceStatuses.map((status) => ({ ...status })),
    );
  }

  const params = workbook.addWorksheet('Report Parameters');
  params.addRows([
    ['Provider', input.provider],
    ['Subject', input.subject],
    ...(input.provider === 'azure-devops' ? [['Plans', input.plans.join(', ')]] : []),
    ['Source API version', input.sourceApiVersion],
    ['Generated at', input.generatedAt],
  ]);

  const warnings = workbook.addWorksheet('Warnings and Methodology');
  if (input.provider === 'azure-devops') {
    warnings.addRow(['This report uses an Azure DevOps preview API. Response fields can change.']);
    warnings.addRow([
      'Estimated values represent projected usage if Advanced Security were enabled and are distinct from currently licensed users.',
    ]);
  } else if (input.provider === 'github') {
    warnings.addRow([
      'GitHub counts include commits on the repository default branch in the selected window.',
    ]);
  }
  if (input.provider === 'combined') {
    warnings.addRow([
      'Cross-provider identities are not automatically merged. Unique totals deduplicate only within each provider.',
    ]);
  }
  for (const warning of input.warnings) {
    warnings.addRow([warning.message]);
  }

  return workbook.xlsx.writeBuffer();
}

export function safeExportFilename(
  subject: string,
  generatedAt: string,
  extension: ExportFormat,
): string {
  const safeSubject = subject.replace(/[^A-Za-z0-9-]/g, '_');
  const timestamp = generatedAt.replace(/[:.]/g, '-');
  return `active-committers-${safeSubject}-${timestamp}.${extension}`;
}
