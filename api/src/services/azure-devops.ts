import type { AzureDevOpsCommitter, MultiSource, SourceStatus } from '@ninjapaw/contracts';
import { fetchAzureDevOpsEstimate } from '../adapters/azure-devops/estimate-client.js';
import { discoverAzureDevOpsOrganizations } from '../adapters/azure-devops/organizations-client.js';
import { acquireAzureDevOpsToken } from '../auth/local-credential.js';
import { saveReport } from '../reports/report-store.js';
import { config } from '../shared/config.js';
import { buildProviderSummary } from '../reports/provider-summary.js';

type AzureSource = Extract<MultiSource, { provider: 'azure-devops' }>;

export function azureSourceScope(source: AzureSource): string {
  const labels = {
    codeSecurity: 'Code Security',
    secretProtection: 'Secret Protection',
    all: 'Code Security and Secret Protection',
  };
  return source.plans.includes('all')
    ? labels.all
    : source.plans.map((plan) => labels[plan]).join(', ');
}

export async function connectAzureDevOps() {
  await acquireAzureDevOpsToken();
  return { authenticated: true };
}

export async function discoverAzureDevOpsSources() {
  return discoverAzureDevOpsOrganizations(await acquireAzureDevOpsToken());
}

export function summarizeAzureDevOps(committers: AzureDevOpsCommitter[], statuses: SourceStatus[]) {
  return buildProviderSummary(
    {
      provider: 'azure-devops',
      displayName: 'Azure DevOps',
      sourceLabel: 'Organizations',
      measurement: 'Advanced Security estimate',
      apiVersion: config.azureDevOps.apiVersion(),
      methodology:
        'Preview estimates for the selected security plans, not licensed-user or commit-activity counts. An identity can appear in multiple plans.',
    },
    committers.map(azureIdentityKey),
    statuses,
  );
}

export async function createAzureReport(source: AzureSource) {
  const azureDevOpsCommitters = await collectAzureDevOps(source);
  const sourceStatuses: SourceStatus[] = [
    {
      provider: source.provider,
      subject: source.organization,
      scope: azureSourceScope(source),
      status: 'included',
      committerCount: azureDevOpsCommitters.length,
    },
  ];
  return saveReport({
    provider: source.provider,
    subject: source.organization,
    organization: source.organization,
    plans: source.plans,
    sourceApiVersion: config.azureDevOps.apiVersion(),
    azureDevOpsCommitters,
    gitHubCommitters: [],
    sourceStatuses,
    providerSummaries: [summarizeAzureDevOps(azureDevOpsCommitters, sourceStatuses)],
    warnings: ['This report uses an Azure DevOps preview API.'],
  });
}

export async function collectAzureDevOps(source: AzureSource): Promise<AzureDevOpsCommitter[]> {
  const accessToken = await acquireAzureDevOpsToken();
  return (
    await Promise.all(
      source.plans.map((plan) =>
        fetchAzureDevOpsEstimate({
          organization: source.organization,
          plan,
          resultType: 'estimated',
          accessToken,
        }),
      ),
    )
  ).flat();
}

export async function preflightAzureDevOps(source: AzureSource): Promise<void> {
  await collectAzureDevOps(source);
}

export function azureIdentityKey(committer: AzureDevOpsCommitter): string {
  const identity = committer.identityId ?? committer.cuid;
  return identity
    ? `azure:${identity}`
    : `azure:${committer.organization}:${committer.displayName ?? 'unknown'}`;
}

export function azureRemediation(authentication: boolean): string {
  return authentication
    ? 'Run "az login" with an account in the organization, then reconnect.'
    : 'Ask an Azure DevOps administrator for organization membership and Advanced Security read access (vso.advsec equivalent).';
}
