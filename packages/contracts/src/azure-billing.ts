import type { InsightTable, RepositoryInsight } from './insights.js';
import { formatReportDateTime } from './date-display.js';

export type AzureBillingPlan = 'codeSecurity' | 'secretProtection';
export interface AzureAdoptionEstimate {
  organization: string;
  plan: AzureBillingPlan;
  collectedAt: string;
  sourceUrl: string;
  apiVersion: string;
  status: 'complete' | 'partial' | 'unavailable';
  providerCount?: number;
  returnedIdentities: number;
  warnings: string[];
}
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

export const azureSecurityPrices = { codeSecurity: 30, secretProtection: 19 } as const;
export const azureEstimateSummaryNote =
  "Estimated cost if enabled = Microsoft's product-specific estimated committer count x the monthly unit price. Billing history is not required. Code Security: USD 30; Secret Protection: USD 19. These are list-price scenarios, not invoices, guarantees or additional-seat counts. Missing billing never means free; missing estimates are not replaced with Git commit totals.";
export const azureAdoptionNote =
  'Enablement scenarios use the provider estimate count, including when names are incomplete, at USD 30 for Code Security and USD 19 for Secret Protection per committer/month (list prices checked 2026-09-24). They are not actual charges or guaranteed incremental seats. Do not add an estimate to a billing snapshot or sum organizations sharing a subscription. Annualized means 12 unchanged months, not a forecast. No taxes, discounts, proration, legacy-bundle pricing or other Azure DevOps services are included. Unknown or disabled enablement does not establish invoice/payment status.';

