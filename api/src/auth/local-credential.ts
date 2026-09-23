import {
  AzureCliCredential,
  InteractiveBrowserCredential,
  type AccessToken,
  type TokenCredential,
} from '@azure/identity';
import { config } from '../shared/config.js';

const azureCliCredential = new AzureCliCredential();
let interactiveCredential: TokenCredential | undefined;

function createInteractiveCredential(): TokenCredential | undefined {
  const clientId = config.entra.clientId();
  if (!clientId) return undefined;

  return new InteractiveBrowserCredential({
    clientId,
    tenantId: config.entra.tenantId(),
    redirectUri: config.entra.redirectUri(),
  });
}

async function acquireFromAzureCli(): Promise<AccessToken | null> {
  try {
    // Azure CLI requires the Azure DevOps application ID as the token resource.
    return await azureCliCredential.getToken(`${config.azureDevOps.resourceAppId}/.default`);
  } catch {
    return null;
  }
}

export async function acquireAzureDevOpsToken(): Promise<string> {
  const cliToken = await acquireFromAzureCli();
  if (cliToken?.token) return cliToken.token;

  interactiveCredential ??= createInteractiveCredential();
  if (!interactiveCredential) {
    throw new Error(
      'Sign in with Azure CLI by running "az login", then try again. This avoids registering or approving Committer Insights as an application.',
    );
  }

  const token = await interactiveCredential.getToken(`${config.azureDevOps.resourceUri}/.default`);
  if (!token?.token) throw new Error('Microsoft sign-in did not return an Azure DevOps token.');
  return token.token;
}
