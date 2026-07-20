import { it, expect, vi, beforeEach } from 'vitest'
import { registerCrashHandlers, STRINGS } from '../src/main/crash'

// Fake process/app/dialog in the window.test.ts style: capture handlers, invoke directly.
class FakeEmitter {
  handlers: Record<string, (...a: any[]) => void> = {}
  on(ev: string, cb: (...a: any[]) => void) { this.handlers[ev] = cb }
  emit(ev: string, ...a: any[]) { this.handlers[ev]?.(...a) }
}

function makeDeps(dialogResponse: Promise<{ response: number }>) {
  const proc = new FakeEmitter()
  const app = Object.assign(new FakeEmitter(), {
    relaunch: vi.fn(), exit: vi.fn(), quit: vi.fn(),
  })
  const dialog = { showMessageBox: vi.fn(() => dialogResponse) }
  const log = vi.fn()
  return { proc, app, dialog, log }
}

beforeEach(() => vi.restoreAllMocks())

it('uncaughtException → error dialog; Relaunch relaunches and exits 0', async () => {
  const d = makeDeps(Promise.resolve({ response: 0 }))
  registerCrashHandlers(d as any)
  d.proc.emit('uncaughtException', new Error('boom'))

  await vi.waitFor(() => expect(d.app.relaunch).toHaveBeenCalled())
  expect(d.app.exit).toHaveBeenCalledWith(0)
  const opts = d.dialog.showMessageBox.mock.calls[0][0] as any
  expect(opts.buttons).toEqual([STRINGS.mainCrashRelaunch, STRINGS.mainCrashQuit])
  // rule 10: the dialog carries the generic message, never the stack
  expect(JSON.stringify(opts)).not.toContain('boom')
  expect(d.log).toHaveBeenCalledWith(expect.stringContaining('[crash] uncaughtException'))
})

it('uncaughtException → Quit exits 1', async () => {
  const d = makeDeps(Promise.resolve({ response: 1 }))
  registerCrashHandlers(d as any)
  d.proc.emit('uncaughtException', new Error('boom'))
  await vi.waitFor(() => expect(d.app.exit).toHaveBeenCalledWith(1))
  expect(d.app.relaunch).not.toHaveBeenCalled()
})

it('a second fatal while the dialog is open exits 1 immediately — no dialog storm', () => {
  const d = makeDeps(new Promise(() => {}))   // dialog never resolves
  registerCrashHandlers(d as any)
  d.proc.emit('uncaughtException', new Error('one'))
  d.proc.emit('uncaughtException', new Error('two'))
  expect(d.dialog.showMessageBox).toHaveBeenCalledTimes(1)
  expect(d.app.exit).toHaveBeenCalledWith(1)
})

it('unhandledRejection logs and never exits/relaunches/dialogs', () => {
  const d = makeDeps(Promise.resolve({ response: 0 }))
  registerCrashHandlers(d as any)
  d.proc.emit('unhandledRejection', new Error('minor'))
  expect(d.log).toHaveBeenCalledWith(expect.stringContaining('[crash] unhandledRejection'))
  expect(d.app.exit).not.toHaveBeenCalled()
  expect(d.app.relaunch).not.toHaveBeenCalled()
  expect(d.dialog.showMessageBox).not.toHaveBeenCalled()
})

import { registerRendererCrashHandler, withRecoveryHash, RENDER_CRASH_COOLDOWN_MS } from '../src/main/crash'

function makeWin(url = 'http://localhost:5173/') {
  const wc = new FakeEmitter() as any
  wc.getURL = vi.fn(() => url)
  return {
    reload: vi.fn(), loadURL: vi.fn(), isDestroyed: () => false, webContents: wc,
    crash(reason = 'crashed') { wc.emit('render-process-gone', {}, { reason, exitCode: 5 }) },
  }
}

it('withRecoveryHash appends #recovery and replaces any existing hash', () => {
  expect(withRecoveryHash('http://localhost:5173/')).toBe('http://localhost:5173/#recovery')
  expect(withRecoveryHash('app://pikaos/index.html#old')).toBe('app://pikaos/index.html#recovery')
})

it('first renderer crash → one silent reload, no dialog', () => {
  const d = makeDeps(Promise.resolve({ response: 0 }))
  const win = makeWin()
  registerRendererCrashHandler(win as any, { ...d, now: () => 1000 } as any)
  win.crash()
  expect(win.reload).toHaveBeenCalledTimes(1)
  expect(d.dialog.showMessageBox).not.toHaveBeenCalled()
})

it('a second crash inside the cooldown → dialog, not another silent reload', () => {
  const d = makeDeps(new Promise(() => {}))
  const win = makeWin()
  let t = 1000
  registerRendererCrashHandler(win as any, { ...d, now: () => t } as any)
  win.crash(); t += 2000; win.crash()
  expect(win.reload).toHaveBeenCalledTimes(1)   // only the first crash reloaded
  const opts = d.dialog.showMessageBox.mock.calls[0][0] as any
  expect(opts.buttons).toEqual([STRINGS.rendererReload, STRINGS.rendererRecovery, STRINGS.rendererQuit])
})

