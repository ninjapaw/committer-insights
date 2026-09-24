export function executableBundleOptions(clientId = '') {
  return {
    bundle: true,
    platform: 'node',
    target: 'node24',
    format: 'cjs',
    minify: true,
    sourcemap: false,
    // ESM browser-opening dependencies still need a file URL inside the CommonJS SEA bundle.
    banner: {
      js: 'const executableModuleUrl = require("node:url").pathToFileURL(__filename).href;',
    },
    define: {
      'import.meta.url': 'executableModuleUrl',
      __COMMITTER_INSIGHTS_CLIENT_ID__: JSON.stringify(clientId),
    },
  };
}
