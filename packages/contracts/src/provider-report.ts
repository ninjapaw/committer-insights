import type { MultiSource, Report } from './index.js';

export const reportProviderNames = {
  'azure-devops': 'Azure DevOps',
  github: 'GitHub Enterprise',
} as const;

export function providerReport(report: Report, provider: MultiSource['provider']): Report {
  const summary = report.providerSummaries?.find((item) => item.provider === provider);
  const sourceStatuses = report.sourceStatuses?.filter((item) => item.provider === provider);
  const ownSummary = report.provider === provider ? report.executiveSummary : undefined;
  const azureDevOpsCommitters = provider === 'azure-devops' ? report.azureDevOpsCommitters : [];
  const gitHubCommitters = provider === 'github' ? report.gitHubCommitters : [];
  const includedSources =
    sourceStatuses?.filter((item) => item.status === 'included').length ??
    summary?.includedSources ??
    ownSummary?.includedSources ??
    0;
  const skippedSources =
    sourceStatuses?.filter((item) => item.status === 'skipped').length ??
    summary?.skippedSources ??
    ownSummary?.skippedSources ??
    0;
  return {
    ...report,
    provider,
    subject: reportProviderNames[provider],
    organization:
      sourceStatuses?.map((item) => item.subject).join(', ') ||
      (report.provider === provider ? report.organization : ''),
    plans:
      provider === 'azure-devops'
        ? [...new Set(azureDevOpsCommitters.map((item) => item.plan))]
        : [],
    sourceApiVersion:
      summary?.apiVersion ??
      (report.provider === provider ? report.sourceApiVersion : 'Not recorded'),
    azureDevOpsCommitters,
    gitHubCommitters,
    sourceStatuses,
    providerSummaries: summary ? [summary] : [],
    executiveSummary: {
      requestedSources: includedSources + skippedSources,
      includedSources,
      skippedSources,
      azureIdentityRecords:
        provider === 'azure-devops'
          ? (summary?.identityRecords ??
            ownSummary?.azureIdentityRecords ??
            azureDevOpsCommitters.length)
          : 0,
      gitHubIdentityRecords:
        provider === 'github'
          ? (summary?.identityRecords ??
            ownSummary?.gitHubIdentityRecords ??
            gitHubCommitters.length)
          : 0,
      uniqueProviderIdentities:
        summary?.uniqueIdentities ??
        ownSummary?.uniqueProviderIdentities ??
        (provider === 'github'
          ? new Set(gitHubCommitters.map((item) => item.userId ?? item.login)).size
          : new Set(
              azureDevOpsCommitters.map(
                (item, index) =>
                  item.identityId ?? item.cuid ?? item.descriptor ?? `unresolved-${index}`,
              ),
            ).size),
    },
    costEstimates: report.costEstimates?.filter((item) => item.provider === provider),
    insights: report.insights
      ? {
          ...(provider === 'github' && report.insights.githubBilling
            ? { githubBilling: report.insights.githubBilling }
            : {}),
          ...(provider === 'azure-devops' && report.insights.azureBilling
            ? { azureBilling: report.insights.azureBilling }
            : {}),
          repositories: report.insights.repositories.filter((item) => item.provider === provider),
          billing: report.insights.billing.filter((item) => item.provider === provider),
          checks: report.insights.checks.filter((item) => item.provider === provider),
        }
      : undefined,
    warnings: [],
  };
}
