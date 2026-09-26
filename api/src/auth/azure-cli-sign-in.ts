import { spawn } from 'node:child_process';
import type { ChildProcess } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TokenCredential } from '@azure/identity';
import type { DeviceSignInState } from '@ninjapaw/contracts';
import { config } from '../shared/config.js';
import { getPreparedAzureCli, isBundledAzureCliRuntime } from './azure-cli-binary.js';

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

export function createAzureCliSignIn(signal: AbortSignal, onReady?: () => void) {
  const directory = mkdtempSync(join(tmpdir(), 'committer-azure-sign-in-'));
  const environment: NodeJS.ProcessEnv = {};
  for (const [name, value] of Object.entries(process.env)) {
    if (
      /^(SystemRoot|WINDIR|TEMP|TMP|USERPROFILE|LOCALAPPDATA|APPDATA|ProgramData|ProgramFiles|ProgramFiles\(x86\)|CommonProgramFiles|COMSPEC|SYSTEMDRIVE|PATH|HOME|USER|LANG|LC_ALL|LC_CTYPE|TMPDIR)$/i.test(
        name,
      )
    )
      environment[name] = value;
  }
  if (process.platform !== 'win32') {
    // The 'az' executable is resolved via PATH. GUI-launched apps (for example a macOS
    // .app bundle opened from Finder) often inherit a minimal PATH that omits Homebrew
    // and other common install locations, so append them without dropping the inherited PATH.
    const commonPaths = ['/opt/homebrew/bin', '/usr/local/bin', '/usr/bin', '/bin', '/usr/sbin', '/sbin'];
    const inherited = (environment.PATH ?? '').split(':').filter(Boolean);
    environment.PATH = Array.from(new Set([...inherited, ...commonPaths])).join(':');
  }
  Object.assign(environment, {
    AZURE_CONFIG_DIR: directory,
    AZURE_CORE_COLLECT_TELEMETRY: 'no',
    AZURE_CORE_ENABLE_BROKER_ON_WINDOWS: 'false',
    // Disable the terminal subscription prompt, not the graphical account picker.
    AZURE_CORE_LOGIN_EXPERIENCE_V2: 'off',
    AZURE_EXTENSION_USE_DYNAMIC_INSTALL: 'no',
    AZURE_CORE_CHECK_VERSION: 'false',
    AZURE_CORE_NO_COLOR: 'true',
    PYTHONIOENCODING: 'utf-8',
    AZ_INSTALLER: 'ZIP',
  });
  let disposed = false;
  const active = new Set<ChildProcess>();
  const cleanup = () => {
    if (disposed && active.size === 0)
      rmSync(directory, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  };
  const killTree = (child: ChildProcess) => {
    // On POSIX, 'az' is a shell script that spawns its own Python process rather than
    // exec-replacing itself, so killing only the direct child leaves the actual
    // 'az login' process orphaned and running. It is started as its own process
    // group leader (see spawn below), so terminate the whole group instead.
    if (process.platform !== 'win32' && typeof child.pid === 'number') {
      try {
        process.kill(-child.pid, 'SIGTERM');
        return;
      } catch {
        // Fall through to killing just the direct child.
      }
    }
    child.kill();
  };
  const dispose = () => {
    disposed = true;
    for (const child of active) killTree(child);
    cleanup();
  };
  signal.addEventListener('abort', dispose, { once: true });
  process.once('exit', dispose);

  const run = async (args: string[], onOutput?: (text: string) => void): Promise<string> => {
    signal.throwIfAborted();
    if (disposed) throw new Error('Azure CLI session is closed.');
    const executable = getPreparedAzureCli();
    signal.throwIfAborted();
    if (disposed) throw new Error('Azure CLI session is closed.');
    // Both the Windows and bundled-macOS runtimes ship a bare python interpreter (no 'az'
    // wrapper script) that must be told to run the azure.cli module directly. An
    // unbundled 'az' on PATH (Linux, or macOS dev runs without the packaged app) is
    // invoked as-is.
    const bundled = isBundledAzureCliRuntime();
    const cliArgs = bundled ? ['-I', '-B', '-m', 'azure.cli', ...args] : args;
    const timeoutMs = onOutput ? 600000 : 60000;
    const maxBuffer = 4 * 1024 * 1024;
    return new Promise((resolve, reject) => {
      // Note: execFile() only forwards a fixed allowlist of options to the
      // underlying spawn() call and silently drops 'detached', so spawn() is used
      // directly here (with manual timeout/output handling) to make the child its
      // own process group leader on POSIX. That lets killTree() terminate the
      // whole group, including any process 'az' spawns internally.
      const child = spawn(executable, cliArgs, {
        env: environment,
        cwd: directory,
        windowsHide: args[0] !== 'login',
        signal,
        stdio: ['ignore', 'pipe', 'pipe'],
        ...(process.platform !== 'win32' ? { detached: true } : {}),
      });
      active.add(child);
      // Only notify the caller once the OS confirms the process actually started.
      // If spawn() fails (e.g. ENOENT because Azure CLI isn't installed), 'spawn'
      // never fires, so the caller can still tell a launch failure apart from an
      // authentication failure that happens after the CLI is up and running.
      if (args[0] === 'login') child.once('spawn', () => onReady?.());
      let settled = false;
      let stdout = '';
      let bufferExceeded = false;
      const timer = setTimeout(() => killTree(child), timeoutMs);
      const finish = (error: Error | null, output: string) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        active.delete(child);
        cleanup();
        if (error) reject(error);
        else resolve(output);
      };
      child.stdout?.setEncoding('utf8');
      child.stdout?.on('data', (chunk: string) => {
        if (bufferExceeded) return;
        stdout += chunk;
        if (stdout.length > maxBuffer) {
          bufferExceeded = true;
          killTree(child);
        }
      });
      if (onOutput) {
        let output = '';
        child.stderr?.setEncoding('utf8');
        child.stderr?.on('data', (chunk: string) => {
          output = (output + chunk).slice(-16384);
          onOutput(output);
        });
      } else {
        child.stderr?.resume();
      }
      child.once('error', (error) => finish(error, ''));
      child.once('close', (code) => {
        if (disposed || bufferExceeded || code !== 0)
          finish(
            new Error(
              'Azure CLI authentication failed. Retry or ask your administrator to review tenant policy.',
            ),
            '',
          );
        else finish(null, stdout);
      });
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
      options?: { useDeviceCode?: boolean },
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
            ...(options?.useDeviceCode ? ['--use-device-code'] : []),
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
