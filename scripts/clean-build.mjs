import { rm } from 'node:fs/promises';

await Promise.all(
  ['../api/dist/', '../packages/contracts/dist/'].map((directory) =>
    rm(new URL(directory, import.meta.url), { recursive: true, force: true }),
  ),
);
