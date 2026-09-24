import type { ColumnDef } from '@tanstack/react-table';
import {
  getGitHubContributions,
  formatReportDateTime,
  reportingWindows,
  type GitHubCommitter,
  type GitHubSourceOption,
  type GitHubCliAccount,
  type GitHubSignInState,
} from '@ninjapaw/contracts';
import { postJson, requestJson } from '../services/local-api';

export function connectGitHub(login?: string) {
  return postJson<{ viewer: { login: string; name?: string } }>(
    '/api/auth/github/sign-in',
    login ? { login } : undefined,
  );
}

export async function listGitHubAccounts() {
  return (await requestJson<{ accounts: GitHubCliAccount[] }>('/api/auth/github/accounts'))
    .accounts;
}

export function disconnectGitHub() {
  return postJson<{ authenticated: boolean }>('/api/auth/github/sign-out');
}

export function startGitHubSignIn(mode: 'browser' | 'device-code' = 'browser') {
  return postJson<GitHubSignInState>(`/api/auth/github/${mode}`);
}

export function getGitHubSignIn(id: string) {
  return requestJson<GitHubSignInState>(`/api/auth/github/browser/${encodeURIComponent(id)}`);
}

export function cancelGitHubSignIn(id: string) {
  return requestJson<GitHubSignInState>(`/api/auth/github/browser/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function discoverGitHubTargets() {
  const result = await requestJson<{
    targets: GitHubSourceOption[];
  }>('/api/connections/github/targets');
  return result.targets;
}

export const githubColumnsForTimeZone = (timeZone = 'UTC'): ColumnDef<GitHubCommitter>[] => [
  { accessorKey: 'login', header: 'Login' },
  { accessorKey: 'displayName', header: 'Display name' },
  {
    id: 'repositoryCount',
    header: 'Repositories contributed to',
    accessorFn: (row) => getGitHubContributions(row).length || 'Unavailable',
  },
  { id: 'billableCommitter', header: 'Billing status', accessorFn: () => 'Unknown' },
  { accessorKey: 'commitCount', header: 'Commit count' },
  {
    accessorKey: 'lastCommitAt',
    header: `Last commit (${timeZone})`,
    cell: ({ row }) => formatReportDateTime(row.original.lastCommitAt, timeZone),
  },
  { accessorKey: 'profileUrl', header: 'Profile URL' },
];

export const githubColumns = githubColumnsForTimeZone();
export const commitWindows = reportingWindows;
