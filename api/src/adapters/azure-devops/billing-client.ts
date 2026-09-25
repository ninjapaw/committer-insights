import { z } from 'zod';
import {
  azureDevOpsOrganizationSchema,
  type AzureBillingSnapshot,
  type AzureBillingPlan,
  type MultiSource,
  type ReportInsights,
} from '@ninjapaw/contracts';

const apiVersion = '7.2-preview.3';
const text = z
  .string()
  .max(4096)
  .nullish()
  .transform((value) => value || undefined);
const guid = z
  .string()
  .uuid()
  .nullish()
  .transform((value) => value || undefined);
const timestamp = z
  .string()
  .datetime({ offset: true })
  .nullish()
  .transform((value) => value || undefined);
const identitySchema = z.object({
  cuid: text,
  userIdentity: z.object({ id: text, displayName: text, uniqueName: text }).nullish(),
});
const snapshotSchema = z.object({
  accountId: guid,
  azureSubscriptionId: guid,
  tenantId: guid,
  billingDate: timestamp,
  isPlanEnabled: z.boolean().optional(),
  billedUsers: z
    .object({
      uniqueCommitterCount: z.number().int().nonnegative().optional(),
      billedUsers: z.array(identitySchema).max(100000).optional(),
    })
    .optional(),
});
const detailSchema = z.object({
  vsid: text,
  pusherId: text,
  displayName: text,
  committerEmail: text,
  projectId: text,
  projectName: text,
  repoId: text,
  repoName: text,
  pushId: z.number().int().nonnegative().optional(),
  pushedTime: timestamp,
  commitId: text,
  commitTime: timestamp,
});
const detailsSchema = z.union([
  z.array(detailSchema).max(100000),
  z
    .object({
      value: z.array(detailSchema).max(100000),
      count: z.number().int().nonnegative().optional(),
    })
    .refine((result) => result.count === undefined || result.count === result.value.length)
    .transform((result) => result.value),
]);

export function azureBillingUrl(
  organization: string,
  plan: AzureBillingPlan,
  action: 'Last' | 'Default' | 'Details',
  billingDate?: string,
): URL {
  const source = azureDevOpsOrganizationSchema.parse(organization);
  const url = new URL(
    `https://advsec.dev.azure.com/${source}/_apis/Management/MeterUsage/${action}`,
  );
  url.searchParams.set('api-version', apiVersion);
  url.searchParams.set('plan', plan);
  if (billingDate) url.searchParams.set('billingDate', billingDate);
  return url;
}

class BillingReadError extends Error {}

function billingFailure(error: unknown): string {
  if (error instanceof BillingReadError) return error.message;
  if (error instanceof z.ZodError || error instanceof SyntaxError)
    return 'Unsupported provider response format. The preview API schema may differ; billing could not be interpreted.';
  if (error instanceof Error && ['AbortError', 'TimeoutError'].includes(error.name))
    return 'Billing request timed out. Retry collection; no billing count was inferred.';
  return 'Network or authentication failure prevented billing collection. Retry sign-in and verify connectivity.';
}

