import {
  azurePlanLabels,
  emptyInsights,
  type ReportInsights,
  type AzureDevOpsCommitter,
  type MultiSource,
  type SourceStatus,
  type AzureBillingPlan,
} from '@ninjapaw/contracts';
import {
  fetchAzureDevOpsEstimate,
  buildMeterUsageEstimateUrl,
} from '../adapters/azure-devops/estimate-client.js';
import { collectAzureBilling } from '../adapters/azure-devops/billing-client.js';
import { discoverAzureDevOpsOrganizations } from '../adapters/azure-devops/organizations-client.js';
import { acquireAzureDevOpsToken, startAzureCliSignIn } from '../auth/local-credential.js';
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
  return startAzureCliSignIn();
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
  if (insights) {
    insights.azureServiceEstimates ??= [];
    insights.azureServiceEstimates.push({
      organization: source.organization,
      inputs: source.serviceScenario ?? { basicFreeUsers: 5 },
    });
  }
  const accessToken = await acquireAzureDevOpsToken();
  if (insights) await collectAzureBilling(source, insights, acquireAzureDevOpsToken);
  if (insights)
    await collectAzureRepositoryInsights(
      source.organization,
      source.sinceDays ?? 90,
      accessToken,
      insights,
    );
  if (insights) {
    const plans: AzureBillingPlan[] = source.plans.includes('all')
      ? ['codeSecurity', 'secretProtection']
      : ([...new Set(source.plans)] as AzureBillingPlan[]);
    const committers: AzureDevOpsCommitter[] = [];
    let readableEstimate = false;
    let failure: unknown;
    insights.azureEstimates ??= [];
    for (const plan of plans) {
      try {
        const rows = await fetchAzureDevOpsEstimate({
          organization: source.organization,
          plan,
          resultType: 'estimated',
          accessToken,
          onEstimate: (estimate) => {
            insights.azureEstimates!.push(estimate);
          },
        });
        committers.push(...rows);
        readableEstimate = true;
      } catch (error) {
        failure = error;
        insights.azureEstimates.push({
          organization: source.organization,
          plan,
          collectedAt: new Date().toISOString(),
          sourceUrl: buildMeterUsageEstimateUrl(source.organization, plan).href,
          apiVersion: config.azureDevOps.apiVersion(),
          status: 'unavailable',
          returnedIdentities: 0,
          warnings: [
            'Provider enablement estimate unavailable. No Git activity count or zero-cost value was substituted.',
          ],
        });
      }
    }
    const estimates = insights.azureEstimates.filter(
      (estimate) => estimate.organization === source.organization,
    );
    const complete =
      estimates.length === plans.length &&
      estimates.every((estimate) => estimate.status === 'complete');
    insights.checks.push({
      provider: 'azure-devops',
      source: source.organization,
      dataset: 'Security estimates',
      status: complete ? 'complete' : readableEstimate ? 'partial' : 'unavailable',
      detail:
        'Organization/product enablement estimates are independent of billing access and current enablement. Provider counts and missing names are reported separately. The activity window does not change the provider billing window.',
    });
    if (
      !readableEstimate &&
      !insights.repositories.some(
        (row) => row.provider === 'azure-devops' && row.source === source.organization,
      ) &&
      !insights.azureBilling?.some(
        (snapshot) =>
          snapshot.organization === source.organization && snapshot.status !== 'unavailable',
      )
    )
      throw failure;
    return committers;
  }
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
  try {
    const accessToken = await acquireAzureDevOpsToken();
    const plans = source.plans.includes('all')
      ? (['codeSecurity', 'secretProtection'] as const)
      : source.plans;
    const results = await Promise.allSettled(
      plans.map((plan) =>
        fetchAzureDevOpsEstimate({
          organization: source.organization,
          plan,
          resultType: 'estimated',
          accessToken,
          onEstimate: () => undefined,
        }),
      ),
    );
    if (results.some((result) => result.status === 'fulfilled')) return;
    throw new Error('No selected product estimate could be read.');
  } catch {
    try {
      await preflightAzureRepositoryAccess(source.organization, await acquireAzureDevOpsToken());
    } catch (error) {
      if (source.includeAzureBilling) {
        const insights = emptyInsights();
        await collectAzureBilling(
          { ...source, includeAzureBillingDetails: false },
          insights,
          acquireAzureDevOpsToken,
        );
        if (insights.azureBilling?.some((snapshot) => snapshot.status !== 'unavailable')) return;
      }
      throw error;
    }
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
    ? 'Use Sign in with Microsoft with an account in the organization, then reconnect.'
    : 'Ask an Azure DevOps administrator for organization membership and Advanced Security read access (vso.advsec equivalent).';
}
