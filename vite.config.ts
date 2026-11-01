import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { execSync } from 'node:child_process';

// Build stamp shown in the Forge UI so a deployed build can be matched to a commit.
const forgeBuild = (() => {
  try {
    return execSync('git rev-parse --short HEAD', {
      stdio: ['ignore', 'pipe', 'ignore'],
    })
      .toString()
      .trim();
  } catch {
    return 'unknown';
  }
})();

// Hosts allowed to reach the dev/preview server, e.g. a tunnel in Colab.
// Unset = Vite's safe default (localhost only). "all" = any host.
// Otherwise a comma-separated list, e.g. ".loca.lt,.trycloudflare.com".
const envHosts = process.env.FORGE_ALLOWED_HOSTS?.trim();
const allowedHosts: true | string[] | undefined = !envHosts
  ? undefined
  : envHosts === 'all'
    ? true
    : envHosts
        .split(',')
        .map(h => h.trim())
        .filter(Boolean);

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react({
      babel: {
        plugins: [
          ['@babel/plugin-proposal-decorators', { version: '2023-05' }],
        ],
      },
    }),
  ],
  define: {
    __FORGE_BUILD__: JSON.stringify(forgeBuild),
  },
  server: {
    host: '0.0.0.0',
    port: 5224,
    ...(allowedHosts ? { allowedHosts } : {}),
  },
  preview: {
    port: 5224,
    ...(allowedHosts ? { allowedHosts } : {}),
  },
  build: {
    sourcemap: true,
  },
  optimizeDeps: {
    esbuildOptions: {
      sourcemap: false,
    },
    force: true,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    exclude: ['**/node_modules/**', 'scratch/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.d.ts', 'tests/**/*.test.ts'],
    },
  },
});