async function read(
  url: URL,
  accessToken: () => Promise<string>,
  fetchImpl: typeof fetch,
): Promise<unknown> {
  const response = await fetchImpl(url, {
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(20000),
    headers: { Authorization: `Bearer ${await accessToken()}`, Accept: 'application/json' },
  });
  if (!response.ok) {
    await response.body?.cancel();
    const reasons: Record<number, string> = {
      401: 'Authentication rejected (HTTP 401). Sign in again with the intended account.',
      403: 'Billing access denied (HTTP 403). Confirm existing billing permissions with the organization owner.',
      404: 'Billing snapshot or endpoint not found (HTTP 404). This can reflect access or product/snapshot availability, not zero charges.',
      429: 'Provider rate limit reached (HTTP 429). Retry later.',
    };
    throw new BillingReadError(
      reasons[response.status] ??
        `Billing provider returned HTTP ${response.status}. No billing count was inferred.`,
    );
  }
  if (response.headers.get('x-ms-continuationtoken')) {
    await response.body?.cancel();
    throw new BillingReadError(
      'Provider returned a truncated billing response. Incomplete counts were not accepted.',
    );
  }
  if (!response.body)
    throw new BillingReadError(
      'Provider returned no billing response body. This is not a confirmed zero count.',
    );
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const result = await reader.read();
      if (result.done) break;
      size += result.value.byteLength;
      if (size > 16 * 1024 * 1024)
        throw new BillingReadError(
          'Billing response exceeds the supported size limit. Incomplete counts were not accepted.',
        );
      chunks.push(result.value);
    }
  } finally {
    await reader.cancel();
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export async function collectAzureBilling(
  source: Extract<MultiSource, { provider: 'azure-devops' }>,
  insights: ReportInsights,
  accessToken: () => Promise<string>,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  if (!source.includeAzureBilling) return;
  const organization = azureDevOpsOrganizationSchema.parse(source.organization);
  const plans: AzureBillingPlan[] = source.plans.includes('all')
    ? ['codeSecurity', 'secretProtection']
    : ([...new Set(source.plans)] as AzureBillingPlan[]);
  for (const plan of plans) {
    const url = azureBillingUrl(
      organization,
      plan,
      source.billingDate ? 'Default' : 'Last',
      source.billingDate ? `${source.billingDate}T00:00:00Z` : undefined,
    );
    const snapshot: AzureBillingSnapshot = {
      organization,
      plan,
      requestedDate: source.billingDate,
      collectedAt: new Date().toISOString(),
      apiVersion,
      sourceUrl: url.href,
      status: 'unavailable',
      detailsStatus: source.includeAzureBillingDetails ? 'unavailable' : 'not-requested',
      identities: [],
      details: [],
      warnings: [],
    };
    (insights.azureBilling ??= []).push(snapshot);
    try {
      const raw = snapshotSchema.parse(await read(url, accessToken, fetchImpl));
      Object.assign(snapshot, {
        accountId: raw.accountId,
        azureSubscriptionId: raw.azureSubscriptionId,
        tenantId: raw.tenantId,
        billingDate: raw.billingDate,
        isPlanEnabled: raw.isPlanEnabled,
        providerCount: raw.billedUsers?.uniqueCommitterCount,
        identities: (raw.billedUsers?.billedUsers ?? []).map((identity) => ({
          cuid: identity.cuid,
          identityId: identity.userIdentity?.id,
          displayName: identity.userIdentity?.displayName,
          userPrincipalName: identity.userIdentity?.uniqueName,
        })),
      });
      if (
        !raw.billingDate ||
        Date.parse(raw.billingDate) > Date.now() ||
        (source.billingDate && raw.billingDate.slice(0, 10) !== source.billingDate)
      ) {
        snapshot.warnings.push(
          'The provider did not return a valid matching billing date. No cross-organization reconciliation is available.',
        );
      }
      if (!raw.azureSubscriptionId || !raw.tenantId || !raw.accountId)
        snapshot.warnings.push('Provider subscription, tenant or account scope is incomplete.');
      if (raw.isPlanEnabled === undefined)
        snapshot.warnings.push('Product enablement for this snapshot is unknown.');
      if (
        snapshot.providerCount === undefined ||
        !raw.billedUsers?.billedUsers ||
        snapshot.providerCount !== snapshot.identities.length
      ) {
        snapshot.warnings.push(
          'Provider count and returned identity details are missing or inconsistent; the provider count is retained, not replaced by zero.',
        );
      }
      const cuids = snapshot.identities.map((identity) => identity.cuid?.toLowerCase());
      if (cuids.some((cuid) => !cuid) || new Set(cuids).size !== cuids.length)
        snapshot.warnings.push(
          'Missing or duplicate CUIDs prevent reliable subscription-level deduplication.',
        );
      snapshot.status = snapshot.warnings.length ? 'partial' : 'complete';
      if (
        source.includeAzureBillingDetails &&
        raw.billingDate &&
        Date.parse(raw.billingDate) <= Date.now() &&
        (!source.billingDate || raw.billingDate.slice(0, 10) === source.billingDate)
      ) {
        const detailsUrl = azureBillingUrl(organization, plan, 'Details', raw.billingDate);
        snapshot.detailsUrl = detailsUrl.href;
        try {
          snapshot.details = detailsSchema.parse(await read(detailsUrl, accessToken, fetchImpl));
          snapshot.detailsStatus = 'complete';
          if (
            (snapshot.providerCount !== undefined &&
              snapshot.providerCount > 0 &&
              !snapshot.details.length) ||
            snapshot.details.some(
              (detail) =>
                !detail.repoId || !detail.pushId || !detail.pushedTime || !detail.commitId,
            )
          ) {
            snapshot.detailsStatus = 'partial';
            snapshot.warnings.push(
              'Diagnostic evidence is incomplete; a missing detail row does not negate a provider billing identity.',
            );
          }
        } catch (error) {
          snapshot.detailsStatus = 'unavailable';
          snapshot.warnings.push(
            `Diagnostic details unavailable: ${billingFailure(error)} The billing snapshot remains separate. No permissions were changed.`,
          );
        }
      }
    } catch (error) {
      snapshot.warnings.push(
        `Provider billing snapshot unavailable: ${billingFailure(error)} No estimate was substituted.`,
      );
    }
    insights.checks.push({
      provider: 'azure-devops',
      source: organization,
      dataset: `Provider billing snapshot: ${plan}`,
      status: snapshot.status,
      detail:
        snapshot.warnings.join(' ') ||
        `Provider-reported billing snapshot dated ${snapshot.billingDate}. Not an invoice; selected scope only.`,
    });
    if (source.includeAzureBillingDetails)
      insights.checks.push({
        provider: 'azure-devops',
        source: organization,
        dataset: `Billing diagnostic details: ${plan}`,
        status: snapshot.detailsStatus,
        detail: snapshot.detailsUrl
          ? snapshot.detailsStatus === 'complete'
            ? 'Details requested for the snapshot billing date. Pusher and committer identities remain separate; unmatched evidence is never added to billing totals.'
            : snapshot.warnings.join(' ')
          : 'Diagnostic request not attempted because no valid matching billing snapshot date was available. Resolve the snapshot failure first.',
      });
  }
}
