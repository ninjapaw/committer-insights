import { describe, expect, it } from 'vitest';
import { matchIdentities } from '../../src/reports/identity-matching.js';
import type { AzureDevOpsCommitter, GitHubCommitter } from '@ninjapaw/contracts';

const collectedAt = new Date().toISOString();

function ado(overrides: Partial<AzureDevOpsCommitter> = {}): AzureDevOpsCommitter {
  return {
    provider: 'azure-devops',
    organization: 'contoso',
    plan: 'codeSecurity',
    resultType: 'estimated',
    displayName: 'Jane Doe',
    userPrincipalName: 'jane.doe@contoso.com',
    isEstimated: true,
    isLicensed: false,
    collectedAt,
    sourceApiVersion: '7.2-preview.3',
    ...overrides,
  };
}

function gh(overrides: Partial<GitHubCommitter> = {}): GitHubCommitter {
  return {
    provider: 'github',
    userLogin: 'jdoe',
    organization: 'contoso',
    repository: 'repo1',
    organizationRepository: 'contoso/repo1',
    lastPushedEmail: 'jane.doe@contoso.com',
    collectedAt,
    ...overrides,
  };
}

describe('matchIdentities', () => {
  it('auto-matches on exact normalized email/UPN', () => {
    const [combined] = matchIdentities([ado()], [gh()]);
    expect(combined?.matchStatus).toBe('matched');
    expect(combined?.matchMethod).toBe('exact-email');
    expect(combined?.matchConfidence).toBe(1);
  });

  it('does not auto-merge on GitHub noreply email alone', () => {
    const [combined] = matchIdentities(
      [ado({ userPrincipalName: 'someone.else@contoso.com' })],
      [gh({ lastPushedEmail: '12345+jdoe@users.noreply.github.com' })],
    );
    expect(combined?.matchStatus).toBe('review-required');
    expect(combined?.matchMethod).toBe('github-login-candidate');
    expect(combined?.reviewRequired).toBe(true);
  });

  it('never merges purely on display name similarity', () => {
    const result = matchIdentities(
      [ado({ displayName: 'Jane Doe', userPrincipalName: 'jdoe@contoso.com' })],
      [gh({ userLogin: 'janedoe', lastPushedEmail: 'totally-different@example.com' })],
    );
    const matched = result.find((r) => r.matchStatus === 'matched');
    expect(matched).toBeUndefined();
  });

  it('honors an administrator-approved alias', () => {
    const aliasMap = { gitHubLoginToUpn: new Map([['jdoe', 'jane.doe@contoso.com']]) };
    const [combined] = matchIdentities([ado()], [gh({ lastPushedEmail: undefined })], aliasMap);
    expect(combined?.matchMethod).toBe('approved-alias');
    expect(combined?.matchStatus).toBe('matched');
  });
});
