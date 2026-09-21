import type {
  AzureDevOpsCommitter,
  CombinedCommitter,
  GitHubCommitter,
  Retention,
} from '@ninjapaw/contracts';

export interface StoredReport {
  reportId: string;
  ownerSubject: string;
  ownerTenantId: string;
  organization: string;
  plans: string[];
  retention: Retention;
  generatedAt: string;
  sourceApiVersion: string;
  azureDevOpsCommitters: AzureDevOpsCommitter[];
  gitHubCommitters: GitHubCommitter[];
  combinedCommitters: CombinedCommitter[];
  warnings: string[];
  expiresAt?: string;
}

/**
 * In-memory report store for retention="none"/"session" semantics in this
 * initial iteration. Reports are never persisted to durable storage unless
 * retention="thirty-days" is selected (not yet wired to durable storage;
 * see docs/BUILD_REPORT.md).
 */
export class InMemoryReportStore {
  private readonly reports = new Map<string, StoredReport>();

  put(report: StoredReport): void {
    this.reports.set(report.reportId, report);
  }

  /** Returns the report only if the requester owns it, enforcing per-tenant isolation. */
  get(reportId: string, ownerSubject: string, ownerTenantId: string): StoredReport | undefined {
    const report = this.reports.get(reportId);
    if (!report) return undefined;
    if (report.ownerSubject !== ownerSubject || report.ownerTenantId !== ownerTenantId) {
      return undefined;
    }
    if (report.expiresAt && new Date(report.expiresAt).getTime() < Date.now()) {
      this.reports.delete(reportId);
      return undefined;
    }
    return report;
  }

  delete(reportId: string, ownerSubject: string, ownerTenantId: string): boolean {
    const report = this.get(reportId, ownerSubject, ownerTenantId);
    if (!report) return false;
    return this.reports.delete(reportId);
  }
}

export const reportStore = new InMemoryReportStore();
