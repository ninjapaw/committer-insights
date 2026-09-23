import {
  azureDevOpsAllMeterUsageEstimateResponseSchema,
  azureDevOpsCommitterSchema,
  azureDevOpsMeterUsageEstimateResponseSchema,
  azureDevOpsOrganizationSchema,
  AZURE_DEVOPS_ORG_PATTERN,
  type AzureDevOpsCommitter,
  type AzureDevOpsPlan,
  type AzureDevOpsResultType,
  HTTP_STATUS_TO_ERROR_CODE,
  type ProviderError,
} from '@ninjapaw/contracts';
import { config } from '../../shared/config.js';
import { newCorrelationId } from '../../shared/ids.js';

export class AzureDevOpsAdapterError extends Error {
  constructor(public readonly providerError: ProviderError) {
    super(providerError.message);
    this.name = 'AzureDevOpsAdapterError';
  }
}

/** Re-exported for adapter-level unit tests; the canonical pattern lives in contracts. */
export { AZURE_DEVOPS_ORG_PATTERN };

/**
 * Validates and normalizes an organization name. Throws on anything that
 * does not match the strict allow-list, preventing SSRF via crafted
 * organization values (e.g. containing "://", "@", path traversal, etc.).
 */
export function assertValidOrganization(organization: string): string {
  const parsed = azureDevOpsOrganizationSchema.safeParse(organization);
  if (!parsed.success) {
    throw new AzureDevOpsAdapterError({
      code: 'invalid_request',
      message: 'Organization not found',
      correlationId: newCorrelationId(),
    });
  }
  return parsed.data;
}

/**
 * Builds the meter-usage-estimate URL from trusted constants and a
 * validated organization only. No part of this URL is ever built from
 * unvalidated request input beyond the organization segment.
 */
export function buildMeterUsageEstimateUrl(organization: string, plan: AzureDevOpsPlan): URL {
  const org = assertValidOrganization(organization);
  const url = new URL(
    `${config.azureDevOps.apiHost(org)}/_apis/management/meterUsageEstimate/default`,
  );
  url.searchParams.set('plan', plan);
  url.searchParams.set('api-version', config.azureDevOps.apiVersion());
  return url;
}

const RETRYABLE_STATUS = new Set([429, 502, 503]);

function toProviderError(
  status: number,
  correlationId: string,
  retryAfterSeconds?: number,
): ProviderError {
  const code = HTTP_STATUS_TO_ERROR_CODE[status] ?? 'internal_error';
  const messages: Record<string, string> = {
    invalid_request: 'The request to Azure DevOps was invalid.',
    authentication_required: 'Your session has expired. Sign in again to continue.',
    insufficient_permission:
      'Azure DevOps did not authorize this report. Confirm that your account can access the organization and that the required Advanced Security read permission has been granted.',
    not_found:
      'We could not access that Azure DevOps organization with your signed-in account. Check the organization name and your membership.',
    consent_or_account_mismatch:
      'Your organization requires additional consent before this portal can read Azure DevOps reporting data. Contact your Microsoft Entra administrator.',
    rate_limited:
      'Azure DevOps temporarily limited this request. The report was not changed. Try again after the displayed provider retry time.',
    internal_error: 'An unexpected error occurred while contacting Azure DevOps.',
    upstream_error: 'Azure DevOps returned an unexpected error.',
    upstream_unavailable: 'Azure DevOps is temporarily unavailable. Please try again shortly.',
  };
  return {
    code,
    message: messages[code] ?? messages.internal_error!,
    correlationId,
    retryAfterSeconds,
  };
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

interface FetchEstimateOptions {
  organization: string;
  plan: AzureDevOpsPlan;
  resultType: AzureDevOpsResultType;
  accessToken: string;
  fetchImpl?: typeof fetch;
  maxRetries?: number;
}

/**
 * Calls the Azure DevOps Advanced Security meter-usage-estimate endpoint for
 * a single plan and normalizes the response. Retries only safe, transient
 * failures (429/502/503) with bounded attempts and jitter; never retries
 * authorization failures.
 */
export async function fetchAzureDevOpsEstimate(
  options: FetchEstimateOptions,
): Promise<AzureDevOpsCommitter[]> {
  const { organization, plan, resultType, accessToken } = options;
  const fetchImpl = options.fetchImpl ?? fetch;
  const maxRetries = options.maxRetries ?? 3;
  const correlationId = newCorrelationId();
  const url = buildMeterUsageEstimateUrl(organization, plan);

  let attempt = 0;
  for (;;) {
    attempt += 1;
    const response = await fetchImpl(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'X-Correlation-Id': correlationId,
      },
    });

    if (response.ok) {
      const body: unknown = await response.json();
      // plan=all wraps one estimate per product; single-plan calls return the estimate directly.
      const estimates =
        plan === 'all'
          ? (() => {
              const parsed = azureDevOpsAllMeterUsageEstimateResponseSchema.safeParse(body);
              if (!parsed.success) return undefined;
              return [
                {
                  plan: 'codeSecurity' as const,
                  estimate: parsed.data.codeSecurityMeterUsageEstimate,
                },
                {
                  plan: 'secretProtection' as const,
                  estimate: parsed.data.secretProtectionMeterUsageEstimate,
                },
              ];
            })()
          : (() => {
              const parsed = azureDevOpsMeterUsageEstimateResponseSchema.safeParse(body);
              if (!parsed.success) return undefined;
              return [{ plan, estimate: parsed.data }];
            })();
      if (!estimates) throw new AzureDevOpsAdapterError(toProviderError(502, correlationId));

      const collectedAt = new Date().toISOString();
      const committers = estimates.flatMap(({ plan: effectivePlan, estimate }) =>
        estimate.billedUsers.map((user) => {
          const committer: AzureDevOpsCommitter = {
            provider: 'azure-devops',
            organization,
            plan: effectivePlan,
            resultType,
            cuid: user.cuid,
            // Current responses nest identity fields; retain compatibility with the preview API's older shape.
            identityId: user.userIdentity?.id ?? user.userId,
            descriptor: user.userIdentity?.descriptor ?? user.descriptor,
            displayName: user.userIdentity?.displayName ?? user.displayName,
            userPrincipalName: user.userIdentity?.uniqueName ?? user.uniqueName,
            isEstimated: resultType === 'estimated',
            isLicensed: resultType === 'licensed',
            collectedAt,
            sourceApiVersion: config.azureDevOps.apiVersion(),
          };
          return azureDevOpsCommitterSchema.parse(committer);
        }),
      );

      return committers;
    }

    const retryAfterHeader = response.headers.get('Retry-After');
    const retryAfterSeconds = retryAfterHeader ? Number(retryAfterHeader) : undefined;

    if (RETRYABLE_STATUS.has(response.status) && attempt <= maxRetries) {
      const backoffMs = Math.min(2 ** attempt * 250, 4000) + Math.random() * 250;
      const waitMs = retryAfterSeconds ? retryAfterSeconds * 1000 : backoffMs;
      await sleep(waitMs);
      continue;
    }

    throw new AzureDevOpsAdapterError(
      toProviderError(response.status, correlationId, retryAfterSeconds),
    );
  }
}
