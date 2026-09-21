import {
  app,
  type HttpRequest,
  type HttpResponseInit,
  type InvocationContext,
} from '@azure/functions';
import { reportRequestSchema } from '@ninjapaw/contracts';
import { AuthenticationRequiredError, validateBearerToken } from '../auth/bearer-token.js';
import { acquireAzureDevOpsTokenOnBehalfOf, ConsentRequiredError } from '../auth/on-behalf-of.js';
import {
  AzureDevOpsAdapterError,
  fetchAzureDevOpsEstimate,
} from '../adapters/azure-devops/estimate-client.js';
import { matchIdentities } from '../reports/identity-matching.js';
import { reportStore, type StoredReport } from '../reports/report-store.js';
import { newCorrelationId, newOpaqueId } from '../shared/ids.js';
import { config } from '../shared/config.js';
import { logger } from '../telemetry/logger.js';

const RETENTION_TTL_MS: Record<string, number | undefined> = {
  none: 15 * 60 * 1000, // in-memory session window even for "no persistence" delivery
  session: 60 * 60 * 1000,
  'thirty-days': 30 * 24 * 60 * 60 * 1000,
};

async function createAzureDevOpsReport(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const correlationId = newCorrelationId();
  try {
    const identity = await validateBearerToken(request.headers.get('authorization') ?? undefined);
    const body = reportRequestSchema.safeParse(await request.json());
    if (!body.success || !body.data.azureDevOps) {
      return {
        status: 400,
        headers: { 'Cache-Control': 'no-store' },
        jsonBody: { message: 'The request to Azure DevOps was invalid.', correlationId },
      };
    }

    const { organization, plans, resultTypes } = body.data.azureDevOps;
    const accessToken = await acquireAzureDevOpsTokenOnBehalfOf(identity.bearerToken);

    const azureDevOpsCommitters = (
      await Promise.all(
        plans.flatMap((plan) =>
          resultTypes.map((resultType) =>
            fetchAzureDevOpsEstimate({ organization, plan, resultType, accessToken }),
          ),
        ),
      )
    ).flat();

    const combinedCommitters = matchIdentities(azureDevOpsCommitters, []);
    const reportId = newOpaqueId();
    const generatedAt = new Date().toISOString();
    const ttl = RETENTION_TTL_MS[body.data.retention];

    const report: StoredReport = {
      reportId,
      ownerSubject: identity.subject,
      ownerTenantId: identity.tenantId,
      organization,
      plans,
      retention: body.data.retention,
      generatedAt,
      sourceApiVersion: config.azureDevOps.apiVersion(),
      azureDevOpsCommitters,
      gitHubCommitters: [],
      combinedCommitters,
      warnings: [
        'This report uses an Azure DevOps preview API. Response fields can change, so results include the API version and collection time.',
        'Estimated results project usage if Advanced Security were enabled; they are distinct from currently licensed users.',
      ],
      expiresAt: ttl ? new Date(Date.now() + ttl).toISOString() : undefined,
    };
    reportStore.put(report);

    logger.info(
      { correlationId, organization, reportId, retention: body.data.retention },
      'Report generated',
    );

    return {
      status: 201,
      headers: { 'Cache-Control': 'no-store' },
      jsonBody: { reportId, generatedAt, warnings: report.warnings },
    };
  } catch (error) {
    return mapReportError(error, correlationId, context);
  }
}

function mapReportError(
  error: unknown,
  correlationId: string,
  context: InvocationContext,
): HttpResponseInit {
  if (error instanceof AuthenticationRequiredError) {
    return {
      status: 401,
      headers: { 'Cache-Control': 'no-store' },
      jsonBody: { message: 'Your session has expired. Sign in again to continue.', correlationId },
    };
  }
  if (error instanceof ConsentRequiredError) {
    return {
      status: 409,
      headers: { 'Cache-Control': 'no-store' },
      jsonBody: {
        message:
          'Your organization requires additional consent before this portal can read Azure DevOps reporting data. Contact your Microsoft Entra administrator.',
        correlationId,
      },
    };
  }
  if (error instanceof AzureDevOpsAdapterError) {
    const status =
      {
        invalid_request: 400,
        authentication_required: 401,
        insufficient_permission: 403,
        not_found: 404,
        consent_or_account_mismatch: 409,
        rate_limited: 429,
        internal_error: 500,
        upstream_error: 502,
        upstream_unavailable: 503,
      }[error.providerError.code] ?? 500;
    return {
      status,
      headers: {
        'Cache-Control': 'no-store',
        ...(error.providerError.retryAfterSeconds
          ? { 'Retry-After': String(error.providerError.retryAfterSeconds) }
          : {}),
      },
      jsonBody: { message: error.providerError.message, correlationId },
    };
  }
  context.error('Unexpected error generating report', { correlationId });
  logger.error({ correlationId }, 'Unexpected error generating report');
  return {
    status: 500,
    headers: { 'Cache-Control': 'no-store' },
    jsonBody: { message: 'An unexpected error occurred.', correlationId },
  };
}

app.http('reportsAzureDevOps', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'reports/azure-devops',
  handler: createAzureDevOpsReport,
});

async function getReport(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const correlationId = newCorrelationId();
  try {
    const identity = await validateBearerToken(request.headers.get('authorization') ?? undefined);
    const reportId = request.params.reportId;
    const report = reportId
      ? reportStore.get(reportId, identity.subject, identity.tenantId)
      : undefined;
    if (!report) {
      return {
        status: 404,
        headers: { 'Cache-Control': 'no-store' },
        jsonBody: { message: 'Report not found.', correlationId },
      };
    }
    return {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
      jsonBody: report,
    };
  } catch (error) {
    return mapReportError(error, correlationId, context);
  }
}

app.http('getReport', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'reports/{reportId}',
  handler: getReport,
});

async function deleteReport(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const correlationId = newCorrelationId();
  try {
    const identity = await validateBearerToken(request.headers.get('authorization') ?? undefined);
    const reportId = request.params.reportId;
    const deleted = reportId
      ? reportStore.delete(reportId, identity.subject, identity.tenantId)
      : false;
    if (!deleted) {
      return {
        status: 404,
        headers: { 'Cache-Control': 'no-store' },
        jsonBody: { message: 'Report not found.', correlationId },
      };
    }
    logger.info({ correlationId, reportId }, 'Report deleted');
    return { status: 204, headers: { 'Cache-Control': 'no-store' } };
  } catch (error) {
    return mapReportError(error, correlationId, context);
  }
}

app.http('deleteReport', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'reports/{reportId}',
  handler: deleteReport,
});

export { createAzureDevOpsReport, getReport, deleteReport };
