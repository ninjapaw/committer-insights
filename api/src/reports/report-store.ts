import type { Report } from '@ninjapaw/contracts';
import { newOpaqueId } from '../shared/ids.js';
import { config } from '../shared/config.js';

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
  const incompleteProviders = new Set(
    input.insights?.checks
      .filter(
        (check) =>
          (check.dataset === 'Security estimates' ||
            (check.provider === 'github' && check.dataset.includes('Repository activity'))) &&
          (check.status === 'unavailable' || check.status === 'partial'),
      )
      .map((check) => check.provider),
  );
  for (const source of input.sourceStatuses ?? [])
    if (source.status === 'skipped') incompleteProviders.add(source.provider);
  const report: Report = {
    ...input,
    reportId: newOpaqueId(),
    generatedAt: new Date().toISOString(),
    timeZone: config.report.timeZone(),
    costEstimates: input.costEstimates?.filter((line) => !incompleteProviders.has(line.provider)),
    warnings: [
      ...input.warnings,
      ...[...incompleteProviders].map(
        (provider) =>
          `${provider}: aggregate identity-based cost scenarios omitted because usage or estimate collection is incomplete. Missing data is not zero usage.${provider === 'azure-devops' && input.insights?.azureEstimates?.length ? ' Available provider-count enablement scenarios remain in the Azure billing section, with their completeness warnings.' : ''}`,
      ),
    ],
  };
  reportStore.put(report);
  return report;
}
