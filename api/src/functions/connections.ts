import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { azureDevOpsOrganizationSchema } from '@ninjapaw/contracts';
import { AuthenticationRequiredError, validateBearerToken } from '../auth/bearer-token.js';
import { acquireAzureDevOpsTokenOnBehalfOf, ConsentRequiredError } from '../auth/on-behalf-of.js';
import { assertValidOrganization } from '../adapters/azure-devops/estimate-client.js';
import { newCorrelationId } from '../shared/ids.js';
import { logger } from '../telemetry/logger.js';

/**
 * In-memory per-user connection state for this iteration. Durable storage
 * (e.g. Table Storage keyed by hashed subject) is deferred; see
 * docs/BUILD_REPORT.md.
 */
const connections = new Map<string, { organization: string; connectedAt: string }>();

function connectionKey(subject: string, tenantId: string): string {
  return `${tenantId}:${subject}`;
}

async function listConnections(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const correlationId = newCorrelationId();
  try {
    const identity = await validateBearerToken(request.headers.get('authorization') ?? undefined);
    const connection = connections.get(connectionKey(identity.subject, identity.tenantId));
    return {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
      jsonBody: { connections: connection ? [{ provider: 'azure-devops', ...connection }] : [] },
    };
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return { status: 401, headers: { 'Cache-Control': 'no-store' }, jsonBody: { message: 'Your session has expired. Sign in again to continue.', correlationId } };
    }
    context.error('Failed to list connections', { correlationId });
    return { status: 500, headers: { 'Cache-Control': 'no-store' }, jsonBody: { message: 'An unexpected error occurred.', correlationId } };
  }
}

app.http('listConnections', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'connections',
  handler: listConnections,
});

async function validateAzureDevOpsConnection(
  request: HttpRequest,
  context: InvocationContext,
): Promise<HttpResponseInit> {
  const correlationId = newCorrelationId();
  try {
    const identity = await validateBearerToken(request.headers.get('authorization') ?? undefined);
    const body = (await request.json()) as { organization?: unknown };
    const parsed = azureDevOpsOrganizationSchema.safeParse(body.organization);
    if (!parsed.success) {
      return { status: 400, headers: { 'Cache-Control': 'no-store' }, jsonBody: { message: 'Organization not found', correlationId } };
    }
    const organization = assertValidOrganization(parsed.data);

    // Validate the OBO exchange succeeds; does not yet call a live Azure
    // DevOps endpoint to confirm membership (deferred; see docs/BUILD_REPORT.md).
    await acquireAzureDevOpsTokenOnBehalfOf(identity.bearerToken);

    connections.set(connectionKey(identity.subject, identity.tenantId), {
      organization,
      connectedAt: new Date().toISOString(),
    });
    logger.info({ correlationId, organization }, 'Azure DevOps connection validated');
    return { status: 200, headers: { 'Cache-Control': 'no-store' }, jsonBody: { organization, status: 'connected' } };
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return { status: 401, headers: { 'Cache-Control': 'no-store' }, jsonBody: { message: 'Your session has expired. Sign in again to continue.', correlationId } };
    }
    if (error instanceof ConsentRequiredError) {
      return {
        status: 409,
        headers: { 'Cache-Control': 'no-store' },
        jsonBody: {
          message: 'Your organization requires additional consent before this portal can read Azure DevOps reporting data. Contact your Microsoft Entra administrator.',
          correlationId,
        },
      };
    }
    context.error('Connection validation failed', { correlationId });
    return { status: 500, headers: { 'Cache-Control': 'no-store' }, jsonBody: { message: 'An unexpected error occurred.', correlationId } };
  }
}

app.http('validateAzureDevOpsConnection', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'connections/azure-devops/validate',
  handler: validateAzureDevOpsConnection,
});

async function disconnectAzureDevOps(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const correlationId = newCorrelationId();
  try {
    const identity = await validateBearerToken(request.headers.get('authorization') ?? undefined);
    connections.delete(connectionKey(identity.subject, identity.tenantId));
    logger.info({ correlationId }, 'Azure DevOps connection removed');
    return { status: 204, headers: { 'Cache-Control': 'no-store' } };
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return { status: 401, headers: { 'Cache-Control': 'no-store' }, jsonBody: { message: 'Your session has expired. Sign in again to continue.', correlationId } };
    }
    context.error('Disconnect failed', { correlationId });
    return { status: 500, headers: { 'Cache-Control': 'no-store' }, jsonBody: { message: 'An unexpected error occurred.', correlationId } };
  }
}

app.http('disconnectAzureDevOps', {
  methods: ['DELETE'],
  authLevel: 'anonymous',
  route: 'connections/azure-devops',
  handler: disconnectAzureDevOps,
});

export { listConnections, validateAzureDevOpsConnection, disconnectAzureDevOps };
