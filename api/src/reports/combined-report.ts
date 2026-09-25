import type {
  AzureDevOpsCommitter,
  GitHubCommitter,
  MultiSource,
  SourceStatus,
  ExecutiveSummary,
  ProviderSummary,
  ReportInsights,
} from '@ninjapaw/contracts';
import { emptyInsights, uniqueRepositories } from '@ninjapaw/contracts';
import {
  azureRemediation,
  azureSourceScope,
  collectAzureDevOps,
  summarizeAzureDevOps,
  preflightAzureDevOps,
} from '../services/azure-devops.js';
import {
  collectGitHub,
  githubRemediation,
  githubSourceScope,
  preflightGitHub,
  summarizeGitHub,
} from '../services/github.js';
import { saveReport } from './report-store.js';
import { buildAzureDevOpsCostEstimates, buildGitHubCostEstimates } from './billing-estimates.js';

export async function createCombinedReport(sources: MultiSource[]) {
  const collection = await collectSources(sources);
  return saveReport({
    provider: 'combined',
    subject: 'combined-report',
    organization: 'multiple',
    plans: ['combined'],
    sourceApiVersion: 'multiple',
    azureDevOpsCommitters: collection.azureDevOpsCommitters,
    gitHubCommitters: collection.gitHubCommitters,
    insights: collection.insights,
    sourceStatuses: collection.statuses,
    executiveSummary: collection.summary,
    providerSummaries: collection.providerSummaries,
    costEstimates: [
      ...(collection.providerSummaries.some(
        (summary) => summary.provider === 'azure-devops' && summary.includedSources > 0,
      )
        ? buildAzureDevOpsCostEstimates(
            collection.azureDevOpsCommitters,
            sources.flatMap((source) =>
              source.provider === 'azure-devops' &&
              collection.statuses.some(
                (status) =>
                  status.provider === 'azure-devops' &&
                  status.subject === source.organization &&
                  status.status === 'included',
              )
                ? source.plans
                : [],
            ),
          )
        : []),
      ...(collection.providerSummaries.some(
        (summary) => summary.provider === 'github' && summary.includedSources > 0,
      )
        ? buildGitHubCostEstimates(
            collection.gitHubCommitters,
            collection.providerSummaries.find((summary) => summary.provider === 'github'),
          )
        : []),
    ],
    warnings: [
      'Skipped sources are excluded from totals and listed with remediation guidance.',
      'Cross-provider identities are not automatically merged.',
    ],
  });
}

export interface CombinedCollection {
  insights: ReportInsights;
  statuses: SourceStatus[];
  azureDevOpsCommitters: AzureDevOpsCommitter[];
  gitHubCommitters: GitHubCommitter[];
  summary: ExecutiveSummary;
  providerSummaries: ProviderSummary[];
}

function remediation(provider: MultiSource['provider'], error: unknown): SourceStatus {
  const message = error instanceof Error ? error.message : 'The provider returned an error.';
  const authentication = /sign in|authentication|expired|401/i.test(message);
  const permission = /denied|permission|403|authorize/i.test(message);
  const notFound = /not found|404|accessible/i.test(message);
  return {
    provider,
    subject: '',
    status: 'skipped',
    committerCount: 0,
    reason: authentication
      ? 'Authentication required'
      : permission
        ? 'Minimum read permission not met'
        : notFound
          ? 'Source not found or not accessible'
          : 'Provider request failed',
    remediation:
      provider === 'azure-devops'
        ? azureRemediation(authentication)
        : githubRemediation(authentication),
  };
}

function subject(source: MultiSource): string {
  return source.provider === 'azure-devops' ? source.organization : source.target;
}

function scope(source: MultiSource): string {
  return source.provider === 'azure-devops' ? azureSourceScope(source) : githubSourceScope(source);
}

function sourceStatus(source: MultiSource, result: number | SourceStatus): SourceStatus {
  return {
    ...(typeof result === 'number'
      ? { provider: source.provider, status: 'included' as const, committerCount: result }
      : result),
    subject: subject(source),
    scope: scope(source),
  };
}

export async function preflightSources(sources: MultiSource[]): Promise<SourceStatus[]> {
  const statuses: SourceStatus[] = [];
  for (const source of sources) {
    const access = emptyInsights();
    try {
      if (source.provider === 'azure-devops') {
        await preflightAzureDevOps(source, access);
      } else {
        await preflightGitHub(source);
      }
      const status = sourceStatus(source, 0);
      if (source.provider === 'azure-devops') {
        status.accessChecks = access.checks;
        status.reason = access.checks.some(
          (check) => check.status === 'partial' || check.status === 'unavailable',
        )
          ? 'Partial data access'
          : 'Selected data reads succeeded';
      }
      statuses.push(status);
    } catch (error) {
      const status = sourceStatus(source, remediation(source.provider, error));
      if (source.provider === 'azure-devops') status.accessChecks = access.checks;
      statuses.push(status);
    }
  }
  return statuses;
}

export async function collectSources(sources: MultiSource[]): Promise<CombinedCollection> {
  const insights = emptyInsights();
  const statuses: SourceStatus[] = [];
  const azureDevOpsCommitters: AzureDevOpsCommitter[] = [];
  const gitHubCommitters: GitHubCommitter[] = [];

  for (const source of sources) {
    try {
      if (source.provider === 'azure-devops') {
        const committers = await collectAzureDevOps(source, insights);
        azureDevOpsCommitters.push(...committers);
        statuses.push(sourceStatus(source, committers.length));
      } else {
        const committers = await collectGitHub(source, insights);
        gitHubCommitters.push(...committers);
        statuses.push(sourceStatus(source, committers.length));
      }
    } catch (error) {
      statuses.push(sourceStatus(source, remediation(source.provider, error)));
    }
  }

  const includedSources = statuses.filter((status) => status.status === 'included').length;
  if (includedSources === 0)
    throw new Error('None of the selected sources passed minimum permission checks.');
  const providerSummaries = [
    ...(sources.some((source) => source.provider === 'azure-devops')
      ? [summarizeAzureDevOps(azureDevOpsCommitters, statuses)]
      : []),
    ...(sources.some((source) => source.provider === 'github')
      ? [summarizeGitHub(gitHubCommitters, statuses)]
      : []),
  ];
  return {
    insights: { ...insights, repositories: uniqueRepositories(insights.repositories) },
    statuses,
    azureDevOpsCommitters,
    gitHubCommitters,
    providerSummaries,
    summary: {
      requestedSources: sources.length,
      includedSources,
      skippedSources: statuses.length - includedSources,
      azureIdentityRecords: azureDevOpsCommitters.length,
      gitHubIdentityRecords: gitHubCommitters.length,
      uniqueProviderIdentities: providerSummaries.reduce(
        (total, summary) => total + summary.uniqueIdentities,
        0,
      ),
    },
  };
}
