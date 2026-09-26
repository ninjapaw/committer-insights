import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { createInterface } from 'node:readline';
import { getAsset, isSea } from 'node:sea';
import type { Readable } from 'node:stream';
import { fileURLToPath } from 'node:url';
import {
  gitHubReportRequestSchema,
  gitHubSignInSchema,
  multiSourceReportRequestSchema,
  reportRequestSchema,
  HTTP_STATUS_TO_ERROR_CODE,
  type ProviderErrorCode,
  type ExportFormat,
} from '@ninjapaw/contracts';
import { AzureDevOpsAdapterError } from './adapters/azure-devops/estimate-client.js';
import { listGitHubAccounts, disconnectGitHubAccount } from './auth/github-cli.js';
import { cancelGitHubSignIn, getGitHubSignIn, startGitHubSignIn } from './auth/github-sign-in.js';
import { getAzureCliVersion } from './auth/azure-cli-sign-in.js';
import {
  cancelDeviceSignIn,
  disconnectMicrosoftAccount,
  getMicrosoftAccount,
  getDeviceSignIn,
  startDeviceSignIn,
  startAzureCliSignIn,
} from './auth/local-credential.js';
import { generateReportExport } from './exports/report-export.js';
import { createCombinedReport, preflightSources } from './reports/combined-report.js';
import { reportStore, type StoredReport } from './reports/report-store.js';
import {
  connectAzureDevOps,
  createAzureReport,
  discoverAzureDevOpsSources,
} from './services/azure-devops.js';
import { connectGitHub, createGitHubReport, discoverGitHubSources } from './services/github.js';
import { PRODUCT } from '@ninjapaw/developer-usage-insights-metadata';

const HOST = '127.0.0.1';
// Resolve the built web app relative to this module's own location rather than process.cwd(),
// which varies by launch method (npm workspace scripts, a double-clicked macOS .app, etc.) and
// is not a reliable base for locating bundled assets.
export function appRootCandidates(
  moduleDir = dirname(fileURLToPath(import.meta.url)),
  execPath = process.execPath,
): [string, ...string[]] {
  const candidates = [
    // Packaged bundle sits next to its own assets (macOS .app Contents/Resources, Linux tarball).
    // Probed first so a bundle always prefers the assets it shipped with.
    join(moduleDir, 'app'),
    // The bundled Node.js runtime is a sibling of those same assets, which keeps resolution
    // working even when the entry script is invoked through a symlink or relocated path.
    join(dirname(execPath), 'app'),
    // Compiled TypeScript output: api/dist/src/local-server.js -> <repo>/app/dist
    resolve(moduleDir, '../../../app/dist'),
  ];
  // In a packaged bundle the first two collapse to the same directory, and repeating it in the
  // diagnostic makes the reported search look broken rather than exhaustive.
  return [...new Set(candidates)] as [string, ...string[]];
}

// Returns the first candidate that actually contains the built web app. When none do we still
// return a root so requests fail with a diagnostic rather than crashing at module load.
function resolveAppRoot(candidates: [string, ...string[]]): string {
  return candidates.find((candidate) => existsSync(join(candidate, 'index.html'))) ?? candidates[0];
}
const appRootSearchPaths = appRootCandidates();
const appRoot = resolveAppRoot(appRootSearchPaths);
const releasesUrl = `https://github.com/${PRODUCT.repository}/releases/latest`;
// This unguessable capability is the authorization boundary for the one local browser session.
const capability = randomBytes(32).toString('base64url');
let githubSignedIn = false;

const securityHeaders = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

const providerErrorStatus = Object.fromEntries(
  Object.entries(HTTP_STATUS_TO_ERROR_CODE).map(([status, code]) => [code, Number(status)]),
) as Record<ProviderErrorCode, number>;

export function providerStatusForErrorCode(code: ProviderErrorCode): number {
  return providerErrorStatus[code];
}

function sendJson(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, {
    ...securityHeaders,
    'Content-Type': 'application/json; charset=utf-8',
  });
  response.end(JSON.stringify(body));
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > 64 * 1024) throw new Error('Request body is too large.');
    chunks.push(buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
}

function isAuthorized(request: IncomingMessage, origin: string): boolean {
  // Exact host and origin checks prevent DNS rebinding and cross-site mutation requests.
  if (request.headers.host !== origin.slice('http://'.length)) return false;
  if (request.headers.authorization !== `Bearer ${capability}`) return false;
  if (!['GET', 'HEAD'].includes(request.method ?? '') && request.headers.origin !== origin)
    return false;
  return true;
}

function reportForLocalUser(reportId: string | undefined): StoredReport | undefined {
  return reportId ? reportStore.get(reportId) : undefined;
}

