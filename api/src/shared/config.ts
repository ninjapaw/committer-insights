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

function readBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw.toLowerCase() === 'true';
}

export const config = {
  entra: {
    clientId: () => readEnv('API_ENTRA_CLIENT_ID', ''),
    tenantAuthority: () =>
      readEnv('API_ENTRA_TENANT_AUTHORITY', 'https://login.microsoftonline.com/organizations'),
    expectedAudience: () => readEnv('API_EXPECTED_AUDIENCE', ''),
    clientCertificateSecretUri: () => process.env.API_ENTRA_CLIENT_CERTIFICATE_SECRET_URI ?? '',
    clientSecretUri: () => process.env.API_ENTRA_CLIENT_SECRET_URI ?? '',
  },
  azureDevOps: {
    // Trusted constant host. Adapter code must never accept a host from
    // request input; only the validated organization path segment varies.
    resourceUri: 'https://app.vssps.visualstudio.com',
    apiHost: (organization: string) => `https://advsec.dev.azure.com/${organization}`,
    apiVersion: () => readEnv('AZURE_DEVOPS_API_VERSION', '7.2-preview.3'),
    resourceAppId: '499b84ac-1321-427f-aa17-267ca6975798',
    delegatedScope: 'vso.advsec',
  },
  reporting: {
    defaultRetention: () => readEnv('REPORT_RETENTION_DEFAULT', 'none'),
  },
  featureFlags: {
    githubProvider: () => readBool('FEATURE_GITHUB_PROVIDER', false),
    /** Mock data may only ever be enabled outside a production deployment. */
    mockDataEnabled: () => {
      const isProduction = readEnv('AZURE_FUNCTIONS_ENVIRONMENT', 'Development') === 'Production';
      if (isProduction) return false;
      return readBool('ENABLE_MOCK_DATA', false);
    },
  },
};
