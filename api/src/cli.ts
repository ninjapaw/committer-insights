import { parseArgs } from 'node:util';
import { config } from './shared/config.js';
import { PRODUCT } from '@ninjapaw/developer-usage-insights-metadata';

export const launchHelp = `Usage: ${PRODUCT.slug} [--timezone <IANA timezone>] [--skip-update-check] [--version] [--help]

  --timezone <zone>  Display timezone, for example America/Toronto.
                     Overrides DEVELOPER_USAGE_INSIGHTS_TIMEZONE for this run.
                     Default: UTC when neither option nor environment is set.
  --help, -h         Show this help without starting the application.
  --version, -v      Show the release this copy was built from and exit.
  --skip-update-check
                     Run this installed copy without checking GitHub releases.
                     Use only for offline access, recovery, or local testing.

Environment:
  DEVELOPER_USAGE_INSIGHTS_AUTO_UPDATE=true|false
                     Default: true. Set false to disable startup update checks.
                     --skip-update-check always skips checks for this launch.

CSV timestamps and collection windows remain UTC.
Windows executables check for the newest published release, including betas, before startup.
`;

// Every platform build embeds the same metadata, so this is the one output that lets a user or
// support request confirm a Windows, macOS, and Linux install are on the same tagged release.
export const launchVersion = `${PRODUCT.displayName} ${PRODUCT.releaseTag} (${PRODUCT.version}, build ${PRODUCT.buildVersion})\n`;

export function parseLaunchOptions(args: string[]): {
  help: boolean;
  version: boolean;
  timeZone: string;
  skipUpdateCheck: boolean;
} {
  const { values } = parseArgs({
    args,
    options: {
      timezone: { type: 'string' },
      help: { type: 'boolean', short: 'h' },
      version: { type: 'boolean', short: 'v' },
      'skip-update-check': { type: 'boolean' },
    },
    strict: true,
    allowPositionals: false,
  });
  let timeZone = config.report.timeZone();
  const autoUpdate =
    process.env.DEVELOPER_USAGE_INSIGHTS_AUTO_UPDATE?.trim().toLowerCase() || 'true';
  if (!values.help && !values.version && !['true', 'false'].includes(autoUpdate)) {
    throw new Error(`Invalid ${PRODUCT.environmentPrefix}_AUTO_UPDATE. Use true or false.`);
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
    version: values.version ?? false,
    timeZone,
    skipUpdateCheck: values['skip-update-check'] === true || autoUpdate === 'false',
  };
}
