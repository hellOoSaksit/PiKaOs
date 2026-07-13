import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// dev proxy → FastAPI backend (same-origin, no CORS). Vite runs ON THE HOST now (there is no
// frontend container), so it defaults to the backend's published port 127.0.0.1:8000 — IPv4
// forced (not "localhost", which can resolve to ::1 on Windows and then Docker's port-forward
// resets the socket, "socket hang up"). VITE_PROXY_TARGET can still override it.
const PROXY_TARGET = process.env.VITE_PROXY_TARGET || 'http://127.0.0.1:8000';

// PiKaOs — Vite + React
export default defineConfig({
  plugins: [react()],
  // Plugin folders under src/plugins/<id> are SYMLINKS into PiKaOs-App/plugins/<id>/frontend (the UAT
  // compose seam — Core itself ships none of them). Without this, Vite resolves a symlinked module to its
  // REAL path, so a plugin's `../../lib/foo.jsx` would resolve from PiKaOs-App/, not from src/. Keeping the
  // symlink path makes those relative imports resolve from src/plugins/<id> exactly as the plugin is written.
  // Safe here: node_modules is a flat install (no symlinks to dedup). (plugin-architecture.md §0, P2.)
  resolve: { preserveSymlinks: true },
  // The dep-scanner crawls every .html under root by default, which drags in
  // public/mascot/embed.html → its bare `three` imports. Those resolve at runtime via the
  // embed's own <script type="importmap"> (vendored three, no npm dep), but the scanner
  // doesn't read importmaps and errors "three ... could not be resolved". Scan the real
  // app entry only; the mascot stays an iframe-loaded static asset.
  optimizeDeps: { entries: ['index.html'] },
  server: {
    host: true,                                   // listen on 0.0.0.0 (harmless on the host; also lets a LAN device reach the dev server)
    port: 5173,
    open: process.env.VITE_OPEN === 'true',       // opt-in: the UI is the Electron shell, not a browser tab (set VITE_OPEN=true for a web-debug run)
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
