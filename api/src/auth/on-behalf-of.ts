import { ConfidentialClientApplication, type Configuration } from '@azure/msal-node';
import { config } from '../shared/config.js';

export class ConsentRequiredError extends Error {
  constructor(message = 'Additional administrator consent is required for Azure DevOps access') {
    super(message);
    this.name = 'ConsentRequiredError';
  }
}

let cca: ConfidentialClientApplication | undefined;

/**
 * Loads the confidential client credential (certificate preferred, secret
 * acceptable) from Key Vault-resolved app settings. Never returns the raw
 * credential to callers; only used to construct the MSAL client in-process.
 */
function getConfidentialClient(): ConfidentialClientApplication {
  if (cca) return cca;

  const clientId = config.entra.clientId();
  const authority = config.entra.tenantAuthority();
  // Bicep/App Service resolves these as Key Vault references; the process
  // only ever sees the secret value, never a Key Vault URI at runtime here.
  const clientCertificate = process.env.API_ENTRA_CLIENT_CERTIFICATE;
  const clientSecret = process.env.API_ENTRA_CLIENT_SECRET;

  const auth: Configuration['auth'] = clientCertificate
    ? {
        clientId,
        authority,
        clientCertificate: { thumbprint: '', privateKey: clientCertificate },
      }
    : { clientId, authority, clientSecret };

  cca = new ConfidentialClientApplication({ auth });
  return cca;
}

/**
 * Exchanges the user's portal API bearer token for a delegated Azure DevOps
 * access token using OAuth On-Behalf-Of. The resulting token is used
 * server-side only and must never be returned to the browser.
 */
export async function acquireAzureDevOpsTokenOnBehalfOf(userAssertion: string): Promise<string> {
  const client = getConfidentialClient();
  try {
    const result = await client.acquireTokenOnBehalfOf({
      oboAssertion: userAssertion,
      scopes: [`${config.azureDevOps.resourceAppId}/.default`],
    });
    if (!result?.accessToken) {
      throw new ConsentRequiredError();
    }
    return result.accessToken;
  } catch (error) {
    // MSAL surfaces interaction_required / consent_required as error codes;
    // treat any OBO failure conservatively as a consent/administrator issue
    // rather than broadening scopes automatically.
    throw new ConsentRequiredError(
      error instanceof Error
        ? `Azure DevOps delegated access unavailable: ${error.message}`
        : undefined,
    );
  }
}
