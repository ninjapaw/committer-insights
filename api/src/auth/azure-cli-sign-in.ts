import { execFile } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TokenCredential } from '@azure/identity';
import type { DeviceSignInState } from '@ninjapaw/contracts';
import { config } from '../shared/config.js';
import { resolveAzureCli } from './azure-cli-binary.js';

export function parseAzureCliChallenge(
  output: string,
): { userCode: string; verificationUri: string } | undefined {
  const code = output.match(/enter the code\s+([A-Z0-9-]{6,20})\b/i)?.[1];
  if (
    !code ||
    !/https:\/\/(?:microsoft\.com\/devicelogin|login\.microsoft\.com\/device|login\.microsoftonline\.com\/common\/oauth2\/deviceauth)\b/i.test(
      output,
    )
  )
    return;
  return { userCode: code, verificationUri: 'https://microsoft.com/devicelogin' };
}

export function createAzureCliSignIn(signal: AbortSignal) {
  const directory = mkdtempSync(join(tmpdir(), 'committer-azure-sign-in-'));
  const environment: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (
      /^(SystemRoot|WINDIR|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|ProgramData|ProgramFiles|ProgramFiles\(x86\)|CommonProgramFiles|COMSPEC|SYSTEMDRIVE)$/i.test(
        name,
      )
    )
      environment[name] = value;
  }
  Object.assign(environment, {
    AZURE_CONFIG_DIR: directory,
    AZURE_CORE_COLLECT_TELEMETRY: 'no',
    // WAM owns its credential state outside this temporary CLI directory.
    AZURE_CORE_ENABLE_BROKER_ON_WINDOWS: 'true',
    // Disable the terminal subscription prompt, not the graphical account picker.
    AZURE_CORE_LOGIN_EXPERIENCE_V2: 'off',
    AZURE_EXTENSION_USE_DYNAMIC_INSTALL: 'no',
    AZURE_CORE_CHECK_VERSION: 'false',
    AZURE_CORE_NO_COLOR: 'true',
    PYTHONIOENCODING: 'utf-8',
    AZ_INSTALLER: 'ZIP',
  });
  let disposed = false;
  const active = new Set<ReturnType<typeof execFile>>();
  const cleanup = () => {
    if (disposed && active.size === 0)
      rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  };
  const dispose = () => {
    disposed = true;
    for (const child of active) child.kill();
    cleanup();
  };
  signal.addEventListener('abort', dispose, { once: true });
  process.once('exit', dispose);

  const run = async (args: string[], onOutput?: (text: string) => void): Promise<string> => {
    signal.throwIfAborted();
    if (disposed) throw new Error('Azure CLI session is closed.');
    const executable = await resolveAzureCli(signal);
    signal.throwIfAborted();
    if (disposed) throw new Error('Azure CLI session is closed.');
    return new Promise((resolve, reject) => {
      const child = execFile(
        executable,
        ['-I', '-B', '-m', 'azure.cli', ...args],
        {
          env: environment,
          cwd: directory,
          windowsHide: true,
          timeout: onOutput ? 600000 : 60000,
          maxBuffer: 4 * 1024 * 1024,
          encoding: 'utf8',
          signal,
        },
        (error, stdout) => {
          active.delete(child);
          cleanup();
          if (error || disposed)
            reject(
              new Error(
                'Azure CLI authentication failed. Retry or ask your administrator to review tenant policy.',
              ),
            );
          else resolve(stdout);
        },
      );
      active.add(child);
      if (onOutput) {
        let output = '';
        child.stderr?.on('data', (chunk: Buffer) => {
          output = (output + chunk.toString('utf8')).slice(-16384);
          onOutput(output);
        });
      }
    });
  };
  let account: DeviceSignInState['account'];
  let token: { token: string; expiresOnTimestamp: number } | undefined;
  const credential: TokenCredential = {
    async getToken() {
      if (!account || disposed || signal.aborted)
        throw new Error('Sign in with Azure CLI to continue.');
      if (token && token.expiresOnTimestamp > Date.now() + 120000) return token;
      const result = JSON.parse(
        await run([
          'account',
          'get-access-token',
          '--resource',
          config.azureDevOps.resourceAppId,
          '--tenant',
          account.tenantId,
          '--output',
          'json',
        ]),
      ) as { accessToken?: string; expires_on?: number | string; tenant?: string };
      const expiresOnTimestamp = Number(result.expires_on) * 1000;
      if (
        typeof result.accessToken !== 'string' ||
        !result.accessToken ||
        result.tenant !== account.tenantId ||
        !Number.isFinite(expiresOnTimestamp) ||
        expiresOnTimestamp <= Date.now()
      )
        throw new Error('Azure CLI returned an invalid Azure DevOps token.');
      token = { token: result.accessToken, expiresOnTimestamp };
      return token;
    },
  };
  return {
    credential,
    async version(): Promise<string> {
      const result = JSON.parse(await run(['version', '--output', 'json'])) as Record<
        string,
        unknown
      >;
      if (typeof result['azure-cli'] !== 'string' || !/^\d+\.\d+\.\d+$/.test(result['azure-cli']))
        throw new Error('Invalid Azure CLI version.');
      return result['azure-cli'];
    },
    dispose() {
      token = undefined;
      account = undefined;
      signal.removeEventListener('abort', dispose);
      process.removeListener('exit', dispose);
      dispose();
    },
    async authenticate(
      onChallenge: (challenge: NonNullable<DeviceSignInState['challenge']>) => void,
    ) {
      const tenant = config.entra.tenantId();
      if (tenant !== 'organizations' && !/^[a-f0-9-]{36}$/i.test(tenant))
        throw new Error('Azure CLI tenant must be a tenant GUID.');
      const result = JSON.parse(
        await run(
          [
            'login',
            '--allow-no-subscriptions',
            '--output',
            'json',
            ...(tenant === 'organizations' ? [] : ['--tenant', tenant]),
          ],
          (text) => {
            const challenge = parseAzureCliChallenge(text);
            if (challenge)
              onChallenge({ ...challenge, expiresOnTimestamp: Date.now() + 10 * 60 * 1000 });
          },
        ),
      ) as Array<{
        isDefault?: boolean;
        tenantId?: string;
        user?: { name?: string; type?: string };
      }>;
      if (!Array.isArray(result)) throw new Error('Azure CLI did not identify an account.');
      const selected =
        result.find((item) => item.isDefault) ?? (result.length === 1 ? result[0] : undefined);
      if (
        !selected?.tenantId ||
        !/^[a-f0-9-]{36}$/i.test(selected.tenantId) ||
        !selected.user?.name ||
        selected.user.type !== 'user' ||
        (tenant !== 'organizations' && selected.tenantId.toLowerCase() !== tenant.toLowerCase())
      ) {
        throw new Error('Azure CLI did not identify an unambiguous user and tenant.');
      }
      account = { username: selected.user.name, tenantId: selected.tenantId };
      await credential.getToken(`${config.azureDevOps.resourceUri}/.default`);
      return account;
    },
  };
}

export async function getAzureCliVersion(): Promise<string> {
  const session = createAzureCliSignIn(new AbortController().signal);
  try {
    return await session.version();
  } finally {
    session.dispose();
  }
}
