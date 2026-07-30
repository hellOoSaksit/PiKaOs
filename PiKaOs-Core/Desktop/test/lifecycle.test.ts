import { it, expect, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { registerSingleInstanceFocus, registerQuitCleanup, makeQuitCleanup } from '../src/main/lifecycle'

class FakeApp {
  handlers: Record<string, (...a: any[]) => void> = {}
  on(ev: string, cb: (...a: any[]) => void) { this.handlers[ev] = cb }
  emit(ev: string, ...a: any[]) { this.handlers[ev]?.(...a) }
}

it('second-instance: restores a minimized window, shows and focuses it', () => {
  const app = new FakeApp()
  const win = { isMinimized: () => true, restore: vi.fn(), show: vi.fn(), focus: vi.fn() }
  registerSingleInstanceFocus(app as any, () => win as any)
  app.emit('second-instance')
  expect(win.restore).toHaveBeenCalled()
  expect(win.show).toHaveBeenCalled()
  expect(win.focus).toHaveBeenCalled()
})

it('second-instance with no window is a no-op, not a crash', () => {
  const app = new FakeApp()
  registerSingleInstanceFocus(app as any, () => null)
  expect(() => app.emit('second-instance')).not.toThrow()
})

it('before-quit stops all MCP children (no orphan processes)', () => {
  const app = new FakeApp()
  const stopAll = vi.fn(() => Promise.resolve())
  registerQuitCleanup(app as any, stopAll)
  app.emit('before-quit')
  expect(stopAll).toHaveBeenCalled()
})

// --- the quit-path teardown itself (makeQuitCleanup) ------------------------------------------
// The test above only proves registerQuitCleanup dispatches SOMETHING; these bind the real callback
// index.ts registers, because WHICH teardown it calls is the whole point (gateway/ipc.ts): the
// gateway's persisted opt-in survives quit only as long as the quit path uses shutdown().
const teardownFakes = () => ({
  // setEnabled is on the fake even though makeQuitCleanup's param type omits it — the fake has to be
  // able to record the wrong call for the assertion below to mean anything.
  gateway: { shutdown: vi.fn(() => Promise.resolve()), setEnabled: vi.fn(() => Promise.resolve()) },
  manager: { stopAll: vi.fn(() => Promise.resolve()) },
})

it('the quit teardown closes the gateway via shutdown(), never via setEnabled(false)', async () => {
  const { gateway, manager } = teardownFakes()
  await makeQuitCleanup(gateway, manager)()
  expect(gateway.shutdown).toHaveBeenCalledTimes(1)
  // Goes RED the moment someone "simplifies" this back to setEnabled(false): that is the only writer
  // of gateway-state.json, so quitting would persist "off", erase the operator's opt-in, and leave
  // restore() nothing to replay — the gateway would silently never come back after the first exit.
  expect(gateway.setEnabled).not.toHaveBeenCalled()
  // The other half of the same callback: MCP children must not outlive the app either.
  expect(manager.stopAll).toHaveBeenCalledTimes(1)
})

it('the quit teardown does not settle until BOTH the pipe and the MCP children are down', async () => {
  let closePipe!: () => void
  const gateway = { shutdown: vi.fn(() => new Promise<void>((r) => { closePipe = r })), setEnabled: vi.fn() }
  const manager = { stopAll: vi.fn(() => Promise.resolve()) }
  let done = false
  const settled = makeQuitCleanup(gateway, manager)().then(() => { done = true })
  await Promise.resolve()
  await Promise.resolve()
  expect(manager.stopAll).toHaveBeenCalled()   // dispatched together, not chained behind the pipe
  expect(done).toBe(false)                     // net.Server.close is async — the callback must wait
  closePipe()
  await settled
  expect(done).toBe(true)
})

it('a teardown that rejects still resolves — quit must not raise an unhandled rejection', async () => {
  const gateway = { shutdown: () => Promise.reject(new Error('pipe already gone')) }
  const manager = { stopAll: () => Promise.reject(new Error('child kill failed')) }
  await expect(makeQuitCleanup(gateway, manager)()).resolves.toBeUndefined()
})

// --- the wiring inside index.ts ----------------------------------------------------------------
// index.ts has no test file and cannot get one: importing it boots Electron. These three lines are
// the ones whose deletion no unit test above can see, and each silently disables the persisted-gateway
// feature, so they are pinned by reading the source — the same boundary-policing idiom as
// ai-system-prompt.test.ts's "no main-process rule string in a .jsx" scan.
//
// What these scans CANNOT see: liveness. `if (app.isPackaged) void gateway.restore()` keeps every pin
// below green while boot replay is dead in dev. They prove a line still exists, never that it runs —
// the live Electron UAT (enable → quit → relaunch ⇒ pipe listening under a new token) is what proves
// that, and it is still owed.
const mainSource = () => readFileSync(join(__dirname, '..', 'src', 'main', 'index.ts'), 'utf8')

it('index.ts registers the makeQuitCleanup callback and never touches setEnabled itself', () => {
  const src = mainSource()
  expect(src).toMatch(/registerQuitCleanup\(app,\s*makeQuitCleanup\(gateway,\s*manager\)\)/)
  // Scoped to the gateway on purpose. A bare `setEnabled` ban also trips on unrelated Electron APIs
  // (BrowserWindow.setEnabled), and it would have to be DELETED the day a tray or app-menu item
  // legitimately calls gateway.setEnabled from here — a pin that must die to let valid code land is a
  // pin that gets deleted instead of updated. `gateway.setEnabled` IS the failure mode; ban that.
  expect(src).not.toMatch(/gateway\.setEnabled/)
})

it('index.ts replays the operator\'s persisted gateway choice at boot', () => {
  // Without this the gateway is off after every launch until a human reopens the AI Access screen.
  expect(mainSource()).toMatch(/void gateway\.restore\(\)/)
})

it('index.ts returns after app.quit() when it loses the single-instance lock', () => {
  // app.quit() is async, so without the return the losing instance still runs whenReady → restore()
  // → writeHandshake(), rewriting the RUNNING instance's gateway.json with a pipe that dies with this
  // process and a token no client has.
  expect(mainSource()).toMatch(/if \(!gotLock\) \{\s*app\.quit\(\);\s*return\s*\}/)
})
