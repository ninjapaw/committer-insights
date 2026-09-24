import type { InsightTable } from './insights.js';
import { formatReportDateTime } from './date-display.js';

export type AzureBillingPlan = 'codeSecurity' | 'secretProtection';
export interface AzureBillingIdentity {
  cuid?: string;
  identityId?: string;
  displayName?: string;
  userPrincipalName?: string;
}
export interface AzureBillingDetail {
  vsid?: string;
  pusherId?: string;
  displayName?: string;
  committerEmail?: string;
  projectId?: string;
  projectName?: string;
  repoId?: string;
  repoName?: string;
  pushId?: number;
  pushedTime?: string;
  commitId?: string;
  commitTime?: string;
}
export interface AzureBillingSnapshot {
  organization: string;
  plan: AzureBillingPlan;
  requestedDate?: string;
  billingDate?: string;
  collectedAt: string;
  apiVersion: string;
  sourceUrl: string;
  detailsUrl?: string;
  status: 'complete' | 'partial' | 'unavailable';
  detailsStatus: 'complete' | 'partial' | 'unavailable' | 'not-requested';
  accountId?: string;
  azureSubscriptionId?: string;
  tenantId?: string;
  isPlanEnabled?: boolean;
  providerCount?: number;
  identities: AzureBillingIdentity[];
  details: AzureBillingDetail[];
  warnings: string[];
}

export const azureBillingNote =
  'Provider-reported daily billing snapshots, not invoices or Git activity estimates. Counts cover only the selected organizations. Subscription totals require complete same-date identity lists and verified subscription scope. Pusher identity and committer email are different evidence; unmatched details are not automatically counted. Current security settings do not establish historical enablement.';

export function azureBillingGroups(snapshots: AzureBillingSnapshot[]) {
  const groups = new Map<string, AzureBillingSnapshot[]>();
  for (const snapshot of snapshots) {
    const key = JSON.stringify([
      snapshot.tenantId ?? null,
      snapshot.azureSubscriptionId ?? null,
      snapshot.plan,
      snapshot.billingDate?.slice(0, 10) ?? null,
    ]);
    groups.set(key, [...(groups.get(key) ?? []), snapshot]);
  }
  return [...groups.values()].map((items) => {
    const first = items[0]!;
    const organizations = new Set(items.map((item) => item.organization.toLowerCase()));
    const complete =
      organizations.size === items.length &&
      items.every(
        (item) =>
          item.status === 'complete' &&
          item.tenantId &&
          item.azureSubscriptionId &&
          item.billingDate &&
          item.providerCount === item.identities.length &&
          item.identities.every((identity) => identity.cuid) &&
          new Set(item.identities.map((identity) => identity.cuid!.toLowerCase())).size ===
            item.identities.length,
      );
    return {
      tenantId: first.tenantId,
      subscriptionId: first.azureSubscriptionId,
      plan: first.plan,
      billingDate: first.billingDate,
      organizations: [...organizations],
      uniqueCount: complete
        ? new Set(
            items.flatMap((item) =>
              item.identities.map((identity) => identity.cuid!.toLowerCase()),
            ),
          ).size
        : undefined,
      status: complete
        ? 'Reconciled within selected organizations'
        : 'Incomplete or ambiguous scope; no combined count',
    };
  });
}

