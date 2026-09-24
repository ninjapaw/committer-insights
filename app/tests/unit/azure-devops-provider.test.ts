import { describe, expect, it } from 'vitest';
import type { AzureDevOpsCommitter } from '@ninjapaw/contracts';
import { uniqueAzureDevOpsCommitters } from '@ninjapaw/contracts';

function committer(plan: AzureDevOpsCommitter['plan']): AzureDevOpsCommitter {
  return {
    provider: 'azure-devops',
    organization: 'ninjapaws',
    plan,
    resultType: 'estimated',
    cuid: '25d8699f-2560-749f-9f08-13a5e8fae976',
    identityId: '25d8699f-2560-649f-9f08-13a5e8fae976',
    descriptor: 'aad.example',
    displayName: 'Dr Bill McIlhargey',
    userPrincipalName: 'bill.mcilhargey@ninjapaws.org',
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
        displayName: 'Dr Bill McIlhargey',
        userPrincipalName: 'bill.mcilhargey@ninjapaws.org',
        plan: 'Code Security, Secret Protection',
        billableCommitter: 'Estimated',
      },
    ]);
  });
});
