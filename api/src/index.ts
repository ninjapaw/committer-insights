import { startLocalServer } from './local-server.js';
import { launchHelp, launchVersion, parseLaunchOptions } from './cli.js';
import { launchLatestRelease, reportAvailableUpdate } from './release-updater.js';
import { isSea } from 'node:sea';
import { prepareAzureCli } from './auth/azure-cli-binary.js';
import { PRODUCT } from '@ninjapaw/developer-usage-insights-metadata';

async function main(): Promise<void> {
  const options = parseLaunchOptions(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(launchHelp);
    return;
  }
  if (options.version) {
    process.stdout.write(launchVersion);
    return;
  }
  process.env.DEVELOPER_USAGE_INSIGHTS_TIMEZONE = options.timeZone;
  if (!options.skipUpdateCheck && (await launchLatestRelease(process.argv.slice(2)))) return;
  // launchLatestRelease only self-updates single-file executables. The macOS .app and the
  // Linux tarball fall through to an advisory notice printed in the launcher terminal.
  if (!options.skipUpdateCheck && !isSea()) await reportAvailableUpdate();
  if (process.platform === 'win32' && isSea()) {
    try {
      await prepareAzureCli((message) => process.stdout.write(`${message}\n`));
      process.stdout.write('Microsoft sign-in runtime ready.\n');
    } catch {
      process.stderr.write(
        'Microsoft sign-in runtime preparation failed. Restart the app to retry; GitHub remains available.\n',
      );
    }
  }
  await startLocalServer();
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : `Unable to start ${PRODUCT.displayName}.`}\n`,
  );
  process.exitCode = 1;
});