export function azureAdoptionTables(
  estimates: AzureAdoptionEstimate[],
  snapshots: AzureBillingSnapshot[] = [],
  repositories: RepositoryInsight[] = [],
): InsightTable[] {
  if (!estimates.length) return [];
  const priceSource =
    'https://azure.microsoft.com/en-us/pricing/details/devops/azure-devops-services/';
  const money = (count: number | undefined, price: number) =>
    count === undefined ? 'Unavailable' : `$${(count * price).toFixed(2)}`;
  const tables: InsightTable[] = [
    {
      title: 'Azure billing and enablement scenarios',
      columns: [
        'Provider',
        'Organization',
        'Product',
        'Product state (observed scope)',
        'Monthly calculation',
        'Estimate basis',
        'Visible repository enablement',
        'Billing snapshot date UTC',
        'Snapshot plan enabled',
        'Snapshot billable count',
        'Provider enablement estimate count',
        'Unit price USD per month',
        'Enablement scenario monthly USD',
        'Enablement scenario annualized USD',
        'Estimate detail status',
        'Snapshot count monthly equivalent USD (not invoice)',
        'Actual invoiced charges',
        'Assessment',
      ],
      rows: estimates.map((estimate) => {
        const product = estimate.plan === 'codeSecurity' ? 'Code Security' : 'Secret Protection';
        const matches = snapshots.filter(
          (snapshot) =>
            snapshot.organization.toLowerCase() === estimate.organization.toLowerCase() &&
            snapshot.plan === estimate.plan,
        );
        const snapshot = matches.length === 1 ? matches[0] : undefined;
        const scoped = repositories.filter(
          (repository) =>
            repository.provider === 'azure-devops' &&
            repository.source.toLowerCase() === estimate.organization.toLowerCase(),
        );
        const states = scoped.map(
          (repository) =>
            repository.features.find((feature) => feature.name === product)?.state ?? 'unknown',
        );
        const enabled = states.filter((state) => state === 'enabled').length;
        const disabled = states.filter((state) => state === 'disabled').length;
        const unknown = states.length - enabled - disabled;
        const count = estimate.status === 'unavailable' ? undefined : estimate.providerCount;
        const stateLabel =
          !states.length || unknown === states.length
            ? 'Unknown'
            : unknown > 0
              ? 'Incomplete settings coverage'
              : disabled === states.length
                ? 'Off in visible repositories'
                : enabled === states.length
                  ? 'On in visible repositories'
                  : 'Mixed in visible repositories';
        const basis =
          count === undefined
            ? 'Estimate unavailable'
            : estimate.status === 'complete'
              ? 'Provider count; identity detail reconciled'
              : 'Provider count; identity detail incomplete';
        const billed = snapshot?.status === 'unavailable' ? undefined : snapshot?.providerCount;
        const status = snapshot?.status === 'unavailable' ? undefined : snapshot?.isPlanEnabled;
        let assessment =
          count === undefined
            ? 'Enablement estimate unavailable; no cost inferred from Git activity.'
            : 'Provider enablement estimate priced as a standalone product scenario; not an invoice.';
        if (count !== undefined && states.length > 0 && disabled === states.length)
          assessment +=
            ' Product off in all observed repositories; the provider enablement estimate remains usable without billing history. Visibility does not prove organization-wide coverage.';
        if (status === false && billed === 0)
          assessment +=
            ' Product disabled and zero billable committers in the dated snapshot; estimate shows potential enablement usage.';
        else if (status === true)
          assessment +=
            ' Product enabled in the dated snapshot; estimate is not added to existing billed usage.';
        else
          assessment +=
            ' Billing/enablement is unknown or inconsistent; no zero-charge conclusion.';
        if (!matches.length)
          assessment += ' Select billing snapshots to compare provider-reported usage.';
        if (snapshot?.requestedDate)
          assessment += ' Historical billing date selected; not evidence of current charges.';
        if (snapshot?.status === 'partial')
          assessment += ' Billing snapshot is partial; inspect its warnings.';
        return [
          'azure-devops',
          estimate.organization,
          product,
          stateLabel,
          count === undefined
            ? 'Unavailable'
            : `${count} x $${azureSecurityPrices[estimate.plan].toFixed(2)}/month`,
          basis,
          states.length
            ? `${enabled} enabled; ${disabled} disabled; ${unknown} unknown (visible repositories only)`
            : 'Unknown: no repository settings collected',
          snapshot?.billingDate?.slice(0, 10) ?? 'Unavailable',
          status === undefined ? 'Unknown' : status ? 'Yes' : 'No',
          billed ?? 'Unavailable',
          count ?? 'Unavailable',
          azureSecurityPrices[estimate.plan],
          money(count, azureSecurityPrices[estimate.plan]),
          money(count, azureSecurityPrices[estimate.plan] * 12),
          estimate.status,
          money(billed, azureSecurityPrices[estimate.plan]),
          'Not collected; reconcile with the billing owner',
          assessment,
        ];
      }),
    },
    {
      title: 'Azure billing estimate provenance',
      columns: [
        'Provider',
        'Organization',
        'Product',
        'Provider estimate count',
        'Returned identity rows',
        'Status',
        'Collected at UTC',
        'API version',
        'Estimate source URL',
        'Price source URL',
        'Warnings',
      ],
      rows: estimates.map((estimate) => [
        'azure-devops',
        estimate.organization,
        estimate.plan,
        estimate.providerCount ?? 'Unavailable',
        estimate.returnedIdentities,
        estimate.status,
        estimate.collectedAt,
        estimate.apiVersion,
        estimate.sourceUrl,
        priceSource,
        estimate.warnings.join('; '),
      ]),
    },
  ];
  const scenario = tables[0]!;
  const columns = [
    'Provider',
    'Organization',
    'Product',
    'Provider enablement estimate count',
    'Monthly calculation',
    'Enablement scenario monthly USD',
    'Enablement scenario annualized USD',
    'Estimate basis',
  ];
  return [
    {
      ...scenario,
      columns,
      rows: scenario.rows.map((row) =>
        columns.map((column) => row[scenario.columns.indexOf(column)]!),
      ),
    },
    { ...scenario, title: 'Azure billing enablement evidence' },
    tables[1]!,
  ];
}

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
