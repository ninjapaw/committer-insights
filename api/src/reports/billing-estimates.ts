import type {
  AzureDevOpsCommitter,
  CostEstimateLineItem,
  GitHubCommitter,
  ProviderSummary,
} from '@ninjapaw/contracts';
import { uniqueAzureDevOpsCommitters } from '../exports/azure-devops-display.js';

export const PUBLIC_PRICE_ASSUMPTIONS = {
  azureDevOpsAdvancedSecurityPerCommitterUsd: 49,
  githubAdvancedSecurityPerCommitterUsd: 49,
  githubEnterprisePerUserUsd: 21,
} as const;

function monthly(count: number, unitPriceUsd: number): number {
  return count * unitPriceUsd;
}

export function buildAzureDevOpsCostEstimates(
  committers: AzureDevOpsCommitter[],
): CostEstimateLineItem[] {
  const billableCommitters = uniqueAzureDevOpsCommitters(committers).filter(
    (committer) => committer.billableCommitter === 'Yes',
  ).length;
  return [
    {
      provider: 'azure-devops',
      label: 'Azure DevOps Advanced Security billable committers',
      count: billableCommitters,
      unitPriceUsd: PUBLIC_PRICE_ASSUMPTIONS.azureDevOpsAdvancedSecurityPerCommitterUsd,
      estimatedMonthlyCostUsd: monthly(
        billableCommitters,
        PUBLIC_PRICE_ASSUMPTIONS.azureDevOpsAdvancedSecurityPerCommitterUsd,
      ),
      basis:
        'Unique identities returned by the Azure DevOps Advanced Security meter-usage-estimate API across selected plans.',
      source: 'Public list-price assumption: USD 49 per active committer/month.',
    },
  ];
}

export function buildGitHubCostEstimates(
  committers: GitHubCommitter[],
  summary?: ProviderSummary,
): CostEstimateLineItem[] {
  const activeCommitters = summary?.uniqueIdentities ?? committers.length;
  return [
    {
      provider: 'github',
      label: 'GitHub Enterprise observed users',
      count: activeCommitters,
      unitPriceUsd: PUBLIC_PRICE_ASSUMPTIONS.githubEnterprisePerUserUsd,
      estimatedMonthlyCostUsd: monthly(
        activeCommitters,
        PUBLIC_PRICE_ASSUMPTIONS.githubEnterprisePerUserUsd,
      ),
      basis:
        'Observed non-bot GitHub committers in the selected organization or enterprise report window. This is not a full enterprise member directory count.',
      source: 'Public list-price assumption: USD 21 per Enterprise user/month.',
    },
    {
      provider: 'github',
      label: 'GitHub Advanced Security estimated active committers',
      count: activeCommitters,
      unitPriceUsd: PUBLIC_PRICE_ASSUMPTIONS.githubAdvancedSecurityPerCommitterUsd,
      estimatedMonthlyCostUsd: monthly(
        activeCommitters,
        PUBLIC_PRICE_ASSUMPTIONS.githubAdvancedSecurityPerCommitterUsd,
      ),
      basis:
        'Observed non-bot active committers across visible repositories in the selected report window. Validate against GitHub billing before making purchasing decisions.',
      source: 'Public list-price assumption: USD 49 per active committer/month.',
    },
  ];
}
