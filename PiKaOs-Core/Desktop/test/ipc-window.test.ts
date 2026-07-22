import { it, expect, vi, beforeEach } from 'vitest'

const handlers: Record<string, (...a: any[]) => any> = {}
const listeners: Record<string, (...a: any[]) => any> = {}
const fakeWc = { toggleDevTools: vi.fn(), getZoomLevel: vi.fn(() => 0), setZoomLevel: vi.fn() }
const fakeWin = {
  maximize: vi.fn(), unmaximize: vi.fn(),
  isMaximized: vi.fn(() => false), getBounds: vi.fn(() => ({ x: 100, y: 50, width: 800, height: 600 })),
  setPosition: vi.fn(), setBounds: vi.fn(), setTitleBarOverlay: vi.fn(),
  setFullScreen: vi.fn(), isFullScreen: vi.fn(() => false), webContents: fakeWc,
}
// `app` is captured at ipc.ts import time — isPackaged gates DevTools, quit ends the app. Mutable so a
// test can flip to a packaged build. vi.hoisted lets the (hoisted) electron mock reference it.
const mockApp = vi.hoisted(() => ({ isPackaged: false, quit: vi.fn() }))

// Cursor + display geometry for the restore-on-drag maths. Mutable so a test can park the cursor.
const mockScreen = vi.hoisted(() => ({
  getCursorScreenPoint: vi.fn(() => ({ x: 0, y: 0 })),
  getDisplayNearestPoint: vi.fn(() => ({ workArea: { x: 0, y: 0, width: 1920, height: 1040 } })),
}))

vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: any) => { handlers[ch] = fn },
    on: (ch: string, fn: any) => { listeners[ch] = fn },
  },
  BrowserWindow: { fromWebContents: vi.fn(() => fakeWin) },
  screen: mockScreen,
  app: mockApp,
}))

// A guarded handler needs a same-origin sender.
const appEvent = { senderFrame: { url: 'app://pikaos/index.html' }, sender: {} } as any

