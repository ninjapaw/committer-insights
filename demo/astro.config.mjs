import { defineConfig } from 'astro/config';
import react from '@astrojs/react';
import process from 'node:process';

const base = process.env.DEMO_BASE_PATH ?? '/committer-insights';
if (!/^\/(?:[A-Za-z0-9_-]+\/)*[A-Za-z0-9_-]*$/.test(base))
  throw new Error('Invalid DEMO_BASE_PATH');

export default defineConfig({
  output: 'static',
  site: process.env.DEMO_SITE_URL ?? 'https://ninjapaw.github.io',
  base,
  trailingSlash: 'always',
  integrations: [react()],
  vite: { resolve: { dedupe: ['react', 'react-dom', '@tanstack/react-query'] } },
});
