import { app, type HttpRequest, type HttpResponseInit, type InvocationContext } from '@azure/functions';
import { AuthenticationRequiredError, validateBearerToken } from '../auth/bearer-token.js';
import { reportStore } from '../reports/report-store.js';
import { generateReportWorkbook, safeExportFilename } from '../exports/excel-workbook.js';
import { toCsv } from '../exports/sanitize.js';
import { newCorrelationId } from '../shared/ids.js';

async function exportXlsx(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const correlationId = newCorrelationId();
  try {
    const identity = await validateBearerToken(request.headers.get('authorization') ?? undefined);
    const reportId = request.params.reportId;
    const report = reportId ? reportStore.get(reportId, identity.subject, identity.tenantId) : undefined;
    if (!report) {
      return { status: 404, headers: { 'Cache-Control': 'no-store' }, jsonBody: { message: 'Report not found.', correlationId } };
    }
    const buffer = await generateReportWorkbook({
      organization: report.organization,
      plans: report.plans,
      retention: report.retention,
      sourceApiVersion: report.sourceApiVersion,
      generatedAt: report.generatedAt,
      azureDevOpsCommitters: report.azureDevOpsCommitters,
      gitHubCommitters: report.gitHubCommitters,
      combinedCommitters: report.combinedCommitters,
      warnings: report.warnings.map((message) => ({ message })),
    });
    const filename = safeExportFilename(report.organization, report.generatedAt, 'xlsx');
    return {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
      body: Buffer.from(buffer),
    };
  } catch (error) {
    context.error('Export failed', { correlationId });
    return { status: 500, headers: { 'Cache-Control': 'no-store' }, jsonBody: { message: 'Export failed.', correlationId } };
  }
}

app.http('exportXlsx', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'reports/{reportId}/export.xlsx',
  handler: exportXlsx,
});

async function exportCsv(request: HttpRequest, context: InvocationContext): Promise<HttpResponseInit> {
  const correlationId = newCorrelationId();
  try {
    const identity = await validateBearerToken(request.headers.get('authorization') ?? undefined);
    const reportId = request.params.reportId;
    const report = reportId ? reportStore.get(reportId, identity.subject, identity.tenantId) : undefined;
    if (!report) {
      return { status: 404, headers: { 'Cache-Control': 'no-store' }, jsonBody: { message: 'Report not found.', correlationId } };
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
    const filename = safeExportFilename(report.organization, report.generatedAt, 'csv');
    return {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
        'Cache-Control': 'no-store',
      },
      body: csv,
    };
  } catch (error) {
    if (error instanceof AuthenticationRequiredError) {
      return { status: 401, headers: { 'Cache-Control': 'no-store' }, jsonBody: { message: 'Your session has expired. Sign in again to continue.', correlationId } };
    }
    context.error('CSV export failed', { correlationId });
    return { status: 500, headers: { 'Cache-Control': 'no-store' }, jsonBody: { message: 'Export failed.', correlationId } };
  }
}

app.http('exportCsv', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'reports/{reportId}/export.csv',
  handler: exportCsv,
});

export { exportXlsx, exportCsv };
