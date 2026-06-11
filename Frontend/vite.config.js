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
    // ("socket hang up"). A small timeout keeps a not-yet-ready backend from hanging.
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true, timeout: 30000 },
      '/ws': { target: 'http://127.0.0.1:8000', ws: true, changeOrigin: true },
    },
  },
  build: { outDir: 'dist', sourcemap: true },
});
