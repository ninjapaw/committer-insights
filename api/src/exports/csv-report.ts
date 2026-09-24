import type { Report } from '@ninjapaw/contracts';
import { uniqueAzureDevOpsCommitters } from './azure-devops-display.js';
import { toCsv } from './sanitize.js';

export function generateCsv(report: Report): string {
  if (report.provider === 'azure-devops') {
    return toCsv(
      uniqueAzureDevOpsCommitters(report.azureDevOpsCommitters).map((committer) => ({
        ...committer,
      })),
      [
        'displayName',
        'userPrincipalName',
        'organization',
        'resultType',
        'plan',
        'billableCommitter',
        'cuid',
        'identityId',
        'collectedAt',
      ],
    );
  }
  if (report.provider === 'github') {
    return toCsv(
      report.gitHubCommitters.map((committer) => ({ ...committer, billableCommitter: 'No' })),
      [
        'login',
        'displayName',
        'repository',
        'billableCommitter',
        'commitCount',
        'lastCommitAt',
        'profileUrl',
        'collectedAt',
      ],
    );
  }
  return toCsv(
    [
      ...uniqueAzureDevOpsCommitters(report.azureDevOpsCommitters).map((committer) => ({
        rowType: 'committer',
        provider: committer.provider,
        source: committer.organization,
        identity: committer.displayName,
        plan: committer.plan,
        billableCommitter: committer.billableCommitter,
        count: 1,
        collectedAt: committer.collectedAt,
      })),
      ...report.gitHubCommitters.map((committer) => ({
        rowType: 'committer',
        provider: committer.provider,
        source: committer.repository,
        identity: committer.login,
        billableCommitter: 'No',
        count: committer.commitCount,
        lastActivity: committer.lastCommitAt,
        collectedAt: committer.collectedAt,
      })),
      ...(report.sourceStatuses ?? []).map((source) => ({
        rowType: 'source-status',
        provider: source.provider,
        source: source.subject,
        status: source.status,
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
        rowType: 'cost-estimate',
      })),
    ],
    [
      'provider',
      'source',
      'identity',
      'plan',
      'billableCommitter',
      'count',
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
      'basis',
      'source',
    ],
  );
}
