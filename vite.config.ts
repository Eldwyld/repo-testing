import { defineConfig } from 'vitest/config';
import type { Plugin } from 'vite';
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
// Offline build: only local media, and the browser is told to refuse every
// network request that is not to this machine (Intiface toys use a local
// websocket, so ws://localhost is allowed).
const OFFLINE_CSP = [
  "default-src 'self'",
  // The image resizer (pica) compiles WebAssembly and starts an inline worker
  // to make thumbnails locally; neither can reach the network.
  "script-src 'self' 'wasm-unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' data: blob: ws://localhost:* ws://127.0.0.1:*",
  "worker-src 'self' blob: data:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-src 'none'",
].join('; ');

const offlineHtml = (): Plugin => ({
  name: 'forge-offline-html',
  transformIndexHtml(html) {
    return html
      .replace(
        '<meta charset="UTF-8" />',
        `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${OFFLINE_CSP}" />`
      )
      .replace(/\s*<meta\s+(property|name)="(og|twitter):[^>]*>/g, '')
      .replace('<title>JOI.how</title>', '<title>JOI Forge (offline)</title>');
  },
});

export default defineConfig(({ mode }) => ({
  plugins: [
    react({
      babel: {
        plugins: [
          ['@babel/plugin-proposal-decorators', { version: '2023-05' }],
        ],
      },
    }),
    ...(mode === 'offline' ? [offlineHtml()] : []),
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
    sourcemap: mode !== 'offline',
    ...(mode === 'offline'
      ? { outDir: 'dist-offline/app', emptyOutDir: true }
      : {}),
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
}));
