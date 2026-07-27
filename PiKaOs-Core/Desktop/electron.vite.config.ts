import { defineConfig } from 'electron-vite'
// No renderer section: the renderer is the existing Frontend build, not rebuilt here (F6).
// Dev points the window at the Frontend Vite dev server (VITE_DEV_SERVER_URL); prod serves
// Desktop/Frontend/dist via the app:// protocol (Task 5).
// The shim (src/shim/pikaos-mcp.ts) used to be a SECOND main-process entry, spawned by an external
// MCP client as plain Node via ELECTRON_RUN_AS_NODE. That stopped working in a packaged build (the
// runAsNode fuse is off — electron-builder.yml, spec §9) so the shim's wiring is now an exported
// function that index.ts calls in-process (see the argv branch there); one main entry bundles it
// via ordinary module resolution, so a second build entry that could drift from index.ts's own
// wiring no longer earns its place.
export default defineConfig({
  main:    { build: { outDir: 'out/main',    lib: { entry: 'src/main/index.ts' } } },
  preload: { build: { outDir: 'out/preload', lib: { entry: 'src/preload/index.ts' } } },
})
