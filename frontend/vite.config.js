/**
 * @file frontend/vite.config.js
 * @description Vite build configuration with manual chunk splitting
 *   strategy so the initial JS payload stays small.
 * @author Dev B
 *
 * Chunking strategy (Rollup `manualChunks`):
 *
 *   1. `vendor-react`   — react + react-dom. The single largest dep
 *      group; ships on every page so it's worth a dedicated chunk that
 *      caches independently of app code (only invalidates when React
 *      itself upgrades).
 *   2. `vendor-router`  — react-router-dom. Small but core; isolated so
 *      a router upgrade doesn't bust the React cache and vice versa.
 *   3. `vendor-axios`   — axios. Lives separately because the axios
 *      instance is required by virtually every page; keeping it out of
 *      the per-page bundles avoids duplicating it across chunks.
 *   4. `vendor-misc`    — everything else from node_modules (small
 *      utilities, polyfills). Default catch-all so per-page chunks
 *      stay clean.
 *
 *   Per-page chunks are produced automatically by Rollup from the
 *   `React.lazy(() => import('./pages/...'))` calls in App.jsx — no
 *   manual config needed.
 *
 *   `chunkSizeWarningLimit` is raised to 600KB because the dashboard
 *   page (lots of charts in later commits) is expected to grow past
 *   the 500KB default. Anything over 600KB should trigger a real
 *   investigation.
 *
 * The `manualChunks` function receives the absolute module path; we do
 * a simple substring match. Order matters — more-specific matches must
 * come before the generic node_modules fallback.
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  build: {
    // Larger limit so the perf warning only fires on real regressions,
    // not on the expected dashboard / charting page size.
    chunkSizeWarningLimit: 600,

    rollupOptions: {
      output: {
        /**
         * Decide which chunk a given module belongs to. Returning
         * `undefined` lets Rollup decide (per-page chunks fall through
         * to the lazy-import boundary).
         *
         * @param {string} id - Absolute path of the module being bundled
         * @returns {string|void}
         */
        manualChunks: (id) => {
          if (!id.includes('node_modules')) return undefined;

          // Most-specific matches first.
          if (id.includes('react-router')) return 'vendor-router';
          if (id.includes('react-dom') || /[\\/]react[\\/]/.test(id)) {
            return 'vendor-react';
          }
          if (id.includes('axios')) return 'vendor-axios';

          // Catch-all for the remaining node_modules deps.
          return 'vendor-misc';
        },
      },
    },
  },

  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:5001',
        changeOrigin: true,
      },
    },
  },

  // Dev-server hint: prebundle the heavy deps so `vite` cold-starts fast.
  optimizeDeps: {
    include: ['react', 'react-dom', 'react-router-dom', 'axios'],
  },
});
