import { defineConfig } from 'electron-vite'
// No renderer section: the renderer is the existing Frontend build, not rebuilt here (F6).
// Dev points the window at the Frontend Vite dev server (VITE_DEV_SERVER_URL); prod serves
// Desktop/Frontend/dist via the app:// protocol (Task 5).
// The shim is a SECOND main-process entry, not its own project: it is spawned by an external MCP
// client as plain Node (ELECTRON_RUN_AS_NODE), and building it here is what keeps its version
// welded to the app that serves it.
export default defineConfig({
  main:    { build: { outDir: 'out/main',    lib: { entry: ['src/main/index.ts', 'src/shim/pikaos-mcp.ts'] } } },
  preload: { build: { outDir: 'out/preload', lib: { entry: 'src/preload/index.ts' } } },
})
