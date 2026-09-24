import {
  azureDevOpsCommitterSchema,
  gitHubCommitterSchema,
  sourceStatusSchema,
  reportingWindow,
  mergeDailyActivity,
} from '@ninjapaw/contracts';
import {
  buildAzureDevOpsCostEstimates,
  buildGitHubCostEstimates,
} from '../api/dist/src/reports/billing-estimates.js';
import { buildProviderSummary } from '../api/dist/src/reports/provider-summary.js';

export const demoDate = '2026-09-24T12:00:00.000Z';
const azureSource = 'synthetic-ci-demo-azure';
const githubSource = 'synthetic-ci-demo-github';
const window = reportingWindow(90, new Date(demoDate));

function activity(index) {
  return Array.from({ length: 90 }, (_, day) => {
    const date = new Date(window.from);
    date.setUTCDate(date.getUTCDate() + day);
    return {
      date: date.toISOString().slice(0, 10),
      commits: (day + index) % 7 < 5 ? (day * 3 + index) % 24 : 0,
    };
  });
}

export function createDemoReports() {
  const repositories = ['azure-devops', 'github'].flatMap((provider) =>
    ['portal', 'api', 'worker', 'archive'].map((name, index) => ({
      provider,
      source: provider === 'github' ? githubSource : azureSource,
      id: `${provider}-synthetic-${index}`,
      name: provider === 'github' ? `${githubSource}/${name}` : name,
      ...(provider === 'azure-devops' ? { project: 'Synthetic Project' } : {}),
      visibility: index === 0 ? 'public' : 'private',
      state: index === 3 ? 'archived' : 'active',
      observedAt: demoDate,
      features: [
        'Code Security',
        'Secret Protection',
        'Push protection',
        'Dependency scanning default setup',
      ].map((feature, featureIndex) => ({
        name: feature,
        state: ['enabled', 'disabled', 'unknown'][(index + featureIndex) % 3],
      })),
      activity: { status: 'complete', ...window, daily: index === 3 ? [] : activity(index) },
    })),
  );
  const azureDevOpsCommitters = Array.from({ length: 16 }, (_, index) =>
    ['codeSecurity', 'secretProtection'].map((plan) =>
      azureDevOpsCommitterSchema.parse({
        provider: 'azure-devops',
        organization: azureSource,
        plan,
        resultType: 'estimated',
        identityId: `synthetic-azure-user-${index + 1}`,
        displayName: `Sample Engineer ${index + 1}`,
        userPrincipalName: `engineer${index + 1}@example.test`,
        isEstimated: true,
        isLicensed: false,
        collectedAt: demoDate,
        sourceApiVersion: '7.2-preview.3',
      }),
    ),
  ).flat();
  const githubRepositories = repositories.filter(
    (repository) => repository.provider === 'github' && repository.state !== 'archived',
  );
  const gitHubCommitters = Array.from({ length: 18 }, (_, index) => {
    const contributions = githubRepositories
      .map((repository) => {
        const dailyActivity = repository.activity.daily
          .map((point) => ({
            date: point.date,
            commits: Math.floor(point.commits / 18) + (index < point.commits % 18 ? 1 : 0),
          }))
          .filter((point) => point.commits > 0);
        return {
          repository: repository.name,
          commitCount: dailyActivity.reduce((sum, point) => sum + point.commits, 0),
          lastCommitAt: `${dailyActivity.at(-1)?.date ?? '2026-09-24'}T10:00:00.000Z`,
          dailyActivity,
        };
      })
      .filter((contribution) => contribution.commitCount > 0);
    if (!contributions.length) return undefined;
    return gitHubCommitterSchema.parse({
      provider: 'github',
      repository: contributions[0].repository,
      userId: `synthetic-github-user-${index + 1}`,
      login: `sample-developer-${index + 1}`,
      displayName: `Sample Developer ${index + 1}`,
      profileUrl: `https://example.invalid/people/sample-developer-${index + 1}`,
      commitCount: contributions.reduce((sum, contribution) => sum + contribution.commitCount, 0),
      lastCommitAt: contributions
        .map((item) => item.lastCommitAt)
        .sort()
        .at(-1),
      dailyActivity: mergeDailyActivity(...contributions.map((item) => item.dailyActivity)),
      contributions,
      collectedAt: demoDate,
      sourceApiVersion: '2022-11-28',
    });
  }).filter(Boolean);
  const sourceStatuses = [
    sourceStatusSchema.parse({
      provider: 'azure-devops',
      subject: azureSource,
      status: 'included',
      committerCount: azureDevOpsCommitters.length,
      scope: 'Synthetic security estimates and repository activity',
    }),
    sourceStatusSchema.parse({
      provider: 'github',
      subject: githubSource,
      status: 'included',
      committerCount: gitHubCommitters.length,
      scope: 'Synthetic organization activity',
    }),
  ];
  const providerSummaries = ['azure-devops', 'github'].map((provider) =>
    buildProviderSummary(
      {
        provider,
        displayName: provider === 'github' ? 'GitHub' : 'Azure DevOps',
        sourceLabel: 'Synthetic organizations',
        measurement: 'Synthetic example data',
        apiVersion: provider === 'github' ? '2022-11-28' : '7.2-preview.3',
        methodology:
          'Deterministic fictional fixture. No provider API or customer account was used.',
      },
      provider === 'github'
        ? gitHubCommitters.map((item) => item.userId)
        : azureDevOpsCommitters.map((item) => item.identityId),
      sourceStatuses,
    ),
  );
  const complete = {
    reportId: 'synthetic-complete',
    provider: 'combined',
    subject: 'Synthetic example - complete collection',
    organization: 'synthetic-demo',
    plans: ['all'],
    generatedAt: demoDate,
    timeZone: 'UTC',
    sourceApiVersion: 'synthetic-fixture-v1',
    warnings: [
      'SYNTHETIC DEMO: all organizations, people, repositories and billing amounts are fictional. Not customer evidence or an invoice.',
    ],
    azureDevOpsCommitters,
    gitHubCommitters,
    sourceStatuses,
    providerSummaries,
    executiveSummary: {
      requestedSources: 2,
      includedSources: 2,
      skippedSources: 0,
      azureIdentityRecords: azureDevOpsCommitters.length,
      gitHubIdentityRecords: gitHubCommitters.length,
      uniqueProviderIdentities: 16 + gitHubCommitters.length,
    },
    costEstimates: [
      ...buildAzureDevOpsCostEstimates(azureDevOpsCommitters, ['all']),
      ...buildGitHubCostEstimates(gitHubCommitters, providerSummaries[1]),
    ],
    insights: {
      repositories,
      billing: githubRepositories.map((repository, index) => ({
        provider: 'github',
        source: githubSource,
        date: '2026-09-01',
        product: 'Synthetic Actions usage',
        sku: 'Synthetic Linux compute',
        repository: repository.name,
        quantity: 1000 * (index + 1),
        unit: 'minutes',
        grossUsd: 8 * (index + 1),
        discountUsd: index,
        netUsd: 8 * (index + 1) - index,
      })),
      checks: sourceStatuses.flatMap((source) =>
        ['Repository inventory', 'Repository activity', 'Security settings'].map((dataset) => ({
          provider: source.provider,
          source: source.subject,
          dataset,
          status: 'complete',
          detail: 'Synthetic fixture collected successfully; no live requests.',
        })),
      ),
    },
  };
  const partial = globalThis.structuredClone(complete);
  partial.reportId = 'synthetic-partial';
  partial.subject = 'Synthetic example - partial collection';
  partial.insights.repositories.find((item) => item.provider === 'github').activity = {
    status: 'unavailable',
    ...window,
    daily: [],
    reason: 'Synthetic permission-denied example.',
  };
  partial.insights.billing = [];
  partial.insights.checks.push(
    {
      provider: 'github',
      source: githubSource,
      dataset: 'Repository activity',
      status: 'partial',
      detail: 'Synthetic permission-denied example: one repository could not be read.',
    },
    {
      provider: 'github',
      source: githubSource,
      dataset: 'Billing usage',
      status: 'unavailable',
      detail: 'Synthetic account lacks billing access; missing usage is not zero cost.',
    },
  );
  partial.costEstimates = partial.costEstimates.filter((item) => item.provider !== 'github');
  partial.warnings.push(
    'GitHub cost scenarios omitted because collection is incomplete. Missing evidence is not zero usage.',
  );
  const empty = {
    ...globalThis.structuredClone(complete),
    reportId: 'synthetic-empty',
    subject: 'Synthetic example - no observations',
    azureDevOpsCommitters: [],
    gitHubCommitters: [],
    costEstimates: [],
    providerSummaries: [],
    sourceStatuses: [],
    executiveSummary: {
      requestedSources: 0,
      includedSources: 0,
      skippedSources: 0,
      azureIdentityRecords: 0,
      gitHubIdentityRecords: 0,
      uniqueProviderIdentities: 0,
    },
    insights: { repositories: [], billing: [], checks: [] },
  };
  return [complete, partial, empty];
}
