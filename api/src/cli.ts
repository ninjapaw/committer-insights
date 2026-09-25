import { parseArgs } from 'node:util';
import { config } from './shared/config.js';

export const launchHelp = `Usage: committer-insights [--timezone <IANA timezone>] [--skip-update-check] [--help]

  --timezone <zone>  Display timezone, for example America/Toronto.
                     Overrides COMMITTER_INSIGHTS_TIMEZONE for this run.
                     Default: UTC when neither option nor environment is set.
  --help, -h         Show this help without starting the application.
  --skip-update-check
                     Run this installed copy without checking GitHub releases.
                     Use only for offline access, recovery, or local testing.

Environment:
  COMMITTER_INSIGHTS_AUTO_UPDATE=true|false
                     Default: true. Set false to disable startup update checks.
                     --skip-update-check always skips checks for this launch.

CSV timestamps and collection windows remain UTC.
Windows executables check for the newest published release, including betas, before startup.
`;

export function parseLaunchOptions(args: string[]): {
  help: boolean;
  timeZone: string;
  skipUpdateCheck: boolean;
} {
  const { values } = parseArgs({
    args,
    options: {
      timezone: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
      'skip-update-check': { type: 'boolean' },
    },
    strict: true,
    allowPositionals: false,
  });
  let timeZone = config.report.timeZone();
  const autoUpdate = process.env.COMMITTER_INSIGHTS_AUTO_UPDATE?.trim().toLowerCase() || 'true';
  if (!values.help && !['true', 'false'].includes(autoUpdate)) {
    throw new Error('Invalid COMMITTER_INSIGHTS_AUTO_UPDATE. Use true or false.');
  }
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
  return {
    help: values.help ?? false,
    timeZone,
    skipUpdateCheck: values['skip-update-check'] === true || autoUpdate === 'false',
  };
}
