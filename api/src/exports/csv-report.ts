import {
  getGitHubContributions,
  insightTables,
  solutionPricingNote,
  solutionPricingRows,
  providerReport,
  buildCioBrief,
  cioBriefTables,
  uniqueAzureDevOpsCommitters,
  type Report,
} from '@ninjapaw/contracts';
import { toCsv } from './sanitize.js';

export function generateCsv(report: Report): string {
  const tables = [
    ...(report.insights ? insightTables(report.insights) : []),
    ...(['azure-devops', 'github'] as const).flatMap((provider) =>
      cioBriefTables(buildCioBrief(report, provider)),
    ),
  ];
  const columnKey = (label: string) =>
    label.toLowerCase().replace(/\s+(\w)/g, (_, letter: string) => letter.toUpperCase());
  return toCsv(
    [
      {
        rowType: 'report-metadata',
        provider: report.provider,
        source: report.subject,
        collectedAt: report.generatedAt,
        basis:
          'Planning report, not an invoice. Filter by rowType before summing: summary and contribution counts overlap. Estimated is potential usage; Unknown is not confirmed non-billable. All rows are exported regardless of screen filters.',
      },
      ...(['azure-devops', 'github'] as const).flatMap((provider) =>
        Object.entries(providerReport(report, provider).executiveSummary!).map(
          ([label, count]) => ({
            rowType: 'executive-summary',
            provider,
            label,
            count,
          }),
        ),
      ),
      ...uniqueAzureDevOpsCommitters(report.azureDevOpsCommitters).map((committer) => ({
        rowType: 'committer-summary',
        provider: committer.provider,
        source: committer.organization,
        identity: committer.displayName,
        plan: committer.plan,
        billableCommitter: committer.billableCommitter,
        count: 1,
        countUnit: 'identity',
        collectedAt: committer.collectedAt,
      })),
      ...report.gitHubCommitters.map((committer) => ({
        rowType: 'committer-summary',
        provider: committer.provider,
        source: '',
        identity: committer.login,
        displayName: committer.displayName,
        totalRepositories: getGitHubContributions(committer).length || 'Unavailable',
        billableCommitter: 'Unknown',
        count: committer.commitCount,
        countUnit: 'commits',
        lastActivity: committer.lastCommitAt,
        collectedAt: committer.collectedAt,
      })),
      ...report.gitHubCommitters.flatMap((committer) =>
        getGitHubContributions(committer).map((item) => ({
          rowType: 'repository-contribution',
          provider: 'github',
          identity: committer.login,
          source: item.repository,
          count: item.commitCount,
          countUnit: 'commits',
          lastActivity: item.lastCommitAt,
          billableCommitter: 'Unknown',
        })),
      ),
      ...(report.sourceStatuses ?? []).map((source) => ({
        rowType: 'source-status',
        provider: source.provider,
        source: source.subject,
        status: source.status,
        count: source.committerCount,
        countUnit: 'returned identity rows',
        reason: source.reason,
        remediation: source.remediation,
        scope: source.scope,
      })),
      ...(report.providerSummaries ?? []).map((summary) => ({
        ...summary,
        rowType: 'provider-summary',
        totalRepositories: summary.totalRepositories ?? 'Not applicable',
        totalCommits: summary.totalCommits ?? 'Not applicable',
      })),
      ...(report.costEstimates ?? []).map((estimate) => ({
        ...estimate,
        source: '',
        priceSource: estimate.source,
        rowType: 'cost-estimate',
      })),
      ...solutionPricingRows(report.costEstimates).map((row) => ({
        rowType: 'solution-pricing-total',
        provider: row.provider,
        label: row.solution,
        estimatedQuantity: row.quantity,
        estimatedMonthlyCostUsd: row.monthlyUsd,
        annualizedCostUsd: row.annualizedUsd,
        basis: solutionPricingNote,
      })),
      ...report.warnings.map((warning) => ({ rowType: 'warning', reason: warning })),
      ...tables.flatMap((table) =>
        table.rows.map((row) => ({
          rowType: table.title.toLowerCase().replaceAll(' ', '-'),
          ...Object.fromEntries(
            table.columns.map((column, index) => [columnKey(column), row[index]]),
          ),
        })),
      ),
    ],
    [
      ...new Set([
        'provider',
        'source',
        'identity',
        'displayName',
        'plan',
        'billableCommitter',
        'count',
        'countUnit',
        'lastActivity',
        'collectedAt',
        'status',
        'reason',
        'remediation',
        'rowType',
        'measurement',
        'includedSources',
        'skippedSources',
        'identityRecords',
        'uniqueIdentities',
        'totalRepositories',
        'totalCommits',
        'apiVersion',
        'methodology',
        'scope',
        'label',
        'unitPriceUsd',
        'estimatedMonthlyCostUsd',
        'estimatedQuantity',
        'annualizedCostUsd',
        'basis',
        'priceSource',
        ...tables.flatMap((table) => table.columns.map(columnKey)),
      ]),
    ],
  );
}
