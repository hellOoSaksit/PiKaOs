import { defineConfig } from 'vitest/config'

// Scope this project's suite to its OWN tests. `Frontend/` lives inside `Desktop/` (the renderer is the
// desktop UI — see electron.vite.config.ts), so vitest's default glob walks into `Frontend/src` and tries
// to run the renderer's suite against Desktop's node_modules, which has no react → ERR_MODULE_NOT_FOUND.
// It only appeared to work on a dev machine, where `Frontend/node_modules` happens to be installed and
// silently resolved the import — the renderer's tests were being run twice and counted as Desktop's.
// The renderer is covered by its own `frontend` CI job, from its own install.
export default defineConfig({
  test: { include: ['test/**/*.test.ts'] },
})
