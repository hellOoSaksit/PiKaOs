import { it, expect, vi, beforeEach } from 'vitest'

const handlers: Record<string, (...a: any[]) => any> = {}
const listeners: Record<string, (...a: any[]) => any> = {}
const fakeWin = {
  maximize: vi.fn(), unmaximize: vi.fn(),
  isMaximized: vi.fn(() => false), getBounds: vi.fn(() => ({ x: 100, y: 50, width: 800, height: 600 })),
  setPosition: vi.fn(), setTitleBarOverlay: vi.fn(),
}

vi.mock('electron', () => ({
  ipcMain: {
    handle: (ch: string, fn: any) => { handlers[ch] = fn },
    on: (ch: string, fn: any) => { listeners[ch] = fn },
  },
  BrowserWindow: { fromWebContents: vi.fn(() => fakeWin) },
}))

// A guarded handler needs a same-origin sender.
const appEvent = { senderFrame: { url: 'app://pikaos/index.html' }, sender: {} } as any

beforeEach(async () => {
  for (const k of Object.keys(handlers)) delete handlers[k]
  for (const k of Object.keys(listeners)) delete listeners[k]
  Object.values(fakeWin).forEach((f: any) => f.mockClear?.())
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
