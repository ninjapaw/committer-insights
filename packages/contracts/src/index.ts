import { z } from 'zod';

/** Allowed Azure DevOps Advanced Security meter-usage-estimate plan values. */
export const azureDevOpsPlanSchema = z.enum(['codeSecurity', 'secretProtection', 'all']);
export type AzureDevOpsPlan = z.infer<typeof azureDevOpsPlanSchema>;

export const azureDevOpsResultTypeSchema = z.enum(['estimated', 'licensed']);
export type AzureDevOpsResultType = z.infer<typeof azureDevOpsResultTypeSchema>;

/**
 * Strict allow-list pattern for Azure DevOps organization names, matching
 * the naming rules Azure DevOps itself enforces (letters, digits, hyphen;
 * no leading/trailing hyphen; 1-50 chars). Used to prevent SSRF via
 * arbitrary host/path injection into upstream URLs.
 */
export const AZURE_DEVOPS_ORG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,48}[A-Za-z0-9]$|^[A-Za-z0-9]$/;

export const azureDevOpsOrganizationSchema = z
  .string()
  .min(1, 'Organization is required')
  .max(50, 'Organization name is too long')
  .regex(AZURE_DEVOPS_ORG_PATTERN, 'Organization name contains invalid characters');

/** Raw shape returned by the Azure DevOps meterUsageEstimate endpoint (subset actually used). */
export const azureDevOpsMeterUsageBilledUserSchema = z.object({
  cuid: z.string().optional(),
  userId: z.string().optional(),
  descriptor: z.string().optional(),
  displayName: z.string().optional(),
  uniqueName: z.string().optional(),
});
export type AzureDevOpsMeterUsageBilledUser = z.infer<typeof azureDevOpsMeterUsageBilledUserSchema>;

export const azureDevOpsMeterUsageEstimateResponseSchema = z.object({
  uniqueCommitterCount: z.number().int().nonnegative(),
  billedUsers: z.array(azureDevOpsMeterUsageBilledUserSchema).default([]),
});
export type AzureDevOpsMeterUsageEstimateResponse = z.infer<
  typeof azureDevOpsMeterUsageEstimateResponseSchema
>;

/** Normalized Azure DevOps committer record retained by this application. */
export const azureDevOpsCommitterSchema = z.object({
  provider: z.literal('azure-devops'),
  organization: z.string(),
  plan: azureDevOpsPlanSchema,
  resultType: azureDevOpsResultTypeSchema,
  cuid: z.string().optional(),
  identityId: z.string().optional(),
  descriptor: z.string().optional(),
  displayName: z.string().optional(),
  userPrincipalName: z.string().optional(),
  isEstimated: z.boolean(),
  isLicensed: z.boolean(),
  collectedAt: z.string().datetime(),
  sourceApiVersion: z.string(),
});
export type AzureDevOpsCommitter = z.infer<typeof azureDevOpsCommitterSchema>;

export const gitHubCommitterSchema = z.object({
  provider: z.literal('github'),
  userLogin: z.string(),
  organization: z.string(),
  repository: z.string(),
  organizationRepository: z.string(),
  lastPushedDate: z.string().datetime().optional(),
  lastPushedEmail: z.string().optional(),
  collectedAt: z.string().datetime(),
});
export type GitHubCommitter = z.infer<typeof gitHubCommitterSchema>;

export const matchStatusSchema = z.enum(['matched', 'provider-only', 'review-required']);
export const matchMethodSchema = z.enum([
  'exact-email',
  'exact-upn',
  'approved-alias',
  'github-login-candidate',
  'none',
]);

export const combinedCommitterSchema = z.object({
  canonicalId: z.string(),
  displayName: z.string().optional(),
  primaryEmail: z.string().optional(),
  providers: z.array(z.enum(['azure-devops', 'github'])),
  gitHubLogin: z.string().optional(),
  azureDevOpsUserPrincipalName: z.string().optional(),
  organizations: z.array(z.string()),
  repositories: z.array(z.string()),
  plans: z.array(azureDevOpsPlanSchema),
  isEstimated: z.boolean(),
  isLicensed: z.boolean(),
  matchStatus: matchStatusSchema,
  matchMethod: matchMethodSchema,
  matchConfidence: z.number().min(0).max(1),
  reviewRequired: z.boolean(),
});
export type CombinedCommitter = z.infer<typeof combinedCommitterSchema>;

export const retentionSchema = z.enum(['none', 'session', 'thirty-days']).default('none');
export type Retention = z.infer<typeof retentionSchema>;

export const reportRequestSchema = z.object({
  provider: z.enum(['azure-devops', 'combined']),
  azureDevOps: z
    .object({
      organization: azureDevOpsOrganizationSchema,
      plans: z.array(azureDevOpsPlanSchema).min(1),
      resultTypes: z.array(azureDevOpsResultTypeSchema).min(1).default(['estimated']),
    })
    .optional(),
  retention: retentionSchema,
});
export type ReportRequest = z.infer<typeof reportRequestSchema>;

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