beforeEach(async () => {
  for (const k of Object.keys(handlers)) delete handlers[k]
  for (const k of Object.keys(listeners)) delete listeners[k]
  Object.values(fakeWin).forEach((f: any) => f.mockClear?.())
  Object.values(fakeWc).forEach((f) => f.mockClear())
  // mockClear leaves queued *Once values and overrides behind — restore the defaults these tests
  // assume, or one test's maximized window leaks into the next.
  fakeWin.isMaximized.mockReset().mockReturnValue(false)
  fakeWin.getBounds.mockReset().mockReturnValue({ x: 100, y: 50, width: 800, height: 600 })
  mockScreen.getCursorScreenPoint.mockReset().mockReturnValue({ x: 0, y: 0 })
  mockScreen.getDisplayNearestPoint.mockReset().mockReturnValue({ workArea: { x: 0, y: 0, width: 1920, height: 1040 } })
  mockApp.isPackaged = false
  mockApp.quit.mockClear()
  const { registerIpc } = await import('../src/main/ipc')
  registerIpc({
    vault: {}, broker: {}, registry: {}, manager: {},
    recovery: { diagnose: async () => [], repair: async () => ({ ok: true }), clear: async () => ({ ok: true }), clearHttpCache: async () => ({ ok: true }) },
  } as any)
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

/* setPosition drifts the SIZE on scaled displays (Electron DIP<->physical rounding, measured live at
   150%: 40 calls grew the window +34x+32) — a JS drag calls it per mousemove, so dragging visibly
   inflated the window. The drag must re-assert its captured size through setBounds every move. */
it('window:move re-asserts the drag-start size via setBounds — never bare setPosition', () => {
  listeners['window:move'](appEvent, 250, 175, 800, 600)
  expect(fakeWin.setBounds).toHaveBeenCalledWith({ x: 250, y: 175, width: 800, height: 600 })
  expect(fakeWin.setPosition).not.toHaveBeenCalled()
})

it('window:move rounds fractional coordinates and sizes', () => {
  listeners['window:move'](appEvent, 250.4, 175.6, 800.2, 599.8)
  expect(fakeWin.setBounds).toHaveBeenCalledWith({ x: 250, y: 176, width: 800, height: 600 })
})

it('window:move ignores a foreign-origin sender and non-finite input', () => {
  const evil = { senderFrame: { url: 'https://evil.com/' }, sender: {} } as any
  listeners['window:move'](evil, 9, 9, 800, 600)
  listeners['window:move'](appEvent, NaN, 5, 800, 600)
  listeners['window:move'](appEvent, 5, 5, Infinity, 600)
  expect(fakeWin.setBounds).not.toHaveBeenCalled()
  expect(fakeWin.setPosition).not.toHaveBeenCalled()
})

/* Dragging a MAXIMIZED window used to do nothing at all: window:move calls setPosition, which Windows
   ignores while a window is maximized. Combined with double-click-to-maximize on the full-width drag
   handle, a stray double-click left the window stuck maximized with no way to pull it back down by
   hand. Native Windows restores the window and lets it follow the cursor — that is what this verb does. */
it('window:restoreForDrag restores a maximized window under the cursor and reports the new bounds', () => {
  // maximized across a 1920-wide display, with Windows' invisible -7px overhang
  fakeWin.isMaximized.mockReturnValue(true)
  fakeWin.getBounds
    .mockReturnValueOnce({ x: -7, y: -7, width: 1934, height: 1054 })   // before unmaximize
    .mockReturnValueOnce({ x: 53, y: 82, width: 1000, height: 700 })    // restored size
  // cursor sits three-quarters across the title bar, 25px below the window top
  mockScreen.getCursorScreenPoint.mockReturnValue({ x: 1443, y: 18 })

  const out = handlers['window:restoreForDrag'](appEvent)

  expect(fakeWin.unmaximize).toHaveBeenCalled()
  // same PROPORTIONAL grab point: 0.75 across the restored 1000px width => cursor.x - 750.
  // setBounds with the restored size, not setPosition — see the size-drift note on window:move.
  expect(fakeWin.setBounds).toHaveBeenCalledWith({ x: 693, y: 0, width: 1000, height: 700 })
  // the caller re-anchors its drag on these, so they must be the post-move bounds
  expect(out).toEqual({ x: 693, y: 0, width: 1000, height: 700 })
})

it('window:restoreForDrag never lifts the title bar above the work area', () => {
  fakeWin.isMaximized.mockReturnValue(true)
  fakeWin.getBounds
    .mockReturnValueOnce({ x: 0, y: -7, width: 1920, height: 1054 })
    .mockReturnValueOnce({ x: 0, y: 0, width: 800, height: 600 })
  mockScreen.getCursorScreenPoint.mockReturnValue({ x: 960, y: 2 })   // grabY = 9 => y would be -7
  mockScreen.getDisplayNearestPoint.mockReturnValue({ workArea: { x: 0, y: 40, width: 1920, height: 1000 } })

  handlers['window:restoreForDrag'](appEvent)

  expect(fakeWin.setBounds).toHaveBeenCalledWith(expect.objectContaining({ y: 40 }))   // clamped to workArea.y
})

it('window:restoreForDrag is a no-op on a window that is not maximized', () => {
  fakeWin.isMaximized.mockReturnValue(false)
  expect(handlers['window:restoreForDrag'](appEvent)).toBeNull()
  expect(fakeWin.unmaximize).not.toHaveBeenCalled()
  expect(fakeWin.setBounds).not.toHaveBeenCalled()
})

it('window:restoreForDrag rejects a foreign-origin sender', () => {
  const evil = { senderFrame: { url: 'https://evil.com/' }, sender: {} } as any
  expect(() => handlers['window:restoreForDrag'](evil)).toThrow('forbidden sender')
  expect(fakeWin.unmaximize).not.toHaveBeenCalled()
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
