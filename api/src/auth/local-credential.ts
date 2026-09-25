import { randomUUID } from 'node:crypto';
import type { DeviceSignInState } from '@ninjapaw/contracts';
import {
  DeviceCodeCredential,
  InteractiveBrowserCredential,
  type AuthenticationRecord,
  type TokenCredential,
} from '@azure/identity';
import { config } from '../shared/config.js';
import { createAzureCliSignIn } from './azure-cli-sign-in.js';

let interactiveCredential: TokenCredential | undefined;
let deviceAttempt:
  | {
      id: string;
      controller: AbortController;
      timer?: ReturnType<typeof setTimeout>;
      dispose?: () => void;
      state: DeviceSignInState;
    }
  | undefined;

function publisherClientId(): string {
  const clientId = config.entra.clientId();
  if (!clientId) {
    throw new Error(
      'Microsoft sign-in is not configured in this build. The publisher must configure COMMITTER_INSIGHTS_CLIENT_ID and rebuild the application. No Azure CLI login is required.',
    );
  }
  return clientId;
}

export function getDeviceSignIn(id: string): DeviceSignInState | undefined {
  return deviceAttempt?.id === id ? deviceAttempt.state : undefined;
}

export function cancelDeviceSignIn(id: string): DeviceSignInState | undefined {
  if (deviceAttempt?.id !== id) return undefined;
  if (deviceAttempt.state.status === 'pending') {
    deviceAttempt.state = { id, status: 'canceled' };
    clearTimeout(deviceAttempt.timer);
    deviceAttempt.controller.abort();
    deviceAttempt.dispose?.();
  }
  return deviceAttempt.state;
}

function createSignInAttempt() {
  if (deviceAttempt) cancelDeviceSignIn(deviceAttempt.id);
  deviceAttempt?.dispose?.();
  interactiveCredential = undefined;
  const id = randomUUID();
  const expiresOnTimestamp = Date.now() + 10 * 60 * 1000;
  const attempt: NonNullable<typeof deviceAttempt> = {
    id,
    controller: new AbortController(),
    state: { id, status: 'pending' },
  };
  deviceAttempt = attempt;
  const expire = () => {
    if (attempt.state.status !== 'pending') return;
    attempt.state = { id, status: 'expired' };
    attempt.controller.abort();
    attempt.dispose?.();
  };
  attempt.timer = setTimeout(expire, 10 * 60 * 1000);
  attempt.timer.unref();
  return { attempt, expiresOnTimestamp };
}

function completeSignIn(
  attempt: NonNullable<typeof deviceAttempt>,
  credential: TokenCredential,
  record: Pick<AuthenticationRecord, 'username' | 'tenantId'> | undefined,
): void {
  // A canceled or superseded request must never replace the current account.
  if (deviceAttempt !== attempt || attempt.state.status !== 'pending') return;
  if (!record?.username || !record.tenantId)
    throw new Error('Microsoft sign-in did not identify an account.');
  interactiveCredential = credential;
  attempt.state = {
    id: attempt.id,
    status: 'authenticated',
    account: { username: record.username, tenantId: record.tenantId },
  };
  clearTimeout(attempt.timer);
}

export function getMicrosoftAccount(): DeviceSignInState['account'] {
  return deviceAttempt?.state.status === 'authenticated' ? deviceAttempt.state.account : undefined;
}

export function disconnectMicrosoftAccount(): void {
  if (deviceAttempt) cancelDeviceSignIn(deviceAttempt.id);
  deviceAttempt?.dispose?.();
  interactiveCredential = undefined;
  deviceAttempt = undefined;
}

export function startAzureCliSignIn(): DeviceSignInState {
  const { attempt, expiresOnTimestamp } = createSignInAttempt();
  let launching = true;
  attempt.state.message = 'Opening Microsoft sign-in...';
  const session = createAzureCliSignIn(attempt.controller.signal, () => {
    if (deviceAttempt !== attempt || attempt.state.status !== 'pending') return;
    launching = false;
    attempt.state = {
      id: attempt.id,
      status: 'pending',
      message: 'Waiting for Microsoft sign-in in your browser...',
    };
  });
  attempt.dispose = () => session.dispose();
  void session
    .authenticate((challenge) => {
      if (deviceAttempt !== attempt || attempt.state.status !== 'pending') return;
      attempt.state = {
        id: attempt.id,
        status: 'pending',
        challenge: { ...challenge, expiresOnTimestamp },
      };
    })
    .then((account) => completeSignIn(attempt, session.credential, account))
    .catch(() => {
      session.dispose();
      if (attempt.state.status !== 'pending') return;
      attempt.state = {
        id: attempt.id,
        status: 'failed',
        message: launching
          ? 'Microsoft sign-in runtime is unavailable. Restart the app to prepare it; if this persists, ask your administrator to review local file access and endpoint protection. No account sign-in was started.'
          : 'Azure CLI sign-in failed. Use the Windows x64 package and retry, or ask your administrator to review CLI access and interactive sign-in policy. No SDK fallback was attempted.',
      };
    })
    .finally(() => clearTimeout(attempt.timer));
  return attempt.state;
}

export function startDeviceSignIn(): DeviceSignInState {
  const clientId = publisherClientId();
  const { attempt, expiresOnTimestamp } = createSignInAttempt();
  const { id } = attempt;
  const credential = new DeviceCodeCredential({
    clientId,
    tenantId: config.entra.tenantId(),
    disableAutomaticAuthentication: true,
    userPromptCallback: ({ userCode, verificationUri }) => {
      if (attempt.state.status !== 'pending') return;
      attempt.state = {
        id,
        status: 'pending',
        challenge: { userCode, verificationUri, expiresOnTimestamp },
      };
    },
  });
  void credential
    .authenticate(`${config.azureDevOps.resourceUri}/.default`, {
      abortSignal: attempt.controller.signal,
    })
    .then((record) => completeSignIn(attempt, credential, record))
    .catch(() => {
      if (attempt.state.status !== 'pending') return;
      attempt.state = {
        id,
        status: 'failed',
        message:
          'Device sign-in failed. Try again, use browser sign-in, or contact your administrator if tenant policy blocks device codes.',
      };
    })
    .finally(() => clearTimeout(attempt.timer));
  return attempt.state;
}

export async function signInWithBrowser(): Promise<DeviceSignInState> {
  const clientId = publisherClientId();
  const { attempt } = createSignInAttempt();
  // A fresh credential without loginHint keeps Microsoft's account picker available.
  const credential = new InteractiveBrowserCredential({
    clientId,
    tenantId: config.entra.tenantId(),
    redirectUri: config.entra.redirectUri(),
    disableAutomaticAuthentication: true,
  });
  try {
    const record = await credential.authenticate(`${config.azureDevOps.resourceUri}/.default`, {
      abortSignal: attempt.controller.signal,
    });
    completeSignIn(attempt, credential, record);
    return attempt.state;
  } catch (error) {
    cancelDeviceSignIn(attempt.id);
    throw error;
  }
}

export async function acquireAzureDevOpsToken(): Promise<string> {
  if (!interactiveCredential) throw new Error('Sign in with Microsoft to continue.');

  const token = await interactiveCredential.getToken(`${config.azureDevOps.resourceUri}/.default`);
  if (!token?.token) throw new Error('Microsoft sign-in did not return an Azure DevOps token.');
  return token.token;
}
