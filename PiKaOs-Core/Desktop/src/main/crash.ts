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
}
