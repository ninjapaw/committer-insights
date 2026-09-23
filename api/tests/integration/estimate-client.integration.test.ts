import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import {
  fetchAzureDevOpsEstimate,
  AzureDevOpsAdapterError,
} from '../../src/adapters/azure-devops/estimate-client.js';

const server = setupServer();

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());

const ESTIMATE_URL =
  'https://advsec.dev.azure.com/contoso/_apis/management/meterUsageEstimate/default';

describe('fetchAzureDevOpsEstimate integration', () => {
  it('normalizes a successful response', async () => {
    server.use(
      http.get(ESTIMATE_URL, () =>
        HttpResponse.json({
          uniqueCommitterCount: 1,
          billedUsers: [
            {
              cuid: 'c1',
              userId: 'u1',
              descriptor: 'd1',
              displayName: 'Jane Doe',
              uniqueName: 'jane@contoso.com',
            },
          ],
        }),
      ),
    );
    const result = await fetchAzureDevOpsEstimate({
      organization: 'contoso',
      plan: 'codeSecurity',
      resultType: 'estimated',
      accessToken: 'token',
    });
    expect(result).toHaveLength(1);
    expect(result[0]?.userPrincipalName).toBe('jane@contoso.com');
    expect(result[0]?.isEstimated).toBe(true);
  });

  it('handles an empty billedUsers array', async () => {
    server.use(
      http.get(ESTIMATE_URL, () => HttpResponse.json({ uniqueCommitterCount: 0, billedUsers: [] })),
    );
    const result = await fetchAzureDevOpsEstimate({
      organization: 'contoso',
      plan: 'secretProtection',
      resultType: 'estimated',
      accessToken: 'token',
    });
    expect(result).toEqual([]);
  });

  it('normalizes the nested response returned for plan=all', async () => {
    server.use(
      http.get(ESTIMATE_URL, () =>
        HttpResponse.json({
          codeSecurityMeterUsageEstimate: {
            uniqueCommitterCount: 1,
            billedUsers: [
              {
                cuid: 'code-user',
                userIdentity: {
                  id: 'code-id',
                  displayName: 'Code User',
                  uniqueName: 'code@example.com',
                  descriptor: 'aad.code',
                },
              },
            ],
          },
          secretProtectionMeterUsageEstimate: {
            uniqueCommitterCount: 1,
            billedUsers: [{ cuid: 'secret-user', displayName: 'Secret User' }],
          },
        }),
      ),
    );
    const result = await fetchAzureDevOpsEstimate({
      organization: 'contoso',
      plan: 'all',
      resultType: 'estimated',
      accessToken: 'token',
    });
    expect(result.map(({ cuid, plan }) => ({ cuid, plan }))).toEqual([
      { cuid: 'code-user', plan: 'codeSecurity' },
      { cuid: 'secret-user', plan: 'secretProtection' },
    ]);
    expect(result[0]).toMatchObject({
      identityId: 'code-id',
      displayName: 'Code User',
      userPrincipalName: 'code@example.com',
      descriptor: 'aad.code',
    });
  });

  it('rejects a malformed upstream response', async () => {
    server.use(http.get(ESTIMATE_URL, () => HttpResponse.json({ nope: true })));
    await expect(
      fetchAzureDevOpsEstimate({
        organization: 'contoso',
        plan: 'all',
        resultType: 'estimated',
        accessToken: 'token',
      }),
    ).rejects.toBeInstanceOf(AzureDevOpsAdapterError);
  });

  it('maps 401 to authentication_required without retry', async () => {
    let calls = 0;
    server.use(
      http.get(ESTIMATE_URL, () => {
        calls += 1;
        return new HttpResponse(null, { status: 401 });
      }),
    );
    await expect(
      fetchAzureDevOpsEstimate({
        organization: 'contoso',
        plan: 'codeSecurity',
        resultType: 'estimated',
        accessToken: 'token',
      }),
    ).rejects.toMatchObject({ providerError: { code: 'authentication_required' } });
    expect(calls).toBe(1);
  });

  it('maps 403 to insufficient_permission without retry', async () => {
    server.use(http.get(ESTIMATE_URL, () => new HttpResponse(null, { status: 403 })));
    await expect(
      fetchAzureDevOpsEstimate({
        organization: 'contoso',
        plan: 'codeSecurity',
        resultType: 'estimated',
        accessToken: 'token',
      }),
    ).rejects.toMatchObject({ providerError: { code: 'insufficient_permission' } });
  });

  it('maps 404 to not_found', async () => {
    server.use(http.get(ESTIMATE_URL, () => new HttpResponse(null, { status: 404 })));
    await expect(
      fetchAzureDevOpsEstimate({
        organization: 'contoso',
        plan: 'codeSecurity',
        resultType: 'estimated',
        accessToken: 'token',
      }),
    ).rejects.toMatchObject({ providerError: { code: 'not_found' } });
  });

  it('respects Retry-After on 429 and eventually succeeds', async () => {
    let attempt = 0;
    server.use(
      http.get(ESTIMATE_URL, () => {
        attempt += 1;
        if (attempt === 1) {
          return new HttpResponse(null, { status: 429, headers: { 'Retry-After': '0' } });
        }
        return HttpResponse.json({ uniqueCommitterCount: 0, billedUsers: [] });
      }),
    );
    const result = await fetchAzureDevOpsEstimate({
      organization: 'contoso',
      plan: 'codeSecurity',
      resultType: 'estimated',
      accessToken: 'token',
      maxRetries: 2,
    });
    expect(result).toEqual([]);
    expect(attempt).toBe(2);
  });

  it('retries transient 5xx and eventually surfaces upstream_unavailable if exhausted', async () => {
    server.use(http.get(ESTIMATE_URL, () => new HttpResponse(null, { status: 503 })));
    await expect(
      fetchAzureDevOpsEstimate({
        organization: 'contoso',
        plan: 'codeSecurity',
        resultType: 'estimated',
        accessToken: 'token',
        maxRetries: 1,
      }),
    ).rejects.toMatchObject({ providerError: { code: 'upstream_unavailable' } });
  });
});
