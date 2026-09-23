import type { Report } from '@ninjapaw/contracts';
import { newOpaqueId } from '../shared/ids.js';

export type StoredReport = Report;

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

export function saveReport(input: Omit<Report, 'reportId' | 'generatedAt'>): Report {
  const report = { ...input, reportId: newOpaqueId(), generatedAt: new Date().toISOString() };
  reportStore.put(report);
  return report;
}
