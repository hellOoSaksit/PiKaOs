// Last-resort crash handling (crash spec 2026-07-20). Deliberately dependency-free: this module
// must stay loadable when everything else (vault/broker/registry/config) is broken, and every
// external is injected so tests never need real Electron (window.test.ts precedent).
//
// Discipline: outcome-only one-line logs with a [crash] prefix (matches ipc.ts's [recovery]);
// stacks go to the main-process console only, NEVER into a dialog (generic-errors rule).

export const RENDER_CRASH_COOLDOWN_MS = 10_000
export const RENDER_CRASH_LOOP_COUNT = 2

// Centralised so the future main-process i18n pass (F8) is a one-edit swap — same deferral as
// confirmMcpStart's TODO(i18n) in index.ts.
export const STRINGS = {
  mainCrashMessage: 'PiKaOs hit an unexpected error and needs to restart.',
  mainCrashRelaunch: 'Relaunch',
  mainCrashQuit: 'Quit',
  rendererLoopMessage: 'The interface keeps crashing.',
  rendererReload: 'Reload',
  rendererRecovery: 'Open Recovery',
  rendererQuit: 'Quit',
}

// Structural types: the real electron `app`/`dialog`/`process` satisfy these, and tests pass fakes.
interface AppLike {
  relaunch(): void
  exit(code?: number): void
  quit(): void
  on(event: string, cb: (...args: any[]) => void): void
}
interface DialogLike { showMessageBox(opts: unknown): Promise<{ response: number }> }
interface ProcLike { on(event: string, cb: (...args: any[]) => void): void }

export interface CrashDeps {
  app: AppLike
  dialog: DialogLike
  proc?: ProcLike
  log?: (line: string) => void
}

/** Process-level last resort: main fatal → dialog → relaunch or quit; rejections log-only. */
export function registerCrashHandlers({ app, dialog, proc = process, log = console.error }: CrashDeps): void {
  let fatalDialogOpen = false

  proc.on('uncaughtException', (err: Error) => {
    log(`[crash] uncaughtException ${err?.name}: ${err?.message}`)
    // A second fatal while the dialog waits means the dialog path itself is broken — just die.
    if (fatalDialogOpen) { app.exit(1); return }
    fatalDialogOpen = true
    void dialog.showMessageBox({
      type: 'error',
      message: STRINGS.mainCrashMessage,
      buttons: [STRINGS.mainCrashRelaunch, STRINGS.mainCrashQuit],
      defaultId: 0,
      cancelId: 0,   // Esc = the safe path (relaunch) — the process is unrecoverable either way
    }).then(({ response }) => {
      if (response === 0) { app.relaunch(); app.exit(0) }
      else app.exit(1)
    })
  })

  // Most rejections are non-fatal (a failed fetch inside a handler must not kill the app).
  proc.on('unhandledRejection', (reason: unknown) => {
    log(`[crash] unhandledRejection ${String(reason)}`)
  })

  // Electron internal children (GPU/utility) — Chromium restarts them itself; MCP children are
  // NOT this event (child_process.spawn, owned + surfaced by McpManager). Visibility only.
  app.on('child-process-gone', (_e: unknown, details: { type?: string; reason?: string }) => {
    log(`[crash] child-process-gone ${details?.type} ${details?.reason}`)
  })
}

export interface CrashWindowLike {
  reload(): void
  loadURL(url: string): void
  isDestroyed(): boolean
  webContents: { on(event: string, cb: (...args: any[]) => void): void; getURL(): string }
}

// DevTools kills and normal teardown — not crashes.
const IGNORED_RENDER_REASONS = new Set(['clean-exit', 'killed'])

/** The Recovery boot flag rides the URL because at render-process-gone time there is no live
 *  renderer to execute JS into — the URL is the one channel main fully owns (spec §3). */
export function withRecoveryHash(url: string): string {
  return url.split('#')[0] + '#recovery'
}

/** Per-window renderer-crash policy: silent reload once (most crashes are transient), a native
 *  dialog on a loop — native so the decision surface can never re-crash with the SPA. */
export function registerRendererCrashHandler(
  win: CrashWindowLike,
  { app, dialog, log = console.error, now = Date.now }: CrashDeps & { now?: () => number },
): void {
  let lastCrashAt = 0
  let crashCount = 0
  let dialogOpen = false

  win.webContents.on('render-process-gone', (_e: unknown, details: { reason?: string; exitCode?: number }) => {
    const reason = details?.reason ?? 'unknown'
    if (IGNORED_RENDER_REASONS.has(reason)) return
    log(`[crash] render-process-gone ${reason} exitCode=${details?.exitCode}`)

    // The loop dialog owns the decision once it's up — a late crash (slow user) must not
    // reload the window out from under an open dialog whose .then() still targets it.
    if (dialogOpen) return

    const t = now()
    crashCount = t - lastCrashAt <= RENDER_CRASH_COOLDOWN_MS ? crashCount + 1 : 1
    lastCrashAt = t

    if (crashCount < RENDER_CRASH_LOOP_COUNT) { win.reload(); return }
    dialogOpen = true
    void dialog.showMessageBox({
      type: 'error',
      message: STRINGS.rendererLoopMessage,
      buttons: [STRINGS.rendererReload, STRINGS.rendererRecovery, STRINGS.rendererQuit],
      defaultId: 0,
      cancelId: 0,   // Esc = safe Reload, not Quit
    }).then(({ response }) => {
      dialogOpen = false
      if (win.isDestroyed()) return
      if (response === 0) { crashCount = 0; win.reload() }
      else if (response === 1) { crashCount = 0; win.loadURL(withRecoveryHash(win.webContents.getURL())) }
      else app.quit()
    })
  })
}
