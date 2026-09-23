import { azureDevOpsAccountsResponseSchema } from '@ninjapaw/contracts';
import { getAzureDevOpsProfile } from './profile-client.js';

const ACCOUNTS_URL = 'https://app.vssps.visualstudio.com/_apis/accounts?api-version=7.1';

export interface AzureDevOpsOrganization {
  id: string;
  name: string;
  url: string;
}

export async function discoverAzureDevOpsOrganizations(
  accessToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<AzureDevOpsOrganization[]> {
  const headers = { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' };
  const profile = await getAzureDevOpsProfile(accessToken, fetchImpl);

  const accountsUrl = new URL(ACCOUNTS_URL);
  accountsUrl.searchParams.set('memberId', profile.id);
  const accountsResponse = await fetchImpl(accountsUrl, { headers });
  if (!accountsResponse.ok) throw new Error('Azure DevOps organization lookup failed.');

  const accounts = azureDevOpsAccountsResponseSchema.safeParse(await accountsResponse.json());
  if (!accounts.success)
    throw new Error('Azure DevOps returned an unexpected organization response.');

  return accounts.data.value
    .map((account) => ({
      id: account.accountId,
      name: account.accountName,
      url: `https://dev.azure.com/${account.accountName}`,
    }))
    .sort((left, right) => left.name.localeCompare(right.name));
}
