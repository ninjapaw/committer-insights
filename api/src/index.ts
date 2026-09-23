import { startLocalServer } from './local-server.js';

void startLocalServer().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : 'Unable to start Committer Insights.'}\n`,
  );
  process.exitCode = 1;
});
