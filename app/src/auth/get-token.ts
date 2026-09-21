import { InteractionRequiredAuthError } from '@azure/msal-browser';
import { msalInstance } from './msal-instance';
import { portalApiScopes } from './msal-config';

/**
 * Acquires an access token for the portal API scope, falling back to an
 * interactive prompt only when silent acquisition fails (e.g. expired
 * session, revoked consent, Conditional Access step-up).
 */
export async function getPortalApiToken(): Promise<string> {
  const account = msalInstance.getActiveAccount() ?? msalInstance.getAllAccounts()[0];
  if (!account) {
    throw new Error('No signed-in account. Sign in again to continue.');
  }
  try {
    const result = await msalInstance.acquireTokenSilent({ scopes: portalApiScopes, account });
    return result.accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      const result = await msalInstance.acquireTokenPopup({ scopes: portalApiScopes, account });
      return result.accessToken;
    }
    throw error;
  }
}
