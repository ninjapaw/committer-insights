import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { getAsset, isSea } from 'node:sea';
import { reportRequestSchema } from '@ninjapaw/contracts';
import {
  AzureDevOpsAdapterError,
  fetchAzureDevOpsEstimate,
} from './adapters/azure-devops/estimate-client.js';
import { acquireAzureDevOpsToken } from './auth/local-credential.js';
import { generateReportWorkbook, safeExportFilename } from './exports/excel-workbook.js';
import { toCsv } from './exports/sanitize.js';
import { reportStore, type StoredReport } from './reports/report-store.js';
import { config } from './shared/config.js';
import { newOpaqueId } from './shared/ids.js';

const HOST = '127.0.0.1';
const appRoot = resolve(process.cwd(), 'app/dist');
// This unguessable capability is the authorization boundary for the one local browser session.
const capability = randomBytes(32).toString('base64url');
let signedIn = false;

const securityHeaders = {
  'Cache-Control': 'no-store',
  'Content-Security-Policy':
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Referrer-Policy': 'no-referrer',
  'X-Content-Type-Options': 'nosniff',
};

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
    sendJson(response, 503, { message: 'The local web application has not been built.' });
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
  const { organization, plans, resultTypes } = parsed.data;
  const accessToken = await acquireAzureDevOpsToken();
  const azureDevOpsCommitters = (
    await Promise.all(
      plans.flatMap((plan) =>
        resultTypes.map((resultType) =>
          fetchAzureDevOpsEstimate({ organization, plan, resultType, accessToken }),
        ),
      ),
    )
  ).flat();
  const reportId = newOpaqueId();
  const generatedAt = new Date().toISOString();
  const report: StoredReport = {
    reportId,
    organization,
    plans,
    generatedAt,
    sourceApiVersion: config.azureDevOps.apiVersion(),
    azureDevOpsCommitters,
    warnings: ['This report uses an Azure DevOps preview API.'],
  };
  reportStore.put(report);
  sendJson(response, 201, { reportId, generatedAt, warnings: report.warnings });
}

async function exportReport(
  response: ServerResponse,
  report: StoredReport,
  extension: 'xlsx' | 'csv',
): Promise<void> {
  const filename = safeExportFilename(report.organization, report.generatedAt, extension);
  if (extension === 'xlsx') {
    const workbook = await generateReportWorkbook({
      ...report,
      warnings: report.warnings.map((message) => ({ message })),
    });
    response.writeHead(200, {
      ...securityHeaders,
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
    });
    response.end(Buffer.from(workbook));
    return;
  }
  const csv = toCsv(report.azureDevOpsCommitters as unknown as Record<string, unknown>[], [
    'displayName',
    'userPrincipalName',
    'organization',
    'resultType',
    'plan',
    'cuid',
    'identityId',
    'collectedAt',
  ]);
  response.writeHead(200, {
    ...securityHeaders,
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${filename}"`,
  });
  response.end(csv);
}

async function handleApi(
  request: IncomingMessage,
  response: ServerResponse,
  pathname: string,
  origin: string,
): Promise<void> {
  if (!isAuthorized(request, origin))
    return sendJson(response, 401, { message: 'Invalid local session.' });
  if (request.method === 'GET' && pathname === '/api/session') {
    return sendJson(response, 200, {
      authenticated: signedIn,
    });
  }
  if (request.method === 'POST' && pathname === '/api/auth/sign-in') {
    await acquireAzureDevOpsToken();
    signedIn = true;
    return sendJson(response, 200, { authenticated: true });
  }
  if (!signedIn) return sendJson(response, 401, { message: 'Sign in with Microsoft to continue.' });
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
  const reportMatch = pathname.match(/^\/api\/reports\/([^/]+)$/);
  if (request.method === 'GET' && reportMatch) {
    const report = reportForLocalUser(reportMatch[1]);
    if (!report) return sendJson(response, 404, { message: 'Report not found.' });
    return sendJson(response, 200, report);
  }
  const exportMatch = pathname.match(/^\/api\/reports\/([^/]+)\/export\.(xlsx|csv)$/);
  if (request.method === 'GET' && exportMatch) {
    const report = reportForLocalUser(exportMatch[1]);
    if (!report) return sendJson(response, 404, { message: 'Report not found.' });
    return exportReport(response, report, exportMatch[2] as 'xlsx' | 'csv');
  }
  return sendJson(response, 404, { message: 'Not found.' });
}

export async function startLocalServer(): Promise<Server> {
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
      const status = error instanceof AzureDevOpsAdapterError ? 502 : 500;
      sendJson(response, status, {
        message: error instanceof Error ? error.message : 'The local application failed.',
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
  if (process.env.COMMITTER_INSIGHTS_NO_BROWSER === 'true') {
    process.stdout.write(`Committer Insights is running at ${url}\n`);
  } else {
    openBrowser(url);
    process.stdout.write(`Committer Insights opened at http://${HOST}:${address.port}/\n`);
  }

  const shutdown = () => server.close(() => process.exit(0));
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
  return server;
}
