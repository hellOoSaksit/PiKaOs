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
