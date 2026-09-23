import type { Report } from '@ninjapaw/contracts';
import { toCsv } from './sanitize.js';

export function generateCsv(report: Report): string {
  if (report.provider === 'azure-devops') {
    return toCsv(
      report.azureDevOpsCommitters.map((committer) => ({ ...committer })),
      [
        'displayName',
        'userPrincipalName',
        'organization',
        'resultType',
        'plan',
        'cuid',
        'identityId',
        'collectedAt',
      ],
    );
  }
  if (report.provider === 'github') {
    return toCsv(
      report.gitHubCommitters.map((committer) => ({ ...committer })),
      [
        'login',
        'displayName',
        'repository',
        'commitCount',
        'lastCommitAt',
        'profileUrl',
        'collectedAt',
      ],
    );
  }
  return toCsv(
    [
      ...report.azureDevOpsCommitters.map((committer) => ({
        rowType: 'committer',
        provider: committer.provider,
        source: committer.organization,
        identity: committer.displayName,
        plan: committer.plan,
        count: 1,
        collectedAt: committer.collectedAt,
      })),
      ...report.gitHubCommitters.map((committer) => ({
        rowType: 'committer',
        provider: committer.provider,
        source: committer.repository,
        identity: committer.login,
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
        totalCommits: summary.totalCommits ?? 'Not applicable',
      })),
    ],
    [
      'provider',
      'source',
      'identity',
      'plan',
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
      'totalCommits',
      'apiVersion',
      'methodology',
      'scope',
    ],
  );
}
