import { z } from 'zod';

export const azureDevOpsPlanSchema = z.enum(['codeSecurity', 'secretProtection', 'all']);
export type AzureDevOpsPlan = z.infer<typeof azureDevOpsPlanSchema>;

export const azureDevOpsResultTypeSchema = z.literal('estimated');
export type AzureDevOpsResultType = z.infer<typeof azureDevOpsResultTypeSchema>;

/**
 * Strict allow-list pattern for Azure DevOps organization names, matching
 * the naming rules Azure DevOps itself enforces (letters, digits, hyphen;
 * no leading/trailing hyphen; 1-50 chars). Used to prevent SSRF via
 * arbitrary host/path injection into upstream URLs.
 */
export const AZURE_DEVOPS_ORG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9-]{0,48}[A-Za-z0-9]$|^[A-Za-z0-9]$/;

export function normalizeAzureDevOpsOrganization(value: string): string {
  const input = value.trim();

  try {
    const url = new URL(input);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return input;

    if (url.hostname.toLowerCase() === 'dev.azure.com') {
      return url.pathname.split('/').filter(Boolean)[0] ?? input;
    }

    const legacyHost = url.hostname.match(
      /^([A-Za-z0-9][A-Za-z0-9-]{0,48}[A-Za-z0-9]|[A-Za-z0-9])\.visualstudio\.com$/i,
    );
    if (legacyHost) return legacyHost[1] ?? input;
  } catch {
    // A bare organization name is the normal non-URL input.
  }

  return input;
}

export const azureDevOpsOrganizationSchema = z
  .string()
  .transform(normalizeAzureDevOpsOrganization)
  .pipe(
    z
      .string()
      .min(1, 'Organization is required')
      .max(50, 'Organization name is too long')
      .regex(AZURE_DEVOPS_ORG_PATTERN, 'Enter an organization name or Azure DevOps URL'),
  );

export const azureDevOpsProfileSchema = z.object({
  id: z.string().min(1),
});

export const azureDevOpsAccountSchema = z.object({
  accountId: z.string().min(1),
  accountName: azureDevOpsOrganizationSchema,
});

export const azureDevOpsAccountsResponseSchema = z.object({
  value: z.array(azureDevOpsAccountSchema).default([]),
});

/** Raw shape returned by the Azure DevOps meterUsageEstimate endpoint (subset actually used). */
export const azureDevOpsMeterUsageBilledUserSchema = z.object({
  cuid: z.string().optional(),
  userId: z.string().optional(),
  descriptor: z.string().optional(),
  displayName: z.string().optional(),
  uniqueName: z.string().optional(),
  userIdentity: z
    .object({
      id: z.string().optional(),
      descriptor: z.string().optional(),
      displayName: z.string().optional(),
      uniqueName: z.string().optional(),
    })
    .optional(),
});
export type AzureDevOpsMeterUsageBilledUser = z.infer<typeof azureDevOpsMeterUsageBilledUserSchema>;

export const azureDevOpsMeterUsageEstimateResponseSchema = z.object({
  uniqueCommitterCount: z.number().int().nonnegative(),
  billedUsers: z.array(azureDevOpsMeterUsageBilledUserSchema).default([]),
});
export type AzureDevOpsMeterUsageEstimateResponse = z.infer<
  typeof azureDevOpsMeterUsageEstimateResponseSchema
>;

export const azureDevOpsAllMeterUsageEstimateResponseSchema = z.object({
  codeSecurityMeterUsageEstimate: azureDevOpsMeterUsageEstimateResponseSchema,
  secretProtectionMeterUsageEstimate: azureDevOpsMeterUsageEstimateResponseSchema,
});

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

export const reportRequestSchema = z.object({
  organization: azureDevOpsOrganizationSchema,
  plans: z.array(azureDevOpsPlanSchema).min(1),
  resultTypes: z.array(azureDevOpsResultTypeSchema).min(1).default(['estimated']),
});
export type ReportRequest = z.infer<typeof reportRequestSchema>;
