import { parseArgs } from 'node:util';
import { config } from './shared/config.js';

export const launchHelp = `Usage: committer-insights [--timezone <IANA timezone>] [--help]

  --timezone <zone>  Display timezone, for example America/Toronto.
                     Overrides COMMITTER_INSIGHTS_TIMEZONE for this run.
                     Default: UTC when neither option nor environment is set.
  --help, -h         Show this help without starting the application.

CSV timestamps and collection windows remain UTC.
`;

export function parseLaunchOptions(args: string[]): { help: boolean; timeZone: string } {
  const { values } = parseArgs({
    args,
    options: {
      timezone: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
    },
    strict: true,
    allowPositionals: false,
  });
  let timeZone = config.report.timeZone();
  if (values.timezone !== undefined) {
    const requested = values.timezone.trim();
    try {
      if (!requested) throw new Error('Empty timezone');
      timeZone = new Intl.DateTimeFormat('en-US', { timeZone: requested }).resolvedOptions()
        .timeZone;
    } catch {
      throw new Error('Invalid --timezone. Use an IANA timezone such as America/Toronto or UTC.');
    }
  }
  return { help: values.help ?? false, timeZone };
}
