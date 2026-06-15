import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// PiKaOs — Vite + React
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    open: true,
    // dev proxy → FastAPI backend (same-origin, no CORS). Backend runs in Docker.
    // Use 127.0.0.1 (not "localhost") so Node forces IPv4 — "localhost" can resolve
    // to ::1 on Windows and Docker's port-forward then resets the socket
    // ("socket hang up").
    // Timeout must cover the slowest endpoint: /api/compare probes a whole sitemap
    // in parallel and can take a couple of minutes on a large site. 30s was too
    // short and surfaced as a misleading "cannot reach server" in the UI.
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true, timeout: 120000, proxyTimeout: 120000 },
      '/ws': { target: 'http://127.0.0.1:8000', ws: true, changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
