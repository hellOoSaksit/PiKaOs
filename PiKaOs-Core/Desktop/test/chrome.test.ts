import { it, expect, vi } from 'vitest'
import { removeAppMenu, registerDevtoolsShortcut, forwardMaximizeState } from '../src/main/chrome'

it('removeAppMenu clears the application menu', () => {
  const Menu = { setApplicationMenu: vi.fn() }
  removeAppMenu(Menu)
  expect(Menu.setApplicationMenu).toHaveBeenCalledWith(null)
})

it('registerDevtoolsShortcut wires F12 / Ctrl+Shift+I only in dev', () => {
  const toggleDevTools = vi.fn()
  const on = vi.fn()
  const win: any = { webContents: { on, toggleDevTools } }

  registerDevtoolsShortcut(win, true)   // packaged → no wiring
  expect(on).not.toHaveBeenCalled()

  registerDevtoolsShortcut(win, false)  // dev → wires before-input-event
  const handler = on.mock.calls.find((c) => c[0] === 'before-input-event')![1]
  handler({}, { type: 'keyDown', key: 'F12' })
  expect(toggleDevTools).toHaveBeenCalledTimes(1)
  handler({}, { type: 'keyDown', key: 'I', control: true, shift: true })
  expect(toggleDevTools).toHaveBeenCalledTimes(2)
  handler({}, { type: 'keyDown', key: 'a' })
  expect(toggleDevTools).toHaveBeenCalledTimes(2)  // unrelated key ignored
})

it('forwardMaximizeState pushes the boolean on maximize/unmaximize', () => {
  const handlers: Record<string, () => void> = {}
  const send = vi.fn()
  let maximized = false
  const win: any = {
    isDestroyed: () => false,
    isMaximized: () => maximized,
    on: (ev: string, cb: () => void) => { handlers[ev] = cb },
    webContents: { send },
  }
  forwardMaximizeState(win)
  maximized = true
  handlers['maximize']()
  expect(send).toHaveBeenCalledWith('window:maximizedChanged', true)
  maximized = false
  handlers['unmaximize']()
  expect(send).toHaveBeenCalledWith('window:maximizedChanged', false)
})
