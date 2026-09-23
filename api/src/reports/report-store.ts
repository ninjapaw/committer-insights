import type { AzureDevOpsCommitter } from '@ninjapaw/contracts';

export interface StoredReport {
  reportId: string;
  organization: string;
  plans: string[];
  generatedAt: string;
  sourceApiVersion: string;
  azureDevOpsCommitters: AzureDevOpsCommitter[];
  warnings: string[];
}

/** In-memory report store. Closing the local process destroys every report. */
export class InMemoryReportStore {
  private readonly reports = new Map<string, StoredReport>();

  put(report: StoredReport): void {
    this.reports.set(report.reportId, report);
  }

  get(reportId: string): StoredReport | undefined {
    return this.reports.get(reportId);
  }
}

export const reportStore = new InMemoryReportStore();