it('a crash after the cooldown resets the counter → silent reload again', () => {
  const d = makeDeps(Promise.resolve({ response: 0 }))
  const win = makeWin()
  let t = 1000
  registerRendererCrashHandler(win as any, { ...d, now: () => t } as any)
  win.crash(); t += RENDER_CRASH_COOLDOWN_MS + 1; win.crash()
  expect(win.reload).toHaveBeenCalledTimes(2)
  expect(d.dialog.showMessageBox).not.toHaveBeenCalled()
})

it('loop dialog: Reload resets the counter and reloads', async () => {
  const d = makeDeps(Promise.resolve({ response: 0 }))
  const win = makeWin()
  let t = 1000
  registerRendererCrashHandler(win as any, { ...d, now: () => t } as any)
  win.crash(); t += 1000; win.crash()
  await vi.waitFor(() => expect(win.reload).toHaveBeenCalledTimes(2))  // 1 silent + 1 from Reload
  t += 1000; win.crash()                                              // counter was reset →
  expect(win.reload).toHaveBeenCalledTimes(3)                         // silent reload, no 2nd dialog
  expect(d.dialog.showMessageBox).toHaveBeenCalledTimes(1)
})

it('loop dialog: Open Recovery loads the current URL with #recovery', async () => {
  const d = makeDeps(Promise.resolve({ response: 1 }))
  const win = makeWin('app://pikaos/index.html')
  let t = 1000
  registerRendererCrashHandler(win as any, { ...d, now: () => t } as any)
  win.crash(); t += 1000; win.crash()
  await vi.waitFor(() =>
    expect(win.loadURL).toHaveBeenCalledWith('app://pikaos/index.html#recovery'))
})

it('loop dialog: Quit quits the app', async () => {
  const d = makeDeps(Promise.resolve({ response: 2 }))
  const win = makeWin()
  let t = 1000
  registerRendererCrashHandler(win as any, { ...d, now: () => t } as any)
  win.crash(); t += 1000; win.crash()
  await vi.waitFor(() => expect(d.app.quit).toHaveBeenCalled())
})

it('while the loop dialog is open, a later crash does not reload under it', () => {
  const d = makeDeps(new Promise(() => {}))   // dialog never resolves → stays open
  const win = makeWin()
  let t = 1000
  registerRendererCrashHandler(win as any, { ...d, now: () => t } as any)
  win.crash(); t += 1000; win.crash()          // 2nd crash → loop dialog opens
  expect(d.dialog.showMessageBox).toHaveBeenCalledTimes(1)
  const reloadsBefore = win.reload.mock.calls.length
  t += RENDER_CRASH_COOLDOWN_MS + 5000; win.crash()   // slow user: crash after cooldown, dialog still open
  expect(win.reload).toHaveBeenCalledTimes(reloadsBefore)   // no reload under the open dialog
  expect(d.dialog.showMessageBox).toHaveBeenCalledTimes(1)  // and no second dialog
})

it('intentional reasons (clean-exit, killed) are ignored entirely', () => {
  const d = makeDeps(Promise.resolve({ response: 0 }))
  const win = makeWin()
  registerRendererCrashHandler(win as any, { ...d, now: () => 1000 } as any)
  win.crash('clean-exit'); win.crash('killed')
  expect(win.reload).not.toHaveBeenCalled()
  expect(d.dialog.showMessageBox).not.toHaveBeenCalled()
})

it('child-process-gone (Electron internal) is logged, nothing else', () => {
  const d = makeDeps(Promise.resolve({ response: 0 }))
  registerCrashHandlers(d as any)
  d.app.emit('child-process-gone', {}, { type: 'GPU', reason: 'crashed' })
  expect(d.log).toHaveBeenCalledWith(expect.stringContaining('[crash] child-process-gone GPU crashed'))
  expect(d.dialog.showMessageBox).not.toHaveBeenCalled()
  expect(d.app.exit).not.toHaveBeenCalled()
})

it('a rejected main-fatal dialog still exits — the fatal path never hangs', async () => {
  const d = makeDeps(Promise.reject(new Error('no display')))
  registerCrashHandlers(d as any)
  d.proc.emit('uncaughtException', new Error('boom'))
  await vi.waitFor(() => expect(d.app.exit).toHaveBeenCalledWith(1))
})

it('a rejected loop dialog resets dialogOpen so the handler is not frozen', async () => {
  const d = makeDeps(Promise.reject(new Error('no display')))
  const win = makeWin()
  let t = 1000
  registerRendererCrashHandler(win as any, { ...d, now: () => t } as any)
  win.crash(); t += 1000; win.crash()                 // opens dialog #1, which rejects
  expect(d.dialog.showMessageBox).toHaveBeenCalledTimes(1)
  // A macrotask tick (not just one microtask) so the rejected promise's .then().catch() chain
  // fully flushes before we rely on dialogOpen having been reset back to false.
  await new Promise((r) => setTimeout(r, 0))
  t += 1000; win.crash()                              // must be able to open dialog #2, not frozen
  await vi.waitFor(() => expect(d.dialog.showMessageBox).toHaveBeenCalledTimes(2))
})

it('a crash on an already-destroyed window is a no-op', () => {
  const d = makeDeps(new Promise(() => {}))
  const win = makeWin()
  win.isDestroyed = () => true
  registerRendererCrashHandler(win as any, { ...d, now: () => 1000 } as any)
  win.crash()
  expect(win.reload).not.toHaveBeenCalled()
  expect(d.dialog.showMessageBox).not.toHaveBeenCalled()
})
