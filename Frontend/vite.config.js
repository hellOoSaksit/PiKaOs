import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// dev proxy → FastAPI backend (same-origin, no CORS). The whole stack runs in Docker:
// the frontend container reaches the backend over the compose network as `backend:8000`
// (set via VITE_PROXY_TARGET). Running the dev server on the host instead? It defaults to
// 127.0.0.1:8000 — IPv4 forced (not "localhost", which can resolve to ::1 on Windows and
// then Docker's port-forward resets the socket, "socket hang up").
const PROXY_TARGET = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8000';

// PiKaOs — Vite + React
export default defineConfig({
  plugins: [react()],
  server: {
    host: true,                                   // listen on 0.0.0.0 so the container's dev server is reachable from the host
    port: 5173,
    open: process.env.VITE_OPEN !== 'false',      // no browser inside a container (compose sets VITE_OPEN=false)
    // File watching over a Windows→Docker bind mount misses native fs events — poll instead
    // (compose sets VITE_POLL=true) so hot reload still fires. Host runs leave it off.
    watch: process.env.VITE_POLL === 'true' ? { usePolling: true } : undefined,
    // Timeout must cover the slowest endpoint. Coverage now streams in small batches, but a
    // deep batch on a SLOW, WAF-throttled site (PROD pages ~15s + throttled image/link probes)
    // can still take ~1–2 min; 180s gives headroom so it doesn't drop as "cannot reach server".
    proxy: {
      '/api': { target: PROXY_TARGET, changeOrigin: true, timeout: 180000, proxyTimeout: 180000 },
      '/ws': { target: PROXY_TARGET, ws: true, changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
