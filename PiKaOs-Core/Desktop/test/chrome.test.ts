import { it, expect, vi } from 'vitest'
import { removeAppMenu, registerDevtoolsShortcut, registerZoomShortcuts, forwardMaximizeState } from '../src/main/chrome'

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

it('registerZoomShortcuts zooms on Ctrl+=/-/0 and Ctrl+wheel, clamped to ±4', () => {
  const on = vi.fn()
  let level = 0
  const wc = {
    on,
    getZoomLevel: () => level,
    setZoomLevel: vi.fn((v: number) => { level = v }),
  }
  registerZoomShortcuts({ webContents: wc } as any)
  const keys = on.mock.calls.find((c) => c[0] === 'before-input-event')![1]
  const wheel = on.mock.calls.find((c) => c[0] === 'zoom-changed')![1]
  const noop = { preventDefault: () => {} }

  keys(noop, { type: 'keyDown', control: true, key: '=' })
  expect(level).toBe(0.5)
  keys(noop, { type: 'keyDown', control: true, key: '-' })
  expect(level).toBe(0)
  wheel({}, 'in')
  expect(level).toBe(0.5)
  keys(noop, { type: 'keyDown', control: true, key: '0' })
  expect(level).toBe(0)
  for (let i = 0; i < 20; i++) wheel({}, 'in')
  expect(level).toBe(4)                                   // clamped, never runaway
  keys(noop, { type: 'keyDown', key: '=' })               // no Ctrl → ignored
  expect(level).toBe(4)
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
