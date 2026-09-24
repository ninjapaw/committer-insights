import { describe, expect, it } from 'vitest';
import type { AzureDevOpsCommitter } from '@ninjapaw/contracts';
import { uniqueAzureDevOpsCommitters } from '@ninjapaw/contracts';

function committer(plan: AzureDevOpsCommitter['plan']): AzureDevOpsCommitter {
  return {
    provider: 'azure-devops',
    organization: 'example-org',
    plan,
    resultType: 'estimated',
    cuid: '11111111-1111-4111-8111-111111111111',
    identityId: '22222222-2222-4222-8222-222222222222',
    descriptor: 'aad.example',
    displayName: 'Dr Alex Example',
    userPrincipalName: 'alex@example.test',
    isEstimated: true,
    isLicensed: false,
    collectedAt: '2026-09-24T03:42:12.762Z',
    sourceApiVersion: '7.2-preview.3',
  };
}

describe('uniqueAzureDevOpsCommitters', () => {
  it('collapses the same identity across Advanced Security plans', () => {
    expect(
      uniqueAzureDevOpsCommitters([committer('codeSecurity'), committer('secretProtection')]),
    ).toMatchObject([
      {
        displayName: 'Dr Alex Example',
        userPrincipalName: 'alex@example.test',
        plan: 'Code Security, Secret Protection',
        billableCommitter: 'Estimated',
      },
    ]);
  });
});
