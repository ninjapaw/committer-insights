import { z } from 'zod';
import {
  gitHubRepositorySchema,
  gitHubTargetSchema,
  reportingWindow,
  type MultiSource,
  type ReportInsights,
  type RepositoryInsight,
} from '@ninjapaw/contracts';
import { API_ORIGIN, request } from './http-client.js';

const setting = z.object({ status: z.enum(['enabled', 'disabled']).optional() }).nullish();
const repositorySchema = z.object({
  id: z.number().int().positive(),
  visibility: z.string().optional(),
  private: z.boolean(),
  archived: z.boolean().optional(),
  disabled: z.boolean().optional(),
  security_and_analysis: z
    .object({
      advanced_security: setting,
      code_security: setting,
      secret_scanning: setting,
      secret_scanning_push_protection: setting,
      dependabot_security_updates: setting,
    })
    .nullish(),
});
export const gitHubSecurityFeatures = {
  advanced_security: 'Advanced Security bundle',
  code_security: 'Code Security',
  secret_scanning: 'Secret scanning',
  secret_scanning_push_protection: 'Push protection',
  dependabot_security_updates: 'Dependabot security updates',
} as const;

export async function fetchGitHubRepositoryInsight(
  repository: string,
  source: string,
  days: number,
  token: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RepositoryInsight> {
  const name = gitHubRepositorySchema.parse(repository);
  const base: RepositoryInsight = {
    provider: 'github',
    source,
    id: name.toLowerCase(),
    name,
    visibility: 'unknown',
    state: 'unknown',
    features: Object.values(gitHubSecurityFeatures).map((name) => ({ name, state: 'unknown' })),
    observedAt: new Date().toISOString(),
    activity: { ...reportingWindow(days), status: 'unavailable', daily: [] },
  };
  const response = await request(new URL(`/repos/${name}`, API_ORIGIN), token, fetchImpl);
  const body = repositorySchema.parse(await response.json());
  return {
    ...base,
    visibility: body.visibility ?? (body.private ? 'private' : 'public'),
    state: body.disabled ? 'disabled' : body.archived ? 'archived' : 'active',
    features: Object.entries(gitHubSecurityFeatures).map(([key, name]) => ({
      name,
      state:
        body.security_and_analysis?.[key as keyof typeof gitHubSecurityFeatures]?.status ??
        'unknown',
    })),
  };
}

const billingSchema = z.object({
  usageItems: z.array(
    z.object({
      date: z.string().refine((date) => Number.isFinite(Date.parse(date))),
      product: z.string(),
      sku: z.string(),
      repositoryName: z.string().optional(),
      quantity: z.number().finite(),
      unitType: z.string(),
      grossAmount: z.number().finite(),
      discountAmount: z.number().finite(),
      netAmount: z.number().finite(),
    }),
  ),
});

export async function collectGitHubBilling(
  source: Extract<MultiSource, { provider: 'github' }>,
  token: string,
  insights: ReportInsights,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const check = { provider: 'github' as const, source: source.target, dataset: 'Billing usage' };
  if (!source.includeBilling) {
    insights.checks.push({
      ...check,
      status: 'not-requested',
      detail: 'Optional billing collection was not selected. Payment status is unknown.',
    });
    return;
  }
  if (source.targetType !== 'organization') {
    insights.checks.push({
      ...check,
      status: 'unavailable',
      detail:
        'Enterprise billing is not collected. Use the enterprise billing report; organization billing may omit enterprise-paid usage.',
    });
    return;
  }
  const target = gitHubTargetSchema.parse(source.target);
  const window = reportingWindow(source.sinceDays);
  const start = new Date(window.from);
  const end = new Date(window.to);
  const collected: ReportInsights['billing'] = [];
  try {
    for (
      const month = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
      month <= end;
      month.setUTCMonth(month.getUTCMonth() + 1)
    ) {
      const url = new URL(`/organizations/${target}/settings/billing/usage`, API_ORIGIN);
      url.searchParams.set('year', String(month.getUTCFullYear()));
      url.searchParams.set('month', String(month.getUTCMonth() + 1));
      const response = await request(url, token, fetchImpl);
      const body = billingSchema.parse(await response.json());
      for (const item of body.usageItems) {
        const date = new Date(item.date).toISOString().slice(0, 10);
        if (date < window.from.slice(0, 10) || date > window.to.slice(0, 10)) continue;
        collected.push({
          provider: 'github',
          source: target,
          date,
          product: item.product,
          sku: item.sku,
          repository: item.repositoryName,
          quantity: item.quantity,
          unit: item.unitType,
          grossUsd: item.grossAmount,
          discountUsd: item.discountAmount,
          netUsd: item.netAmount,
        });
      }
    }
    insights.billing.push(...collected);
    insights.checks.push({
      ...check,
      status: 'complete',
      detail: `Provider-reported USD usage for ${window.from.slice(0, 10)} through ${window.to.slice(0, 10)}. Not an invoice or proof of payment. Empty results do not prove a free plan; enterprise-paid usage may be absent.`,
    });
  } catch {
    insights.checks.push({
      ...check,
      status: 'unavailable',
      detail:
        'Billing API could not be read with this account, is unavailable, or returned an unsupported response. No extra permissions requested. Verify with the billing owner.',
    });
  }
}
