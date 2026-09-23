import type { ColumnDef } from '@tanstack/react-table';
import {
  azureDevOpsPlanSchema,
  type AzureDevOpsCommitter,
  type ReportRequest,
} from '@ninjapaw/contracts';
import { postJson, requestJson } from '../services/local-api';

export const azurePlans = azureDevOpsPlanSchema.options;

export function connectAzure() {
  return postJson<{ authenticated: boolean }>('/api/auth/sign-in');
}

export async function discoverOrganizations() {
  const result = await requestJson<{
    organizations: Array<{ id: string; name: string; url: string }>;
  }>('/api/connections/azure-devops/organizations');
  return result.organizations;
}

export async function validateOrganization(organization: string) {
  const result = await postJson<{ organization: string }>(
    '/api/connections/azure-devops/validate',
    { organization },
  );
  return result.organization;
}

export function createAzureReport(input: Pick<ReportRequest, 'organization' | 'plans'>) {
  return postJson<{ reportId: string }>('/api/reports/azure-devops', {
    ...input,
    resultTypes: ['estimated'],
  });
}

export const azureColumns: ColumnDef<AzureDevOpsCommitter>[] = [
  { accessorKey: 'displayName', header: 'Display name' },
  { accessorKey: 'userPrincipalName', header: 'User principal name' },
  { accessorKey: 'organization', header: 'Organization' },
  { accessorKey: 'resultType', header: 'Result type' },
  { accessorKey: 'plan', header: 'Effective plan' },
  { accessorKey: 'cuid', header: 'CUID' },
  { accessorKey: 'identityId', header: 'Identity ID' },
  { accessorKey: 'collectedAt', header: 'Collected at' },
];