export function azureBillingTables(
  snapshots: AzureBillingSnapshot[],
  options: { readableDates?: boolean; timeZone?: string } = {},
): InsightTable[] {
  if (!snapshots.length) return [];
  const date = (value?: string) =>
    value
      ? options.readableDates
        ? formatReportDateTime(value, options.timeZone)
        : value
      : 'Unavailable';
  const product = (plan: AzureBillingPlan) =>
    plan === 'codeSecurity' ? 'Code Security' : 'Secret Protection';
  return [
    {
      title: 'Azure billing snapshots',
      columns: [
        'Provider',
        'Organization',
        'Product',
        'Billing date UTC',
        'Subscription',
        'Tenant',
        'Status',
        'Provider count',
        'Returned identities',
        'Plan enabled',
        'Details status',
        'Collected at',
        'API version',
        'Source URL',
        'Warnings',
      ],
      rows: snapshots.map((item) => [
        'azure-devops',
        item.organization,
        product(item.plan),
        item.billingDate?.slice(0, 10) ?? 'Unavailable',
        item.azureSubscriptionId ?? 'Unavailable',
        item.tenantId ?? 'Unavailable',
        item.status,
        item.providerCount ?? 'Unavailable',
        item.identities.length,
        item.isPlanEnabled === undefined ? 'Unknown' : item.isPlanEnabled ? 'Yes' : 'No',
        item.detailsStatus,
        date(item.collectedAt),
        item.apiVersion,
        item.sourceUrl,
        item.warnings.join('; '),
      ]),
    },
    {
      title: 'Azure billing reconciliation',
      columns: [
        'Provider',
        'Subscription',
        'Tenant',
        'Product',
        'Billing date UTC',
        'Selected organizations',
        'Unique billable identities',
        'Coverage',
      ],
      rows: azureBillingGroups(snapshots).map((group) => [
        'azure-devops',
        group.subscriptionId ?? 'Unavailable',
        group.tenantId ?? 'Unavailable',
        product(group.plan),
        group.billingDate?.slice(0, 10) ?? 'Unavailable',
        group.organizations.join(', '),
        group.uniqueCount ?? 'Unavailable',
        `${group.status}. Selected scope only, not a subscription-wide invoice total.`,
      ]),
    },
    {
      title: 'Azure billed identities',
      columns: [
        'Provider',
        'Organization',
        'Product',
        'Billing date UTC',
        'CUID',
        'Identity ID',
        'Display name',
        'User principal name',
        'Evidence',
      ],
      rows: snapshots.flatMap((item) =>
        item.identities.map((identity) => [
          'azure-devops',
          item.organization,
          product(item.plan),
          item.billingDate?.slice(0, 10) ?? 'Unavailable',
          identity.cuid ?? 'Unresolved',
          identity.identityId ?? 'Unresolved',
          identity.displayName ?? '',
          identity.userPrincipalName ?? '',
          'Identity returned in provider billing snapshot; not an estimate or assigned-license inventory',
        ]),
      ),
    },
    {
      title: 'Azure billing diagnostic details',
      columns: [
        'Provider',
        'Organization',
        'Product',
        'Billing date UTC',
        'VSID',
        'Snapshot CUID match',
        'Project',
        'Repository',
        'Push ID',
        'Pushed at',
        'Commit ID',
        'Commit time',
        'Pusher ID',
        'Pusher display name',
        'Committer email',
        'Source URL',
      ],
      rows: snapshots.flatMap((item) =>
        item.details.map((detail) => {
          const matches = detail.vsid
            ? item.identities.filter(
                (identity) => identity.identityId?.toLowerCase() === detail.vsid!.toLowerCase(),
              )
            : [];
          return [
            'azure-devops',
            item.organization,
            product(item.plan),
            item.billingDate?.slice(0, 10) ?? 'Unavailable',
            detail.vsid ?? 'Unresolved',
            matches.length === 1 && matches[0]!.cuid
              ? matches[0]!.cuid!
              : 'Unmatched or ambiguous; not added to totals',
            detail.projectName ?? detail.projectId ?? '',
            detail.repoName ?? detail.repoId ?? '',
            detail.pushId ?? 'Unavailable',
            date(detail.pushedTime),
            detail.commitId ?? '',
            date(detail.commitTime),
            detail.pusherId ?? '',
            detail.displayName ?? '',
            detail.committerEmail ?? '',
            item.detailsUrl ?? '',
          ];
        }),
      ),
    },
  ];
}
