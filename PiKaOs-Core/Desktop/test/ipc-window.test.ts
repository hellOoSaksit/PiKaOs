import { it, expect, vi, beforeEach } from 'vitest'

const handlers: Record<string, (...a: any[]) => any> = {}
const fakeWin = { minimize: vi.fn(), maximize: vi.fn(), unmaximize: vi.fn(), close: vi.fn(), isMaximized: vi.fn(() => false) }

vi.mock('electron', () => ({
  ipcMain: { handle: (ch: string, fn: any) => { handlers[ch] = fn } },
  BrowserWindow: { fromWebContents: vi.fn(() => fakeWin) },
}))

// A guarded handler needs a same-origin sender.
const appEvent = { senderFrame: { url: 'app://pikaos/index.html' }, sender: {} } as any

beforeEach(async () => {
  for (const k of Object.keys(handlers)) delete handlers[k]
  Object.values(fakeWin).forEach((f: any) => f.mockClear?.())
  const { registerIpc } = await import('../src/main/ipc')
  registerIpc({ vault: {}, broker: {}, registry: {}, manager: {} } as any)
})

it('registers the four window channels', () => {
  for (const ch of ['window:minimize', 'window:toggleMaximize', 'window:close', 'window:isMaximized'])
    expect(typeof handlers[ch]).toBe('function')
})

it('window:minimize minimizes the sender window', () => {
  handlers['window:minimize'](appEvent)
  expect(fakeWin.minimize).toHaveBeenCalled()
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
  expect(() => handlers['window:close'](evil)).toThrow('forbidden sender')
  expect(fakeWin.close).not.toHaveBeenCalled()
})
