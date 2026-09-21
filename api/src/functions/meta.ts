import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';

/** Never exposes environment values or secret state. */
async function health(): Promise<HttpResponseInit> {
  return {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
    jsonBody: { status: 'ok' },
  };
}

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'health',
  handler: health,
});

async function version(): Promise<HttpResponseInit> {
  return {
    status: 200,
    headers: { 'Cache-Control': 'no-store' },
    jsonBody: {
      apiVersion: process.env.npm_package_version ?? '0.1.0',
      azureDevOpsApiVersion: process.env.AZURE_DEVOPS_API_VERSION ?? '7.2-preview.3',
    },
  };
}

app.http('version', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'version',
  handler: version,
});

export { health, version };
export type { HttpRequest, InvocationContext };
