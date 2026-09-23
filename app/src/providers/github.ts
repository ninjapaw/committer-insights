import type { ColumnDef } from '@tanstack/react-table';
import type { GitHubCommitter } from '@ninjapaw/contracts';
import { postJson, requestJson } from '../services/local-api';

export function connectGitHub() {
  return postJson<{ viewer: { login: string; name?: string } }>('/api/auth/github/sign-in');
}

export async function discoverRepositories() {
  const result = await requestJson<{
    repositories: Array<{ id: string; name: string; url: string; private: boolean }>;
  }>('/api/connections/github/repositories');
  return result.repositories;
}

export function createGitHubReport(input: { repository: string; sinceDays: number }) {
  return postJson<{ reportId: string }>('/api/reports/github', input);
}

export const githubColumns: ColumnDef<GitHubCommitter>[] = [
  { accessorKey: 'login', header: 'Login' },
  { accessorKey: 'displayName', header: 'Display name' },
  { accessorKey: 'repository', header: 'Repository' },
  { accessorKey: 'commitCount', header: 'Commit count' },
  { accessorKey: 'lastCommitAt', header: 'Last commit at' },
  { accessorKey: 'profileUrl', header: 'Profile URL' },
];

export const commitWindows = [30, 90, 180, 365] as const;
