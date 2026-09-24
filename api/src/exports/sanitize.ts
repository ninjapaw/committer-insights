import type { ExportFormat } from '@ninjapaw/contracts';

export function safeExportFilename(
  subject: string,
  generatedAt: string,
  extension: ExportFormat,
): string {
  const safeSubject = subject.replace(/[^A-Za-z0-9-]/g, '_');
  const timestamp = generatedAt.replace(/[:.]/g, '-');
  return `active-committers-${safeSubject}-${timestamp}.${extension}`;
}

/**
 * Guards against spreadsheet formula injection. Values beginning with
 * =, +, -, or @ are prefixed with an apostrophe so spreadsheet
 * applications treat them as text, per OWASP CSV injection guidance.
 */
const DANGEROUS_PREFIXES = ['=', '+', '-', '@', '\t', '\r'];

export function sanitizeCellValue(value: unknown): string {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  if (DANGEROUS_PREFIXES.some((prefix) => stringValue.startsWith(prefix))) {
    return `'${stringValue}`;
  }
  return stringValue;
}

export function sanitizeCsvField(value: unknown): string {
  const safe = sanitizeCellValue(value);
  if (/[",\n\r]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  const header = columns.map((column) => sanitizeCsvField(column)).join(',');
  const lines = rows.map((row) => columns.map((column) => sanitizeCsvField(row[column])).join(','));
  return [header, ...lines].join('\r\n');
}
