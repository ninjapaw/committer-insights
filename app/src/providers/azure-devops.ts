import type { ColumnDef } from '@tanstack/react-table';
import type { AzureDevOpsDisplayCommitter } from '@ninjapaw/contracts';
import { postJson, requestJson } from '../services/local-api';

export function connectAzure() {
  return postJson<{ authenticated: boolean }>('/api/auth/sign-in');
}

export async function discoverOrganizations() {
  const result = await requestJson<{
    organizations: Array<{ id: string; name: string; url: string }>;
  }>('/api/connections/azure-devops/organizations');
  return result.organizations;
}

export const azureColumns: ColumnDef<AzureDevOpsDisplayCommitter>[] = [
  { accessorKey: 'displayName', header: 'Display name' },
  { accessorKey: 'userPrincipalName', header: 'User principal name' },
  { accessorKey: 'organization', header: 'Organization' },
  { accessorKey: 'resultType', header: 'Result type' },
  { accessorKey: 'plan', header: 'Effective plans' },
  { accessorKey: 'billableCommitter', header: 'Billing status' },
  { accessorKey: 'cuid', header: 'CUID' },
  { accessorKey: 'identityId', header: 'Identity ID' },
  { accessorKey: 'collectedAt', header: 'Collected at' },
];
