import { describe, expect, it, vi } from 'vitest';
import { discoverAzureDevOpsOrganizations } from '../../src/adapters/azure-devops/organizations-client.js';

describe('discoverAzureDevOpsOrganizations', () => {
  it('returns sorted organizations for the signed-in profile', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: 'member-id' }))
      .mockResolvedValueOnce(
        Response.json({
          value: [
            { accountId: '2', accountName: 'zeta' },
            { accountId: '1', accountName: 'alpha' },
          ],
        }),
      );

    await expect(
      discoverAzureDevOpsOrganizations('token', fetchImpl as typeof fetch),
    ).resolves.toEqual([
      { id: '1', name: 'alpha', url: 'https://dev.azure.com/alpha' },
      { id: '2', name: 'zeta', url: 'https://dev.azure.com/zeta' },
    ]);
    expect(fetchImpl.mock.calls[1]?.[0].toString()).toContain('memberId=member-id');
  });

  it('rejects malformed account responses', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(Response.json({ id: 'member-id' }))
      .mockResolvedValueOnce(Response.json({ value: [{ accountName: 'missing-id' }] }));

    await expect(
      discoverAzureDevOpsOrganizations('token', fetchImpl as typeof fetch),
    ).rejects.toThrow('unexpected organization response');
  });
});
