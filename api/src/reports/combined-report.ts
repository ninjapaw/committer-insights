import type {
  AzureDevOpsCommitter,
  GitHubCommitter,
  MultiSource,
  SourceStatus,
  ExecutiveSummary,
  ProviderSummary,
} from '@ninjapaw/contracts';
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
    sourceStatuses: collection.statuses,
    executiveSummary: collection.summary,
    providerSummaries: collection.providerSummaries,
    costEstimates: [
      ...buildAzureDevOpsCostEstimates(collection.azureDevOpsCommitters),
      ...buildGitHubCostEstimates(
        collection.gitHubCommitters,
        collection.providerSummaries.find((summary) => summary.provider === 'github'),
      ),
    ],
    warnings: [
      'Skipped sources are excluded from totals and listed with remediation guidance.',
      'Cross-provider identities are not automatically merged.',
    ],
  });
}

export interface CombinedCollection {
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

export async function preflightSources(sources: MultiSource[]): Promise<SourceStatus[]> {
  const statuses: SourceStatus[] = [];
  for (const source of sources) {
    try {
      if (source.provider === 'azure-devops') {
        await preflightAzureDevOps(source);
      } else {
        await preflightGitHub(source);
      }
      statuses.push({
        provider: source.provider,
        subject: subject(source),
        scope: scope(source),
        status: 'included',
        committerCount: 0,
      });
    } catch (error) {
      statuses.push({
        ...remediation(source.provider, error),
        subject: subject(source),
        scope: scope(source),
      });
    }
  }
  return statuses;
}

export async function collectSources(sources: MultiSource[]): Promise<CombinedCollection> {
  const statuses: SourceStatus[] = [];
  const azureDevOpsCommitters: AzureDevOpsCommitter[] = [];
  const gitHubCommitters: GitHubCommitter[] = [];

  for (const source of sources) {
    try {
      if (source.provider === 'azure-devops') {
        const committers = await collectAzureDevOps(source);
        azureDevOpsCommitters.push(...committers);
        statuses.push({
          provider: source.provider,
          subject: source.organization,
          scope: scope(source),
          status: 'included',
          committerCount: committers.length,
        });
      } else {
        const committers = await collectGitHub(source);
        gitHubCommitters.push(...committers);
        statuses.push({
          provider: source.provider,
          subject: source.target,
          scope: scope(source),
          status: 'included',
          committerCount: committers.length,
        });
      }
    } catch (error) {
      statuses.push({
        ...remediation(source.provider, error),
        subject: subject(source),
        scope: scope(source),
      });
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
