import { rm } from 'node:fs/promises';

await Promise.all(
  [
    '../api/dist/',
    '../app/dist/',
    '../build/',
    '../demo/.astro/',
    '../demo/dist/',
    '../packages/contracts/dist/',
    '../packages/metadata/dist/',
    '../release/',
  ].map((directory) => rm(new URL(directory, import.meta.url), { recursive: true, force: true })),
);
