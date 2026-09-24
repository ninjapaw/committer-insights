import type { ColumnDef } from '@tanstack/react-table';
import type { AzureDevOpsDisplayCommitter, DeviceSignInState } from '@ninjapaw/contracts';
import { postJson, requestJson } from '../services/local-api';

export function connectAzure() {
  return postJson<DeviceSignInState>('/api/auth/sign-in');
}

export function disconnectAzure() {
  return postJson<{ authenticated: boolean }>('/api/auth/sign-out');
}

export function startDeviceSignIn() {
  return postJson<DeviceSignInState>('/api/auth/device-code');
}

export function startAzureCliSignIn() {
  return postJson<DeviceSignInState>('/api/auth/azure-cli');
}

export function getDeviceSignIn(id: string) {
  return requestJson<DeviceSignInState>(`/api/auth/device-code/${encodeURIComponent(id)}`);
}

export function cancelDeviceSignIn(id: string) {
  return requestJson<DeviceSignInState>(`/api/auth/device-code/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    keepalive: true,
  });
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