function contentType(path: string): string {
  return (
    {
      '.css': 'text/css; charset=utf-8',
      '.html': 'text/html; charset=utf-8',
      '.ico': 'image/x-icon',
      '.js': 'text/javascript; charset=utf-8',
      '.json': 'application/json; charset=utf-8',
      '.map': 'application/json; charset=utf-8',
      '.png': 'image/png',
      '.svg': 'image/svg+xml',
    }[extname(path)] ?? 'application/octet-stream'
  );
}

function serveApp(pathname: string, response: ServerResponse): void {
  const requested = pathname === '/' ? 'index.html' : pathname.slice(1);
  // Release binaries read embedded SEA assets; source runs use the Vite output on disk.
  if (isSea()) {
    let asset: ArrayBuffer | undefined;
    let selected = requested;
    try {
      asset = getAsset(`app/${selected}`);
    } catch {
      selected = 'index.html';
      asset = getAsset('app/index.html');
    }
    response.writeHead(200, { ...securityHeaders, 'Content-Type': contentType(selected) });
    response.end(Buffer.from(asset));
    return;
  }
  const candidate = resolve(appRoot, normalize(requested));
  const withinRoot = candidate.startsWith(`${appRoot}/`) || candidate.startsWith(`${appRoot}\\`);
  const selected =
    withinRoot && existsSync(candidate) && statSync(candidate).isFile()
      ? candidate
      : join(appRoot, 'index.html');
  if (!existsSync(selected)) {
    // An installation missing its own web assets is unrecoverable at runtime, so name the
    // searched locations instead of leaving the user with an error they cannot act on. This
    // most often means a partially extracted download or a stale bundle from an older release.
    sendJson(response, 503, {
      message: `The bundled web interface is missing from this installation of ${PRODUCT.displayName}. Download the latest release again from ${releasesUrl} and replace this copy.`,
      searchedPaths: appRootSearchPaths,
    });
    return;
  }
  response.writeHead(200, { ...securityHeaders, 'Content-Type': contentType(selected) });
  createReadStream(selected).pipe(response);
}

