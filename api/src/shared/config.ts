/**
 * Central configuration module. This is the ONLY place that constructs
 * environment-driven values used to build outbound Azure DevOps URLs, so
 * SSRF-relevant configuration stays auditable in one file.
 */

function readEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

declare const __COMMITTER_INSIGHTS_CLIENT_ID__: string | undefined;
// The public client ID is embedded for releases; the environment override supports local testing.
const embeddedClientId =
  typeof __COMMITTER_INSIGHTS_CLIENT_ID__ === 'string' ? __COMMITTER_INSIGHTS_CLIENT_ID__ : '';

export const config = {
  entra: {
    clientId: () => process.env.COMMITTER_INSIGHTS_CLIENT_ID ?? embeddedClientId,
    tenantId: () => readEnv('COMMITTER_INSIGHTS_TENANT_ID', 'organizations'),
    redirectUri: () => readEnv('COMMITTER_INSIGHTS_REDIRECT_URI', 'http://localhost:8400'),
  },
  azureDevOps: {
    // Trusted constant host. Adapter code must never accept a host from
    // request input; only the validated organization path segment varies.
    resourceUri: 'https://app.vssps.visualstudio.com',
    apiHost: (organization: string) => `https://advsec.dev.azure.com/${organization}`,
    apiVersion: () => readEnv('AZURE_DEVOPS_API_VERSION', '7.2-preview.3'),
  },
};
