import { InteractiveBrowserCredential, type TokenCredential } from '@azure/identity';
import { config } from '../shared/config.js';

let credential: TokenCredential | undefined;

function createCredential(): TokenCredential {
  const clientId = config.entra.clientId();
  if (!clientId) {
    throw new Error(
      'COMMITTER_INSIGHTS_CLIENT_ID is required. Build releases with the public desktop application client ID.',
    );
  }

  return new InteractiveBrowserCredential({
    clientId,
    tenantId: config.entra.tenantId(),
    redirectUri: config.entra.redirectUri(),
  });
}

export async function acquireAzureDevOpsToken(): Promise<string> {
  credential ??= createCredential();
  const token = await credential.getToken(`${config.azureDevOps.resourceUri}/.default`);
  if (!token?.token) throw new Error('Microsoft sign-in did not return an Azure DevOps token.');
  return token.token;
}
