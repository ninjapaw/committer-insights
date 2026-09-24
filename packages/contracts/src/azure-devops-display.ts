import type { AzureDevOpsCommitter } from './azure-devops.js';

export type AzureDevOpsDisplayCommitter = Omit<AzureDevOpsCommitter, 'plan'> & {
  plan: string;
  billableCommitter: string;
};

export const azurePlanLabels: Record<AzureDevOpsCommitter['plan'], string> = {
  codeSecurity: 'Code Security',
  secretProtection: 'Secret Protection',
  all: 'All plans',
};

export function uniqueAzureDevOpsCommitters(
  committers: AzureDevOpsCommitter[],
): AzureDevOpsDisplayCommitter[] {
  const rows = new Map<
    string,
    AzureDevOpsCommitter & { plans: Set<AzureDevOpsCommitter['plan']> }
  >();
  for (const committer of committers) {
    const key = [
      committer.identityId ?? committer.cuid ?? '',
      committer.organization,
      committer.userPrincipalName ?? '',
      committer.displayName ?? '',
    ].join(':');
    const existing = rows.get(key);
    if (existing) {
      existing.plans.add(committer.plan);
      continue;
    }
    rows.set(key, { ...committer, plans: new Set([committer.plan]) });
  }
  return Array.from(rows.values()).map(({ plans, ...committer }) => ({
    ...committer,
    plan: Array.from(plans)
      .map((plan) => azurePlanLabels[plan])
      .join(', '),
    billableCommitter: committer.isEstimated ? 'Estimated' : 'Unknown',
  }));
}
