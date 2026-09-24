import type { ColumnDef } from '@tanstack/react-table';
import type { GitHubCommitter, GitHubTargetType } from '@ninjapaw/contracts';
import { postJson, requestJson } from '../services/local-api';

export interface GitHubTargetOption {
  id: string;
  name: string;
  targetType: GitHubTargetType;
  url?: string;
}

export function connectGitHub() {
  return postJson<{ viewer: { login: string; name?: string } }>('/api/auth/github/sign-in');
}

export async function discoverGitHubTargets() {
  const result = await requestJson<{
    targets: GitHubTargetOption[];
  }>('/api/connections/github/targets');
  return result.targets;
}

export function createGitHubReport(input: {
  targetType: GitHubTargetType;
  target: string;
  sinceDays: number;
}) {
  return postJson<{ reportId: string }>('/api/reports/github', input);
}

export const githubColumns: ColumnDef<GitHubCommitter>[] = [
  { accessorKey: 'login', header: 'Login' },
  { accessorKey: 'displayName', header: 'Display name' },
  { accessorKey: 'repository', header: 'Repository' },
  { id: 'billableCommitter', header: 'Billable committer', accessorFn: () => 'No' },
  { accessorKey: 'commitCount', header: 'Commit count' },
  { accessorKey: 'lastCommitAt', header: 'Last commit at' },
  { accessorKey: 'profileUrl', header: 'Profile URL' },
];

export const commitWindows = [30, 90, 180, 365] as const;