function openBrowser(url: string): void {
  const [command, args] =
    process.platform === 'win32'
      ? ['cmd.exe', ['/d', '/s', '/c', 'start', '', url]]
      : process.platform === 'darwin'
        ? ['open', [url]]
        : ['xdg-open', [url]];
  spawn(command, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref();
}

async function createReport(request: IncomingMessage, response: ServerResponse): Promise<void> {
  const parsed = reportRequestSchema.safeParse(await readJson(request));
  if (!parsed.success) {
    sendJson(response, 400, { message: 'The report request is invalid.' });
    return;
  }
  const { organization, plans } = parsed.data;
  const report = await createAzureReport({
    provider: 'azure-devops',
    organization,
    plans,
  });
  const { reportId, generatedAt } = report;
  sendJson(response, 201, { reportId, generatedAt, warnings: report.warnings });
}

async function exportReport(
  response: ServerResponse,
  report: StoredReport,
  extension: ExportFormat,
): Promise<void> {
  const output = await generateReportExport(report, extension);
  response.writeHead(200, {
    ...securityHeaders,
    'Content-Type': output.contentType,
    'Content-Disposition': `attachment; filename="${output.filename}"`,
  });
  response.end(output.body);
}

async function handleApi(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  origin: string,
): Promise<void> {
  if (!isAuthorized(request, origin))
    return sendJson(response, 401, { message: 'Invalid local session.' });
  const account = getMicrosoftAccount();
  const signedIn = Boolean(account);
  if (request.method === 'GET' && pathname === '/api/session') {
    return sendJson(response, 200, {
      authenticated: signedIn,
      account,
    });
  }
  if (request.method === 'POST' && pathname === '/api/auth/sign-in') {
    const connection = await connectAzureDevOps();
    return sendJson(response, 200, connection);
  }
  if (request.method === 'POST' && pathname === '/api/auth/azure-cli') {
    return sendJson(response, 202, startAzureCliSignIn());
  }
  if (request.method === 'GET' && pathname === '/api/auth/azure-cli/info') {
    return sendJson(response, 200, { version: await getAzureCliVersion() });
  }
  if (request.method === 'POST' && pathname === '/api/auth/device-code') {
    return sendJson(response, 202, startDeviceSignIn());
  }
  if (request.method === 'POST' && pathname === '/api/auth/sign-out') {
    disconnectMicrosoftAccount();
    return sendJson(response, 200, { authenticated: false });
  }
  const deviceMatch = pathname.match(/^\/api\/auth\/device-code\/([a-f0-9-]+)$/);
  if (deviceMatch?.[1] && (request.method === 'GET' || request.method === 'DELETE')) {
    const state =
      request.method === 'DELETE'
        ? cancelDeviceSignIn(deviceMatch[1])
        : getDeviceSignIn(deviceMatch[1]);
    if (!state) return sendJson(response, 404, { message: 'Device sign-in attempt not found.' });
    return sendJson(response, 200, state);
  }
  if (
    request.method === 'POST' &&
    (pathname === '/api/auth/github/browser' || pathname === '/api/auth/github/device-code')
  ) {
    githubSignedIn = false;
    disconnectGitHubAccount();
    return sendJson(
      response,
      202,
      startGitHubSignIn(pathname === '/api/auth/github/browser' ? openBrowser : undefined),
    );
  }
  const githubAttempt = pathname.match(/^\/api\/auth\/github\/browser\/([a-f0-9-]+)$/);
  if (githubAttempt?.[1] && (request.method === 'GET' || request.method === 'DELETE')) {
    const state =
      request.method === 'DELETE'
        ? cancelGitHubSignIn(githubAttempt[1])
        : getGitHubSignIn(githubAttempt[1]);
    if (!state) return sendJson(response, 404, { message: 'GitHub sign-in attempt not found.' });
    return sendJson(response, 200, state);
  }
  if (request.method === 'POST' && pathname === '/api/auth/github/sign-in') {
    const parsed = gitHubSignInSchema.safeParse(
      request.headers['content-type']?.includes('application/json') ? await readJson(request) : {},
    );
    if (!parsed.success)
      return sendJson(response, 400, { message: 'Select a valid GitHub account.' });
    cancelGitHubSignIn();
    githubSignedIn = false;
    const connection = await connectGitHub(parsed.data.login);
    githubSignedIn = true;
    return sendJson(response, 200, connection);
  }
  if (request.method === 'GET' && pathname === '/api/auth/github/accounts') {
    return sendJson(response, 200, { accounts: await listGitHubAccounts() });
  }
  if (request.method === 'POST' && pathname === '/api/auth/github/sign-out') {
    cancelGitHubSignIn();
    githubSignedIn = false;
    disconnectGitHubAccount();
    return sendJson(response, 200, { authenticated: false });
  }
  if (request.method === 'GET' && pathname === '/api/connections/github/targets') {
    if (!githubSignedIn) {
      return sendJson(response, 401, { message: 'Sign in with GitHub CLI to continue.' });
    }
    const targets = await discoverGitHubSources();
    return sendJson(response, 200, { targets });
  }
  if (request.method === 'POST' && pathname === '/api/reports/github') {
    if (!githubSignedIn) {
      return sendJson(response, 401, { message: 'Sign in with GitHub CLI to continue.' });
    }
    const parsed = gitHubReportRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return sendJson(response, 400, { message: 'The GitHub report request is invalid.' });
    }
    const report = await createGitHubReport({ provider: 'github', ...parsed.data });
    const { reportId, generatedAt } = report;
    return sendJson(response, 201, { reportId, generatedAt, warnings: report.warnings });
  }
  if (request.method === 'POST' && pathname === '/api/reports/combined/preflight') {
    const parsed = multiSourceReportRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return sendJson(response, 400, { message: 'Select at least one valid source.' });
    }
    return sendJson(response, 200, { statuses: await preflightSources(parsed.data.sources) });
  }
  if (request.method === 'POST' && pathname === '/api/reports/combined') {
    const parsed = multiSourceReportRequestSchema.safeParse(await readJson(request));
    if (!parsed.success) {
      return sendJson(response, 400, { message: 'Select at least one valid source.' });
    }
    const report = await createCombinedReport(parsed.data.sources);
    const { reportId, generatedAt } = report;
    return sendJson(response, 201, {
      reportId,
      generatedAt,
      statuses: report.sourceStatuses,
      summary: report.executiveSummary,
    });
  }
  const reportMatch = pathname.match(/^\/api\/reports\/([^/]+)$/);
  if (request.method === 'GET' && reportMatch) {
    const report = reportForLocalUser(reportMatch[1]);
    if (!report) return sendJson(response, 404, { message: 'Report not found.' });
    return sendJson(response, 200, report);
  }
  const exportMatch = pathname.match(/^\/api\/reports\/([^/]+)\/export\.(csv|html|pdf)$/);
  if (request.method === 'GET' && exportMatch) {
    const report = reportForLocalUser(exportMatch[1]);
    if (!report) return sendJson(response, 404, { message: 'Report not found.' });
    return exportReport(response, report, exportMatch[2] as ExportFormat);
  }
  if (!signedIn) return sendJson(response, 401, { message: 'Sign in with Microsoft to continue.' });
  if (request.method === 'GET' && pathname === '/api/connections/azure-devops/organizations') {
    try {
      const organizations = await discoverAzureDevOpsSources();
      return sendJson(response, 200, { organizations });
    } catch {
      return sendJson(response, 502, {
        message: 'Organization discovery is unavailable. Enter an organization name or URL.',
      });
    }
  }
  if (request.method === 'POST' && pathname === '/api/connections/azure-devops/validate') {
    const value = ((await readJson(request)) as { organization?: unknown }).organization;
    const organizationSchema = reportRequestSchema.shape.organization;
    const parsed = organizationSchema.safeParse(value);
    if (!parsed.success) {
      return sendJson(response, 400, { message: 'Enter a valid organization name or URL.' });
    }
    return sendJson(response, 200, { organization: parsed.data, status: 'connected' });
  }
  if (request.method === 'POST' && pathname === '/api/reports/azure-devops') {
    return createReport(request, response);
  }
  return sendJson(response, 404, { message: 'Not found.' });
}

