import { startLocalServer } from './local-server.js';
import { launchHelp, parseLaunchOptions } from './cli.js';
import { launchLatestRelease } from './release-updater.js';

async function main(): Promise<void> {
  const options = parseLaunchOptions(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(launchHelp);
    return;
  }
  process.env.COMMITTER_INSIGHTS_TIMEZONE = options.timeZone;
  if (!options.skipUpdateCheck && (await launchLatestRelease(process.argv.slice(2)))) return;
  await startLocalServer();
}

void main().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Unable to start Committer Insights.'}\n`,
  );
  process.exitCode = 1;
});
