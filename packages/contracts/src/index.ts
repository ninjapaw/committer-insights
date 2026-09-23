import { z } from 'zod';

export * from './azure-devops.js';
export * from './github.js';
import {
  azureDevOpsOrganizationSchema,
  azureDevOpsPlanSchema,
  type AzureDevOpsCommitter,
} from './azure-devops.js';
import { gitHubRepositorySchema, type GitHubCommitter } from './github.js';

export const multiSourceSchema = z.discriminatedUnion('provider', [
  z.object({
    provider: z.literal('azure-devops'),
    organization: azureDevOpsOrganizationSchema,
    plans: z.array(azureDevOpsPlanSchema).min(1).default(['all']),
  }),
  z.object({
    provider: z.literal('github'),
    repository: gitHubRepositorySchema,
    sinceDays: z.number().int().min(1).max(365).default(90),
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
  totalCommits?: number;
}

export interface Report {
  reportId: string;
  provider: 'azure-devops' | 'github' | 'combined';
  subject: string;
  organization: string;
  plans: string[];
  generatedAt: string;
  sourceApiVersion: string;
  azureDevOpsCommitters: AzureDevOpsCommitter[];
  gitHubCommitters: GitHubCommitter[];
  sourceStatuses?: SourceStatus[];
  executiveSummary?: ExecutiveSummary;
  providerSummaries?: ProviderSummary[];
  warnings: string[];
}

export const exportFormats = ['xlsx', 'csv', 'pdf', 'html'] as const;
export type ExportFormat = (typeof exportFormats)[number];

/** Typed error model for upstream and portal API failures. */
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
