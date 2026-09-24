import {
  azurePlanLabels,
  emptyInsights,
  type ReportInsights,
  type AzureDevOpsCommitter,
  type MultiSource,
  type SourceStatus,
} from '@ninjapaw/contracts';
import { fetchAzureDevOpsEstimate } from '../adapters/azure-devops/estimate-client.js';
import { discoverAzureDevOpsOrganizations } from '../adapters/azure-devops/organizations-client.js';
import { acquireAzureDevOpsToken } from '../auth/local-credential.js';
import { saveReport } from '../reports/report-store.js';
import { config } from '../shared/config.js';
import { buildProviderSummary } from '../reports/provider-summary.js';
import { buildAzureDevOpsCostEstimates } from '../reports/billing-estimates.js';
import {
  collectAzureRepositoryInsights,
  preflightAzureRepositoryAccess,
} from '../adapters/azure-devops/insights-client.js';

type AzureSource = Extract<MultiSource, { provider: 'azure-devops' }>;

export function azureSourceScope(source: AzureSource): string {
  return source.plans.includes('all')
    ? `${azurePlanLabels.codeSecurity} and ${azurePlanLabels.secretProtection}`
    : source.plans.map((plan) => azurePlanLabels[plan]).join(', ');
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
  const insights = emptyInsights();
  const azureDevOpsCommitters = await collectAzureDevOps(source, insights);
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
    insights,
    gitHubCommitters: [],
    sourceStatuses,
    providerSummaries: [summarizeAzureDevOps(azureDevOpsCommitters, sourceStatuses)],
    costEstimates: buildAzureDevOpsCostEstimates(azureDevOpsCommitters, source.plans),
    warnings: ['This report uses an Azure DevOps preview API.'],
  });
}

export async function collectAzureDevOps(
  source: AzureSource,
  insights?: ReportInsights,
): Promise<AzureDevOpsCommitter[]> {
  const accessToken = await acquireAzureDevOpsToken();
  if (insights)
    await collectAzureRepositoryInsights(
      source.organization,
      source.sinceDays ?? 90,
      accessToken,
      insights,
    );
  try {
    const rows = (
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
    insights?.checks.push({
      provider: 'azure-devops',
      source: source.organization,
      dataset: 'Security estimates',
      status: 'complete',
      detail:
        'Current preview estimate for selected plans. The activity window does not alter the provider billing window.',
    });
    return rows;
  } catch (error) {
    if (!insights) throw error;
    insights.checks.push({
      provider: 'azure-devops',
      source: source.organization,
      dataset: 'Security estimates',
      status: 'unavailable',
      detail: 'Preview estimate could not be read; costs are unknown, not zero.',
    });
    if (
      !insights.repositories.some(
        (row) => row.provider === 'azure-devops' && row.source === source.organization,
      )
    )
      throw error;
    return [];
  }
}

export async function preflightAzureDevOps(source: AzureSource): Promise<void> {
  try {
    await collectAzureDevOps(source);
  } catch {
    await preflightAzureRepositoryAccess(source.organization, await acquireAzureDevOpsToken());
  }
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
