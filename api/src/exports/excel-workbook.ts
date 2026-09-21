import ExcelJS from 'exceljs';
import type { AzureDevOpsCommitter, CombinedCommitter, GitHubCommitter } from '@ninjapaw/contracts';
import { sanitizeCellValue } from './sanitize.js';

export interface ExportWarning {
  message: string;
}

export interface ReportExportInput {
  organization: string;
  plans: string[];
  retention: string;
  sourceApiVersion: string;
  generatedAt: string;
  azureDevOpsCommitters: AzureDevOpsCommitter[];
  gitHubCommitters: GitHubCommitter[];
  combinedCommitters: CombinedCommitter[];
  warnings: ExportWarning[];
}

function addTable(
  worksheet: ExcelJS.Worksheet,
  name: string,
  columns: { name: string; key: string }[],
  rows: Record<string, unknown>[],
): void {
  worksheet.columns = columns.map((c) => ({ header: c.name, key: c.key, width: Math.min(Math.max(c.name.length + 4, 14), 40) }));
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
    ['Organization', sanitizeCellValue(input.organization)],
    ['Plans', input.plans.join(', ')],
    ['Retention', input.retention],
    ['Source API version', input.sourceApiVersion],
    ['Azure DevOps identities', input.azureDevOpsCommitters.length],
    ['GitHub identities', input.gitHubCommitters.length],
    ['Combined identities', input.combinedCommitters.length],
  ]);
  summary.getColumn(1).width = 32;
  summary.getColumn(2).width = 48;

  const ado = workbook.addWorksheet('Azure DevOps Committers');
  addTable(
    ado,
    'AzureDevOpsCommitters',
    [
      { name: 'Display name', key: 'displayName' },
      { name: 'User principal name', key: 'userPrincipalName' },
      { name: 'Organization', key: 'organization' },
      { name: 'Result type', key: 'resultType' },
      { name: 'Effective plan', key: 'plan' },
      { name: 'CUID', key: 'cuid' },
      { name: 'Identity ID', key: 'identityId' },
      { name: 'Collected at', key: 'collectedAt' },
    ],
    input.azureDevOpsCommitters.map((c) => ({ ...c })),
  );

  const gh = workbook.addWorksheet('GitHub Committers');
  addTable(
    gh,
    'GitHubCommitters',
    [
      { name: 'User login', key: 'userLogin' },
      { name: 'Organization', key: 'organization' },
      { name: 'Repository', key: 'repository' },
      { name: 'Organization/repository', key: 'organizationRepository' },
      { name: 'Last pushed date', key: 'lastPushedDate' },
      { name: 'Last pushed email', key: 'lastPushedEmail' },
    ],
    input.gitHubCommitters.map((c) => ({ ...c })),
  );

  const combined = workbook.addWorksheet('Combined Identities');
  addTable(
    combined,
    'CombinedIdentities',
    [
      { name: 'Display name', key: 'displayName' },
      { name: 'Primary email', key: 'primaryEmail' },
      { name: 'GitHub login', key: 'gitHubLogin' },
      { name: 'Azure DevOps UPN', key: 'azureDevOpsUserPrincipalName' },
      { name: 'Providers', key: 'providers' },
      { name: 'Organizations', key: 'organizations' },
      { name: 'Repository count', key: 'repositoryCount' },
      { name: 'Plans', key: 'plans' },
      { name: 'Match status', key: 'matchStatus' },
      { name: 'Match method', key: 'matchMethod' },
      { name: 'Review required', key: 'reviewRequired' },
    ],
    input.combinedCommitters.map((c) => ({
      ...c,
      providers: c.providers.join(', '),
      organizations: c.organizations.join(', '),
      plans: c.plans.join(', '),
      repositoryCount: c.repositories.length,
    })),
  );

  const review = workbook.addWorksheet('Identity Review');
  addTable(
    review,
    'IdentityReview',
    [
      { name: 'Display name', key: 'displayName' },
      { name: 'GitHub login', key: 'gitHubLogin' },
      { name: 'Match method', key: 'matchMethod' },
      { name: 'Match confidence', key: 'matchConfidence' },
    ],
    input.combinedCommitters
      .filter((c) => c.reviewRequired)
      .map((c) => ({ ...c })),
  );

  const params = workbook.addWorksheet('Report Parameters');
  params.addRows([
    ['Organization', input.organization],
    ['Plans', input.plans.join(', ')],
    ['Retention', input.retention],
    ['Source API version', input.sourceApiVersion],
    ['Generated at', input.generatedAt],
  ]);

  const warnings = workbook.addWorksheet('Warnings and Methodology');
  warnings.addRow(['This report uses an Azure DevOps preview API. Response fields can change.']);
  warnings.addRow(['Estimated values represent projected usage if Advanced Security were enabled and are distinct from currently licensed users.']);
  for (const warning of input.warnings) {
    warnings.addRow([warning.message]);
  }

  return workbook.xlsx.writeBuffer();
}

export function safeExportFilename(organization: string, generatedAt: string, extension: 'xlsx' | 'csv'): string {
  const safeOrg = organization.replace(/[^A-Za-z0-9-]/g, '_');
  const timestamp = generatedAt.replace(/[:.]/g, '-');
  return `active-committers-${safeOrg}-${timestamp}.${extension}`;
}
