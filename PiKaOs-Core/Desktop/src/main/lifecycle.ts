// Instance lifecycle (crash spec 2026-07-20 §2.4) — two verified gaps in index.ts:
// 1. The single-instance lock HOLDER never listened for 'second-instance', so launching the app
//    again killed the new copy and brought nothing to front — reads as "nothing happened", and in
//    dev it IS the stale-instance trap (lessons §E: the old bundle keeps serving invisibly).
//    Focusing the existing window makes that state visible instead of silent.
// 2. Nothing called McpManager.stopAll() on shutdown, so spawned MCP children outlived the app.
// DI-structural like crash.ts/window.test.ts so tests never need real Electron.

interface AppLike { on(event: string, cb: (...args: any[]) => void): void }
interface FocusWindowLike {
  isMinimized(): boolean
  restore(): void
  show(): void
  focus(): void
}

/** Second launch → bring the running instance to front (restore if minimized). */
export function registerSingleInstanceFocus(app: AppLike, getWindow: () => FocusWindowLike | null): void {
  app.on('second-instance', () => {
    const win = getWindow()
    if (!win) return
    if (win.isMinimized()) win.restore()
    win.show()
    win.focus()
  })
}

/** App shutdown → kill every MCP child so none orphans. kill() sends a synchronous signal, so
 *  quit needs no delay; fire-and-forget is deliberate. */
export function registerQuitCleanup(app: AppLike, stopChildren: () => Promise<void>): void {
  app.on('before-quit', () => { void stopChildren() })
}
