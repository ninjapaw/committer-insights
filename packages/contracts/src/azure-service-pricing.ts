import { z } from 'zod';
import type { InsightTable } from './insights.js';

const count = z.number().int().min(0).max(1_000_000_000);
const usage = z.number().finite().min(0).max(1_000_000_000);
export const azureServiceScenarioSchema = z
  .object({
    basicUsers: count.optional(),
    basicFreeUsers: count.max(5).default(5),
    testPlanUsers: count.optional(),
    hostedPaidJobs: count.optional(),
    selfHostedPaidJobs: count.optional(),
    artifactGiB: usage.optional(),
    macStandardMinutes: usage.optional(),
    macXlMinutes: usage.optional(),
    aiCredits: usage.optional(),
  })
  .strict();
export type AzureServiceScenario = z.infer<typeof azureServiceScenarioSchema>;
export interface AzureServiceEstimate {
  organization: string;
  inputs: AzureServiceScenario;
}

export const azureServicePriceSource =
  'https://azure.microsoft.com/en-us/pricing/details/devops/azure-devops-services/';
export const azureServicePricingNote =
  'User-entered what-if quantities, not provider-observed usage or invoices. USD list prices checked 2026-09-24. Blank quantities are unknown, not zero. Basic users exclude Basic + Test Plans and users already covered by qualifying Visual Studio/GitHub Enterprise benefits; the free Basic allowance must be allocated correctly for the billing scope. Test Plans seats exclude qualifying included licenses and already include Basic. Pipeline quantities are paid parallel jobs, not runs or minutes; a first paid Microsoft-hosted job replaces the free job rather than adding a second. The free Microsoft-hosted grant (if approved) allows one job/1,800 minutes; self-hosted free capacity and subscriber benefits must be accounted for before entering paid jobs. Artifacts uses progressive GiB tiers per organization and assumes constant storage for a full month. AI credits are billable credits after applicable benefits, not requests. No tax, contract discounts, proration, or additional infrastructure costs. Annualized is 12 unchanged months, not a forecast. Do not sum organizations without checking shared licenses and allowances; security estimates and billing snapshots are separate and are not added here.';

export const azureServiceFields = [
  { key: 'basicUsers', label: 'Basic users without included licenses', step: 1 },
  { key: 'basicFreeUsers', label: 'Free Basic seats allocated (0-5)', step: 1 },
  { key: 'testPlanUsers', label: 'Paid Basic + Test Plans users', step: 1 },
  { key: 'hostedPaidJobs', label: 'Paid Microsoft-hosted parallel jobs', step: 1 },
  { key: 'selfHostedPaidJobs', label: 'Paid self-hosted parallel jobs', step: 1 },
  { key: 'artifactGiB', label: 'Artifacts total storage (GiB)', step: 'any' },
  { key: 'macStandardMinutes', label: 'GitHub-hosted macOS Standard minutes/month', step: 'any' },
  { key: 'macXlMinutes', label: 'GitHub-hosted macOS XL minutes/month', step: 'any' },
  { key: 'aiCredits', label: 'Billable GitHub AI credits/month', step: 'any' },
] as const;

export function azureServicePricingTables(estimates: AzureServiceEstimate[]): InsightTable[] {
  if (!estimates.length) return [];
  const rows: InsightTable['rows'] = [];
  for (const estimate of estimates) {
    const inputs = azureServiceScenarioSchema.parse(estimate.inputs);
    const add = (
      product: string,
      quantity: number | undefined,
      unit: string,
      formula: string,
      monthly: number,
    ) => {
      rows.push([
        estimate.organization,
        product,
        quantity ?? 'Unknown',
        unit,
        quantity === undefined ? 'Quantity required' : formula,
        quantity === undefined ? 'Unavailable' : `$${monthly.toFixed(2)}`,
        quantity === undefined ? 'Unavailable' : `$${(monthly * 12).toFixed(2)}`,
        quantity === undefined ? 'Missing scenario input' : 'User-entered what-if',
        '2026-09-24',
        azureServicePriceSource,
      ]);
    };
    add(
      'Basic',
      inputs.basicUsers,
      'users',
      `max(0, ${inputs.basicUsers} - ${inputs.basicFreeUsers} free) x $6`,
      Math.max(0, (inputs.basicUsers ?? 0) - inputs.basicFreeUsers) * 6,
    );
    const linear = [
      ['Basic + Test Plans', 'testPlanUsers', 'users', 52],
      ['Pipelines: Microsoft-hosted', 'hostedPaidJobs', 'paid parallel jobs', 40],
      ['Pipelines: self-hosted', 'selfHostedPaidJobs', 'paid parallel jobs', 15],
      ['Pipelines: GitHub-hosted macOS Standard', 'macStandardMinutes', 'minutes/month', 0.062],
      ['Pipelines: GitHub-hosted macOS XL', 'macXlMinutes', 'minutes/month', 0.102],
      ['GitHub AI Credits for Azure DevOps', 'aiCredits', 'billable credits/month', 0.01],
    ] as const;
    for (const [product, key, unit, rate] of linear) {
      const quantity = inputs[key];
      add(product, quantity, unit, `${quantity} x $${rate}`, (quantity ?? 0) * rate);
    }
    const storage = inputs.artifactGiB ?? 0;
    // Charge each storage band once; the marginal rate is not applied to all GiB.
    const bands = [
      [Math.min(Math.max(storage - 2, 0), 8), 2],
      [Math.min(Math.max(storage - 10, 0), 90), 1],
      [Math.min(Math.max(storage - 100, 0), 900), 0.5],
      [Math.max(storage - 1000, 0), 0.25],
    ] as const;
    add(
      'Artifacts',
      inputs.artifactGiB,
      'GiB',
      `2 GiB free; ${bands.map(([quantity, rate]) => `${quantity} x $${rate}`).join(' + ')}`,
      bands.reduce((total, [quantity, rate]) => total + quantity * rate, 0),
    );
  }
  return [
    {
      title: 'Azure DevOps other services: what-if estimates',
      columns: [
        'Organization',
        'Service / plan',
        'Scenario quantity',
        'Unit',
        'Monthly calculation',
        'Estimated monthly USD',
        'Annualized USD',
        'Basis',
        'Prices checked UTC',
        'Price source',
      ],
      rows,
    },
    {
      title: 'Azure DevOps service pricing assumptions',
      columns: ['Scope', 'Assumptions'],
      rows: [['Other Azure DevOps services', azureServicePricingNote]],
    },
  ];
}
