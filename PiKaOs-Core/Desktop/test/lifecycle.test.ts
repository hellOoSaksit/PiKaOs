import { it, expect, vi } from 'vitest'
import { registerSingleInstanceFocus, registerQuitCleanup } from '../src/main/lifecycle'

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
