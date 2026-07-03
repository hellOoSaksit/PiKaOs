import { defineConfig } from 'electron-vite'
// No renderer section: the renderer is the existing Frontend build, not rebuilt here (F6).
// Dev points the window at the Frontend Vite dev server (VITE_DEV_SERVER_URL); prod serves
// Frontend/dist via the app:// protocol (Task 5).
export default defineConfig({
  main:    { build: { outDir: 'out/main',    lib: { entry: 'src/main/index.ts' } } },
  preload: { build: { outDir: 'out/preload', lib: { entry: 'src/preload/index.ts' } } },
})