// Terminal users otherwise have no discoverable way to stop the server: the macOS launcher
// opens a Terminal window containing nothing but the banner, and Ctrl+C is not obvious to a
// non-developer audience. Reading a line from stdin gives Windows, Linux, and macOS the same
// "press Enter to quit" affordance. 'close' covers Ctrl+D and a terminal that goes away
// without sending a signal.
export function listenForQuitKey(
  shutdown: () => void,
  input: Readable & { isTTY?: boolean } = process.stdin,
): () => void {
  // Piped and CI runs have no user to press a key, and consuming their stdin would both hide
  // input from the rest of the process and keep the event loop alive.
  if (!input.isTTY) return () => {};
  const reader = createInterface({ input });
  reader.on('line', shutdown);
  reader.on('close', shutdown);
  return () => {
    // Detach first so tearing the reader down during shutdown does not re-enter it.
    reader.removeListener('close', shutdown);
    reader.close();
    // createInterface resumes the stream, which would otherwise hold the process open.
    input.pause();
  };
}

export async function startLocalServer(): Promise<Server> {
  // Surface a broken installation in the launcher's terminal window. Without this the only
  // symptom is a raw JSON error in the browser, which gives no hint that the download itself
  // is incomplete.
  if (!isSea() && !existsSync(join(appRoot, 'index.html'))) {
    process.stderr.write(
      `${PRODUCT.displayName} could not find its bundled web interface. This copy is incomplete; ` +
        `download the latest release again from ${releasesUrl} and replace it.\n` +
        `Searched: ${appRootSearchPaths.join(', ')}\n`,
    );
  }
  const server = createServer(async (request, response) => {
    const address = server.address();
    const port = typeof address === 'object' && address ? address.port : 0;
    const origin = `http://${HOST}:${port}`;
    try {
      const url = new URL(request.url ?? '/', origin);
      if (url.pathname.startsWith('/api/'))
        await handleApi(request, response, url.pathname, origin);
      else serveApp(url.pathname, response);
    } catch (error) {
      const status =
        error instanceof AzureDevOpsAdapterError
          ? providerStatusForErrorCode(error.providerError.code)
          : 500;
      sendJson(response, status, {
        message:
          error instanceof AzureDevOpsAdapterError
            ? error.providerError.message
            : error instanceof Error
              ? error.message
              : 'The local application failed.',
      });
    }
  });

  await new Promise<void>((resolveListening, reject) => {
    server.once('error', reject);
    server.listen({ host: HOST, port: 0, exclusive: true }, resolveListening);
  });
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('Unable to start local server.');
  const url = `http://${HOST}:${address.port}/#session=${encodeURIComponent(capability)}`;
  if (process.env.DEVELOPER_USAGE_INSIGHTS_NO_BROWSER === 'true') {
    process.stdout.write(`${PRODUCT.displayName} is running at ${url}\n`);
  } else {
    openBrowser(url);
    process.stdout.write(`${PRODUCT.displayName} opened at http://${HOST}:${address.port}/\n`);
  }
  if (process.stdin.isTTY) process.stdout.write('Press Enter to quit.\n');

  let closing = false;
  const signals = ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK'] as const;
  // Assigned below once shutdown exists; the two reference each other.
  let stopQuitKeyListener: () => void = () => {};
  const shutdown = () => {
    if (closing) return;
    closing = true;
    stopQuitKeyListener();
    cancelGitHubSignIn();
    disconnectMicrosoftAccount();
    server.close(() => process.exit(0));
    server.closeAllConnections();
  };
  stopQuitKeyListener = listenForQuitKey(shutdown);
  server.once('close', () => {
    for (const signal of signals) process.removeListener(signal, shutdown);
    stopQuitKeyListener();
    cancelGitHubSignIn();
    disconnectMicrosoftAccount();
  });
  for (const signal of signals) process.on(signal, shutdown);
  return server;
}
