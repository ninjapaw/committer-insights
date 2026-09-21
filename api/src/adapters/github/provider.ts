import type { GitHubCommitter } from '@ninjapaw/contracts';

/**
 * GitHub provider adapter interface. No production OAuth is implemented yet;
 * this exists so the contracts, UI, and export paths are ready once a
 * GitHub App is registered and FEATURE_GITHUB_PROVIDER is enabled.
 */
export interface GitHubProviderAdapter {
  isEnabled(): boolean;
  fetchCommitters(organization: string): Promise<GitHubCommitter[]>;
}

export class DisabledGitHubProviderAdapter implements GitHubProviderAdapter {
  isEnabled(): boolean {
    return false;
  }

  async fetchCommitters(): Promise<GitHubCommitter[]> {
    throw new Error('GitHub provider is not enabled. Set FEATURE_GITHUB_PROVIDER=true after GitHub App setup.');
  }
}
