import { z } from 'zod';

export const gitHubAccountLoginSchema = z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,99}$/);
export const gitHubSignInSchema = z.object({ login: gitHubAccountLoginSchema.optional() }).strict();
export interface GitHubCliAccount {
  login: string;
  active: boolean;
  available: boolean;
}

export type GitHubSignInState = {
  id: string;
  status: 'pending' | 'authenticated' | 'canceled' | 'expired' | 'failed';
  challenge?: { userCode: string; verificationUri: string };
  message?: string;
};

export type DeviceSignInState = {
  id: string;
  status: 'pending' | 'authenticated' | 'canceled' | 'expired' | 'failed';
  account?: { username: string; tenantId: string };
  challenge?: { userCode: string; verificationUri: string; expiresOnTimestamp: number };
  message?: string;
};

export * from './azure-devops.js';
export * from './azure-devops-display.js';
export * from './azure-billing.js';
export * from './azure-service-pricing.js';
export * from './github.js';
export * from './github-billing.js';
export * from './insights.js';
export * from './provider-report.js';
export * from './report-overview.js';
export * from './cio-brief.js';
export * from './date-display.js';
import type { ReportInsights } from './insights.js';
import { azureServiceScenarioSchema } from './azure-service-pricing.js';
import {
  azureDevOpsOrganizationSchema,
  azureDevOpsPlanSchema,
  type AzureDevOpsCommitter,
} from './azure-devops.js';
import { gitHubTargetSchema, gitHubTargetTypeSchema, type GitHubCommitter } from './github.js';

export const multiSourceSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('azure-devops'),
    organization: azureDevOpsOrganizationSchema,
    plans: z.array(azureDevOpsPlanSchema).min(1).default(['all']),
    sinceDays: z.number().int().min(1).max(365).optional(),
    includeAzureBilling: z.boolean().optional(),
    includeAzureBillingDetails: z.boolean().optional(),
    serviceScenario: azureServiceScenarioSchema.optional(),
    billingDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .refine((value) => {
        const date = new Date(`${value}T00:00:00Z`);
        return (
          Number.isFinite(date.getTime()) &&
          date.toISOString().slice(0, 10) === value &&
          date.getTime() <= Date.now()
        );
      }, 'Enter a valid UTC billing date, not in the future.')
      .optional(),
  }),
  z.object({
    provider: z.literal('github'),
    targetType: gitHubTargetTypeSchema,
    target: gitHubTargetSchema,
    sinceDays: z.number().int().min(1).max(365).default(90),
    includeBilling: z.boolean().optional(),
  }),
]);
export type MultiSource = z.infer<typeof multiSourceSchema>;

export const multiSourceReportRequestSchema = z.object({
  sources: z.array(multiSourceSchema).min(1).max(100),
});

export const sourceStatusSchema = z.object({
  provider: z.enum(['azure-devops', 'github']),
  subject: z.string(),
  scope: z.string().optional(),
  status: z.enum(['included', 'skipped']),
  committerCount: z.number().int().nonnegative().default(0),
  reason: z.string().optional(),
  remediation: z.string().optional(),
});
export type SourceStatus = z.infer<typeof sourceStatusSchema>;

export interface ExecutiveSummary {
  requestedSources: number;
  includedSources: number;
  skippedSources: number;
  azureIdentityRecords: number;
  gitHubIdentityRecords: number;
  uniqueProviderIdentities: number;
}

export interface ProviderSummary {
  provider: MultiSource['provider'];
  displayName: string;
  sourceLabel: string;
  measurement: string;
  apiVersion: string;
  methodology: string;
  includedSources: number;
  skippedSources: number;
  identityRecords: number;
  uniqueIdentities: number;
  totalRepositories?: number;
  totalCommits?: number;
}

export interface CostEstimateLineItem {
  provider: MultiSource['provider'];
  solution?: 'codeSecurity' | 'secretProtection' | 'enterprise';
  label: string;
  count: number;
  unitPriceUsd: number;
  estimatedMonthlyCostUsd: number;
  basis: string;
  source: string;
}

export const solutionPricingNote =
  'Totals cover the full collected scope, not screen filters. Counts are product-specific estimates, not confirmed licensed seats. GHAS subtotals combine Code Security and Secret Protection costs; do not add subtotals to their component rows. Annualized estimates are monthly estimates x 12, not annual contract quotes. Other plans without usage evidence remain unpriced.';

export function solutionPricingRows(estimates: CostEstimateLineItem[] = []) {
  const rows = estimates.map((item) => ({
    provider: item.provider === 'github' ? 'GitHub' : 'Azure DevOps',
    solution: item.label,
    quantity: String(item.count),
    monthlyUsd: item.estimatedMonthlyCostUsd,
    annualizedUsd: item.estimatedMonthlyCostUsd * 12,
  }));
  const securityTotals: typeof rows = [];
  for (const provider of ['azure-devops', 'github'] as const) {
    const code = estimates.filter(
      (item) => item.provider === provider && item.solution === 'codeSecurity',
    );
    const secret = estimates.filter(
      (item) => item.provider === provider && item.solution === 'secretProtection',
    );
    if (code.length !== 1 || secret.length !== 1) continue;
    const monthlyUsd = code[0]!.estimatedMonthlyCostUsd + secret[0]!.estimatedMonthlyCostUsd;
    securityTotals.push({
      provider: provider === 'github' ? 'GitHub' : 'Azure DevOps',
      solution: 'GHAS subtotal: Code Security + Secret Protection',
      quantity: `${code[0]!.count} Code Security; ${secret[0]!.count} Secret Protection`,
      monthlyUsd,
      annualizedUsd: monthlyUsd * 12,
    });
  }
  rows.push(...securityTotals);
  return rows;
}

export interface Report {
  reportId: string;
  provider: 'azure-devops' | 'github' | 'combined';
  subject: string;
  organization: string;
  plans: string[];
  generatedAt: string;
  timeZone?: string;
  sourceApiVersion: string;
  azureDevOpsCommitters: AzureDevOpsCommitter[];
  gitHubCommitters: GitHubCommitter[];
  sourceStatuses?: SourceStatus[];
  executiveSummary?: ExecutiveSummary;
  providerSummaries?: ProviderSummary[];
  costEstimates?: CostEstimateLineItem[];
  insights?: ReportInsights;
  warnings: string[];
}

export const exportFormats = ['csv', 'pdf', 'html'] as const;
export type ExportFormat = (typeof exportFormats)[number];

export const providerErrorCodeSchema = z.enum([
  'invalid_request',
  'authentication_required',
  'insufficient_permission',
  'not_found',
  'consent_or_account_mismatch',
  'rate_limited',
  'internal_error',
  'upstream_error',
  'upstream_unavailable',
]);
export type ProviderErrorCode = z.infer<typeof providerErrorCodeSchema>;

export const providerErrorSchema = z.object({
  code: providerErrorCodeSchema,
  message: z.string(),
  correlationId: z.string(),
  retryAfterSeconds: z.number().optional(),
});
export type ProviderError = z.infer<typeof providerErrorSchema>;

export const HTTP_STATUS_TO_ERROR_CODE: Record<number, ProviderErrorCode> = {
  400: 'invalid_request',
  401: 'authentication_required',
  403: 'insufficient_permission',
  404: 'not_found',
  409: 'consent_or_account_mismatch',
  429: 'rate_limited',
  500: 'internal_error',
  502: 'upstream_error',
  503: 'upstream_unavailable',
};
