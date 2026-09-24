import type {
  AzureDevOpsCommitter,
  CostEstimateLineItem,
  GitHubCommitter,
  ProviderSummary,
} from '@ninjapaw/contracts';
export const PUBLIC_PRICE_ASSUMPTIONS = {
  codeSecurityPerCommitterUsd: 30,
  secretProtectionPerCommitterUsd: 19,
  githubEnterprisePerUserUsd: 21,
} as const;

function monthly(count: number, unitPriceUsd: number): number {
  return count * unitPriceUsd;
}

export function buildAzureDevOpsCostEstimates(
  committers: AzureDevOpsCommitter[],
  selectedPlans: string[] = committers.map((committer) => committer.plan),
): CostEstimateLineItem[] {
  const plans = [
    ['codeSecurity', 'Code Security', PUBLIC_PRICE_ASSUMPTIONS.codeSecurityPerCommitterUsd],
    [
      'secretProtection',
      'Secret Protection',
      PUBLIC_PRICE_ASSUMPTIONS.secretProtectionPerCommitterUsd,
    ],
  ] as const;
  return plans
    .filter(([plan]) => selectedPlans.includes('all') || selectedPlans.includes(plan))
    .map(([plan, label, price]) => {
      const count = new Set(
        committers
          .filter((committer) => committer.plan === plan || committer.plan === 'all')
          .map((committer, index) =>
            JSON.stringify([
              committer.organization.toLowerCase(),
              committer.identityId ||
                committer.cuid ||
                committer.descriptor ||
                `unresolved-${index}`,
            ]),
          ),
      ).size;
      return {
        provider: 'azure-devops',
        solution: plan,
        label: `Azure DevOps ${label} - estimated usage`,
        count,
        unitPriceUsd: price,
        estimatedMonthlyCostUsd: monthly(count, price),
        basis:
          'Identity rows returned by the preview estimate API, deduplicated per organization and product. Projects potential usage, not current enablement or invoiced seats. Missing identities and skipped sources are not included.',
        source:
          'USD per committer/month; checked 2026-09-24. https://azure.microsoft.com/en-us/pricing/details/devops/azure-devops-services/ . Excludes tax, discounts, proration, Basic/Test Plans, Pipelines, Artifacts and AI credits.',
      };
    });
}

export function buildGitHubCostEstimates(
  committers: GitHubCommitter[],
  summary?: ProviderSummary,
): CostEstimateLineItem[] {
  const activeCommitters = summary?.uniqueIdentities ?? committers.length;
  return [
    {
      provider: 'github',
      solution: 'enterprise',
      label: 'GitHub Enterprise - observed-user scenario',
      count: activeCommitters,
      unitPriceUsd: PUBLIC_PRICE_ASSUMPTIONS.githubEnterprisePerUserUsd,
      estimatedMonthlyCostUsd: monthly(
        activeCommitters,
        PUBLIC_PRICE_ASSUMPTIONS.githubEnterprisePerUserUsd,
      ),
      basis:
        'Observed non-bot GitHub committers in the selected organization or enterprise report window. This is not a full enterprise member directory count.',
      source:
        'Starting at USD 21 per user/month; checked 2026-09-24. https://github.com/pricing . Not a licensed-seat inventory; excludes contract terms, tax and discounts.',
    },
    {
      provider: 'github',
      solution: 'codeSecurity',
      label: 'GitHub Code Security - what-if scenario',
      count: activeCommitters,
      unitPriceUsd: PUBLIC_PRICE_ASSUMPTIONS.codeSecurityPerCommitterUsd,
      estimatedMonthlyCostUsd: monthly(
        activeCommitters,
        PUBLIC_PRICE_ASSUMPTIONS.codeSecurityPerCommitterUsd,
      ),
      basis:
        'Assumes all observed identities require this product. Actual billability is unknown: repository visibility, product enablement, membership and pushes in the last 90 days are not verified. Authored-date activity is not a billing meter.',
      source:
        'USD 30 per active committer/month; checked 2026-09-24. https://github.com/security/plans . Public GitHub.com security features may be free; excludes tax and discounts.',
    },
    {
      provider: 'github',
      solution: 'secretProtection',
      label: 'GitHub Secret Protection - what-if scenario',
      count: activeCommitters,
      unitPriceUsd: PUBLIC_PRICE_ASSUMPTIONS.secretProtectionPerCommitterUsd,
      estimatedMonthlyCostUsd: monthly(
        activeCommitters,
        PUBLIC_PRICE_ASSUMPTIONS.secretProtectionPerCommitterUsd,
      ),
      basis:
        'Assumes all observed identities require this product. Not confirmed billable usage; validate private/internal repository coverage, membership, product enablement and 90-day push activity.',
      source:
        'USD 19 per active committer/month; checked 2026-09-24. https://github.com/security/plans . Separate from Code Security; excludes tax and discounts.',
    },
  ];
}
