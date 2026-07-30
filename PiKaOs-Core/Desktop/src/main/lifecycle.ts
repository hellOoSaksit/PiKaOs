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
// Deliberately narrower than the real GatewayService: it exposes shutdown() and NOT setEnabled, so
// the quit path cannot even name the operator-intent setter without a type error. See
// makeQuitCleanup below for why that swap is the bug this shape guards against.
interface GatewayTeardownLike { shutdown(): Promise<unknown> }
interface McpChildrenLike { stopAll(): Promise<unknown> }

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

/** Builds the exact callback index.ts hands registerQuitCleanup. It used to be an inline lambda
 *  there, and index.ts has no test file — reverting `gateway.shutdown()` to `gateway.setEnabled(false)`
 *  left the whole suite green (measured) while re-creating the failure the shutdown()/setEnabled()
 *  split exists to prevent: setEnabled is the ONLY writer of gateway-state.json, so calling it here
 *  would record "off" on every exit, erase the operator's opt-in, and leave restore() with nothing to
 *  replay — the feature deletes itself on first quit. Extracted so a test can bind and assert the
 *  real callback; structural param types (above) like crash.ts, so no Electron and no real
 *  GatewayService/McpManager are needed to do it.
 *
 *  Both awaited so the returned promise doesn't settle until the gateway's pipe (an async
 *  net.Server.close, unlike MCP children's synchronous kill()) AND every MCP child have actually
 *  torn down — an earlier `void gateway.setEnabled(false)` dropped the gateway half entirely.
 *  registerQuitCleanup above still dispatches this via `void`, so the whole thing stays
 *  fire-and-forget from Electron's perspective and process exit remains the real backstop for the
 *  pipe handle. Awaiting here only makes the two teardowns run and finish TOGETHER when the event
 *  loop does get a turn before exit, instead of silently only running one of them. The .catch is
 *  part of that same contract: under a `void` dispatch a rejection would surface as an unhandled
 *  rejection at quit instead of a best-effort teardown that didn't quite finish. */
export function makeQuitCleanup(gateway: GatewayTeardownLike, manager: McpChildrenLike): () => Promise<void> {
  return () => Promise.all([gateway.shutdown(), manager.stopAll()]).then(() => undefined).catch(() => {})
}
