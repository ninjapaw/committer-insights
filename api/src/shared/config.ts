/**
 * Central configuration module. This is the ONLY place that constructs
 * environment-driven values used to build outbound Azure DevOps URLs, so
 * SSRF-relevant configuration stays auditable in one file.
 */

import { resolveReportTimeZone } from '@ninjapaw/contracts';

function readEnv(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

declare const __DEVELOPER_USAGE_INSIGHTS_CLIENT_ID__: string | undefined;
// The public client ID is embedded for releases; the environment override supports local testing.
const embeddedClientId =
  typeof __DEVELOPER_USAGE_INSIGHTS_CLIENT_ID__ === 'string'
    ? __DEVELOPER_USAGE_INSIGHTS_CLIENT_ID__
    : '';

export const config = {
  report: {
    timeZone: () => resolveReportTimeZone(process.env.DEVELOPER_USAGE_INSIGHTS_TIMEZONE),
  },
  entra: {
    clientId: () => process.env.DEVELOPER_USAGE_INSIGHTS_CLIENT_ID ?? embeddedClientId,
    tenantId: () => readEnv('DEVELOPER_USAGE_INSIGHTS_TENANT_ID', 'organizations'),
    redirectUri: () => readEnv('DEVELOPER_USAGE_INSIGHTS_REDIRECT_URI', 'http://localhost:8400'),
  },
  azureDevOps: {
    // Trusted constant host. Adapter code must never accept a host from
    // request input; only the validated organization path segment varies.
    resourceUri: 'https://app.vssps.visualstudio.com',
    resourceAppId: '499b84ac-1321-427f-aa17-267ca6975798',
    apiHost: (organization: string) => `https://advsec.dev.azure.com/${organization}`,
    apiVersion: () => readEnv('AZURE_DEVOPS_API_VERSION', '7.2-preview.3'),
  },
};
