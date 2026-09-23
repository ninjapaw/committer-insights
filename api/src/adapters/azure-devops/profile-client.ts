import { azureDevOpsProfileSchema } from '@ninjapaw/contracts';

const PROFILE_URL = 'https://app.vssps.visualstudio.com/_apis/profile/profiles/me?api-version=7.1';

export async function getAzureDevOpsProfile(accessToken: string, fetchImpl: typeof fetch = fetch) {
  const response = await fetchImpl(PROFILE_URL, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' },
  });
  if (!response.ok) throw new Error('Azure DevOps profile lookup failed.');
  const profile = azureDevOpsProfileSchema.safeParse(await response.json());
  if (!profile.success) throw new Error('Azure DevOps returned an unexpected profile response.');
  return profile.data;
}
