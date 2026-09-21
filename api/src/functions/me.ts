import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { AuthenticationRequiredError, validateBearerToken } from '../auth/bearer-token.js';
import { newCorrelationId } from '../shared/ids.js';
import { logger } from '../telemetry/logger.js';

/** Returns only the portal identity claims needed by the UI; never logs claims. */
async function me(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const correlationId = newCorrelationId();
  try {
    const identity = await validateBearerToken(request.headers.get('authorization') ?? undefined);
    return {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
      jsonBody: {
        subject: identity.subject,
        tenantId: identity.tenantId,
        name: identity.name,
        roles: identity.roles,
      },
    };
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return {
        status: 401,
        headers: { 'Cache-Control': 'no-store' },
        jsonBody: { message: 'Your session has expired. Sign in again to continue.', correlationId },
      };
    }
    context.error('Unexpected error in /me', { correlationId });
    logger.error({ correlationId }, 'Unexpected error in /me');
    return {
      status: 500,
      headers: { 'Cache-Control': 'no-store' },
      jsonBody: { message: 'An unexpected error occurred.', correlationId },
    };
  }
}

app.http('me', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'me',
  handler: me,
});

export { me };
