import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    __DEVELOPER_USAGE_INSIGHTS_THEME__: JSON.stringify(
      process.env.DEVELOPER_USAGE_INSIGHTS_THEME ?? 'dark',
    ),
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
  },
});
