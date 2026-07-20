import { it, expect, vi, beforeEach, afterEach } from 'vitest'

// Mandatory hardening (spec §9, Task 12) — exercise createWindow()'s security wiring without
// pulling in the real Electron runtime, the same style as ipc-origin.test.ts: a minimal fake
// BrowserWindow/shell/session that captures what createWindow() configures, then we invoke the
// captured handlers directly to assert their behavior.
class FakeBrowserWindow {
  static instances: FakeBrowserWindow[] = []
  opts: any
  webContents = { setWindowOpenHandler: vi.fn(), on: vi.fn() }
  loadURL = vi.fn()
  shown = false
  private onceHandlers: Record<string, () => void> = {}
  constructor(opts: any) {
    this.opts = opts
    FakeBrowserWindow.instances.push(this)
  }
  once(event: string, cb: () => void) {
    this.onceHandlers[event] = cb
  }
  show() {
    this.shown = true
  }
  triggerReadyToShow() {
    this.onceHandlers['ready-to-show']?.()
  }
}

const shellOpenExternal = vi.fn()
const setPermissionRequestHandler = vi.fn()

vi.mock('electron', () => ({
  BrowserWindow: FakeBrowserWindow,
  shell: { openExternal: shellOpenExternal },
  session: { defaultSession: { setPermissionRequestHandler } },
}))

const origDevUrl = process.env.VITE_DEV_SERVER_URL

beforeEach(() => {
  delete process.env.VITE_DEV_SERVER_URL
  FakeBrowserWindow.instances.length = 0
  shellOpenExternal.mockClear()
  setPermissionRequestHandler.mockClear()
})
afterEach(() => {
  if (origDevUrl) process.env.VITE_DEV_SERVER_URL = origDevUrl
  else delete process.env.VITE_DEV_SERVER_URL
})

it('sets sandbox, contextIsolation, nodeIntegration:false, webSecurity, a preload, and show:false', async () => {
  const { createWindow } = await import('../src/main/window')
  const win = createWindow() as unknown as FakeBrowserWindow

  expect(win.opts.show).toBe(false)
  expect(win.opts.webPreferences.sandbox).toBe(true)
  expect(win.opts.webPreferences.contextIsolation).toBe(true)
  expect(win.opts.webPreferences.nodeIntegration).toBe(false)
  expect(win.opts.webPreferences.webSecurity).toBe(true)
  expect(win.opts.webPreferences.preload).toMatch(/preload[/\\]index\.js$/)
})

it('uses a hidden title bar + Window Controls Overlay (avoids the frameless click-offset on scaled displays)', async () => {
  const { createWindow } = await import('../src/main/window')
  const win = createWindow() as unknown as FakeBrowserWindow

  expect(win.opts.titleBarStyle).toBe('hidden')
  expect(win.opts.titleBarOverlay).toMatchObject({ height: 36 })
  expect(win.opts.titleBarOverlay.color).toBeTruthy()
  expect(win.opts.titleBarOverlay.symbolColor).toBeTruthy()
  expect(win.opts.frame).toBeUndefined()
  expect(win.opts.backgroundColor).toBe('#f5f7fb')
})

it('shows the window only after ready-to-show fires', async () => {
  const { createWindow } = await import('../src/main/window')
  const win = createWindow() as unknown as FakeBrowserWindow

  expect(win.shown).toBe(false)
  win.triggerReadyToShow()
  expect(win.shown).toBe(true)
})

it('forces window.open / target=_blank links to the OS browser and denies the in-app popup', async () => {
  const { createWindow } = await import('../src/main/window')
  const win = createWindow() as unknown as FakeBrowserWindow

  const handler = win.webContents.setWindowOpenHandler.mock.calls[0][0]
  const result = handler({ url: 'https://example.com/doc' })

  expect(shellOpenExternal).toHaveBeenCalledWith('https://example.com/doc')
  expect(result).toEqual({ action: 'deny' })
})

it('blocks navigation away from app://pikaos and the dev server URL', async () => {
  process.env.VITE_DEV_SERVER_URL = 'http://localhost:5173'
  const { createWindow } = await import('../src/main/window')
  const win = createWindow() as unknown as FakeBrowserWindow

  const willNavigateCall = win.webContents.on.mock.calls.find((c) => c[0] === 'will-navigate')
  const onWillNavigate = willNavigateCall![1]

  const allowed = { preventDefault: vi.fn() }
  onWillNavigate(allowed, 'app://pikaos/index.html')
  expect(allowed.preventDefault).not.toHaveBeenCalled()

  const devServer = { preventDefault: vi.fn() }
  onWillNavigate(devServer, 'http://localhost:5173')
  expect(devServer.preventDefault).not.toHaveBeenCalled()

  const blocked = { preventDefault: vi.fn() }
  onWillNavigate(blocked, 'https://evil.example.com')
  expect(blocked.preventDefault).toHaveBeenCalled()

  // exact-origin: a lookalike host with the app:// scheme is a DIFFERENT origin and must be blocked
  const lookalike = { preventDefault: vi.fn() }
  onWillNavigate(lookalike, 'app://pikaosevil.com/index.html')
  expect(lookalike.preventDefault).toHaveBeenCalled()
})

it('allows a RELOAD of the dev server even at a trailing-slash / SPA path — window.location.reload() (and disconnect) navigate to the full document URL http://localhost:5173/, not the bare origin string, so an exact-string check silently blocks every in-app reload in dev', async () => {
  process.env.VITE_DEV_SERVER_URL = 'http://localhost:5173'
  const { createWindow } = await import('../src/main/window')
  const win = createWindow() as unknown as FakeBrowserWindow
  const onWillNavigate = win.webContents.on.mock.calls.find((c) => c[0] === 'will-navigate')![1]

  // the URL a reload / Vite full-reload actually navigates to: origin + '/', not the bare origin
  const reload = { preventDefault: vi.fn() }
  onWillNavigate(reload, 'http://localhost:5173/')
  expect(reload.preventDefault).not.toHaveBeenCalled()

  // an SPA sub-path on the same origin is still same-origin → allowed
  const subpath = { preventDefault: vi.fn() }
  onWillNavigate(subpath, 'http://localhost:5173/some/route')
  expect(subpath.preventDefault).not.toHaveBeenCalled()

  // a different host on the same port is a DIFFERENT origin → still blocked (guard stays strict)
  const lookalike = { preventDefault: vi.fn() }
  onWillNavigate(lookalike, 'http://localhost.evil.com:5173/')
  expect(lookalike.preventDefault).toHaveBeenCalled()
})

it('denies every permission request by default', async () => {
  const { createWindow } = await import('../src/main/window')
  createWindow()

  const callback = vi.fn()
  const handler = setPermissionRequestHandler.mock.calls[0][0]
  handler({}, 'camera', callback)
  expect(callback).toHaveBeenCalledWith(false)
})

it('loads app://pikaos/index.html in prod (no dev server URL)', async () => {
  const { createWindow } = await import('../src/main/window')
  const win = createWindow() as unknown as FakeBrowserWindow

  expect(win.loadURL).toHaveBeenCalledWith('app://pikaos/index.html')
})
