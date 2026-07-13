import { it, expect, vi, beforeEach } from 'vitest'

const handlers: Record<string, (...a: any[]) => any> = {}
const listeners: Record<string, (...a: any[]) => any> = {}
const fakeWc = { toggleDevTools: vi.fn(), getZoomLevel: vi.fn(() => 0), setZoomLevel: vi.fn() }
const fakeWin = {
  maximize: vi.fn(), unmaximize: vi.fn(),
  isMaximized: vi.fn(() => false), getBounds: vi.fn(() => ({ x: 100, y: 50, width: 800, height: 600 })),
  setPosition: vi.fn(), setTitleBarOverlay: vi.fn(),
  setFullScreen: vi.fn(), isFullScreen: vi.fn(() => false), webContents: fakeWc,
}
// `app` is captured at ipc.ts import time — isPackaged gates DevTools, quit ends the app. Mutable so a
// test can flip to a packaged build. vi.hoisted lets the (hoisted) electron mock reference it.
const mockApp = vi.hoisted(() => ({ isPackaged: false, quit: vi.fn() }))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: any) => { handlers[ch] = fn },
    on: (ch: string, fn: any) => { listeners[ch] = fn },
  },
  BrowserWindow: { fromWebContents: vi.fn(() => fakeWin) },
  app: mockApp,
}))

// A guarded handler needs a same-origin sender.
const appEvent = { senderFrame: { url: 'app://pikaos/index.html' }, sender: {} } as any

beforeEach(async () => {
  for (const k of Object.keys(handlers)) delete handlers[k]
  for (const k of Object.keys(listeners)) delete listeners[k]
  Object.values(fakeWin).forEach((f: any) => f.mockClear?.())
  Object.values(fakeWc).forEach((f) => f.mockClear())
  mockApp.isPackaged = false
  mockApp.quit.mockClear()
  const { registerIpc } = await import('../src/main/ipc')
  registerIpc({ vault: {}, broker: {}, registry: {}, manager: {} } as any)
})

it('registers the window channels (and no dead minimize/close verbs)', () => {
  for (const ch of ['window:toggleMaximize', 'window:isMaximized', 'window:getBounds', 'window:setTitleBarOverlay'])
    expect(typeof handlers[ch]).toBe('function')
  // WCO draws min/close natively — the old renderer verbs must stay deleted
  expect(handlers['window:minimize']).toBeUndefined()
  expect(handlers['window:close']).toBeUndefined()
})

it('window:toggleMaximize maximizes when not maximized, unmaximizes when maximized', () => {
  fakeWin.isMaximized.mockReturnValueOnce(false)
  handlers['window:toggleMaximize'](appEvent)
  expect(fakeWin.maximize).toHaveBeenCalled()
  fakeWin.isMaximized.mockReturnValueOnce(true)
  handlers['window:toggleMaximize'](appEvent)
  expect(fakeWin.unmaximize).toHaveBeenCalled()
})

it('rejects a foreign-origin sender (guard holds)', () => {
  const evil = { senderFrame: { url: 'https://evil.com/' }, sender: {} } as any
  expect(() => handlers['window:toggleMaximize'](evil)).toThrow('forbidden sender')
  expect(fakeWin.maximize).not.toHaveBeenCalled()
})

it('window:setTitleBarOverlay forwards valid hex colors and rejects anything else', () => {
  handlers['window:setTitleBarOverlay'](appEvent, { color: '#171a21', symbolColor: '#828a97' })
  expect(fakeWin.setTitleBarOverlay).toHaveBeenCalledWith({ color: '#171a21', symbolColor: '#828a97', height: 36 })
  for (const bad of [{ color: 'red', symbolColor: '#ffffff' }, { color: '#fff', symbolColor: '#ffffff' }, {}, null])
    expect(() => handlers['window:setTitleBarOverlay'](appEvent, bad)).toThrow('invalid overlay colors')
})

it('window:getBounds returns the sender window bounds', () => {
  expect(handlers['window:getBounds'](appEvent)).toMatchObject({ x: 100, y: 50 })
})

it('window:move sets the position for a same-origin sender and ignores foreign ones', () => {
  listeners['window:move'](appEvent, 250, 175)
  expect(fakeWin.setPosition).toHaveBeenCalledWith(250, 175)
  fakeWin.setPosition.mockClear()
  const evil = { senderFrame: { url: 'https://evil.com/' }, sender: {} } as any
  listeners['window:move'](evil, 9, 9)
  expect(fakeWin.setPosition).not.toHaveBeenCalled()
})

it('window:toggleDevTools opens DevTools in dev but is a no-op in a packaged build', () => {
  // dev build → toggles
  handlers['window:toggleDevTools'](appEvent)
  expect(fakeWc.toggleDevTools).toHaveBeenCalledTimes(1)
  // packaged build → the hard-rule gate must swallow it (never openable from a release)
  fakeWc.toggleDevTools.mockClear()
  mockApp.isPackaged = true
  handlers['window:toggleDevTools'](appEvent)
  expect(fakeWc.toggleDevTools).not.toHaveBeenCalled()
})

it('window:quit ends the app for a same-origin sender and rejects a foreign one', () => {
  handlers['window:quit'](appEvent)
  expect(mockApp.quit).toHaveBeenCalledTimes(1)
  const evil = { senderFrame: { url: 'https://evil.com/' }, sender: {} } as any
  expect(() => handlers['window:quit'](evil)).toThrow('forbidden sender')
  expect(mockApp.quit).toHaveBeenCalledTimes(1)
})

it('window:toggleFullscreen flips the sender window fullscreen state', () => {
  fakeWin.isFullScreen.mockReturnValueOnce(false)
  handlers['window:toggleFullscreen'](appEvent)
  expect(fakeWin.setFullScreen).toHaveBeenCalledWith(true)
  fakeWin.isFullScreen.mockReturnValueOnce(true)
  handlers['window:toggleFullscreen'](appEvent)
  expect(fakeWin.setFullScreen).toHaveBeenCalledWith(false)
})

it('window:zoom steps by ±0.5, resets to 0, and clamps to ±4', () => {
  handlers['window:zoom'](appEvent, 'reset')
  expect(fakeWc.setZoomLevel).toHaveBeenLastCalledWith(0)
  fakeWc.getZoomLevel.mockReturnValue(0)
  handlers['window:zoom'](appEvent, 'in')
  expect(fakeWc.setZoomLevel).toHaveBeenLastCalledWith(0.5)
  handlers['window:zoom'](appEvent, 'out')
  expect(fakeWc.setZoomLevel).toHaveBeenLastCalledWith(-0.5)
  // clamp: already at the +4 ceiling, another step-in stays at 4
  fakeWc.getZoomLevel.mockReturnValue(4)
  handlers['window:zoom'](appEvent, 'in')
  expect(fakeWc.setZoomLevel).toHaveBeenLastCalledWith(4)
})
