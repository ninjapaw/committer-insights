const dateFormat = new Intl.DateTimeFormat('en-US', {
  timeZone: 'UTC',
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});
export const defaultReportTimeZone = 'UTC';
const timestampFormats = new Map<string, Intl.DateTimeFormat>();

function timestampFormat(timeZone = defaultReportTimeZone): Intl.DateTimeFormat {
  const zone = timeZone.trim() || defaultReportTimeZone;
  const existing = timestampFormats.get(zone);
  if (existing) return existing;
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: zone,
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    timestampFormats.set(zone, formatter);
    return formatter;
  } catch {
    return timestampFormat(defaultReportTimeZone);
  }
}

export function resolveReportTimeZone(timeZone?: string): string {
  return timestampFormat(timeZone).resolvedOptions().timeZone;
}

export function formatReportDateTime(value: string, timeZone = defaultReportTimeZone): string {
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(value);
  if (
    !dateOnly &&
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)
  )
    return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  if (dateOnly) return dateFormat.format(date);
  const formatter = timestampFormat(timeZone);
  return `${formatter.format(date)} ${formatter.resolvedOptions().timeZone}`;
}
