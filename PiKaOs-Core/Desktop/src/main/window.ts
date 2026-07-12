import { BrowserWindow, shell, session } from 'electron'
import { join } from 'node:path'

// Mandatory hardening checklist (spec §9) — every item ships in the first build, none optional:
// sandbox + contextIsolation + no nodeIntegration, external links forced to the OS browser,
// navigation locked to app://pikaos (+ the dev server URL), permission prompts deny-by-default.
export function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    show: false,
    frame: false,          // custom title bar — the renderer draws minimize/maximize/close
    transparent: true,     // corners outside `.app`'s radius show through → real rounded frame
    // Fully transparent: the opaque surface is `.app` (100vh) in the renderer, which also carries
    // the rounded border + shadow. A transparent window that paints an opaque colour would fill
    // the rounded corners back in. (2026-07-12 window-chrome spec §3.1 / §7)
    backgroundColor: '#00000000',
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      preload: join(__dirname, '../preload/index.js'),
    },
  })

  // Any target="_blank" / window.open goes to the OS browser instead of a new Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  // Block navigation away from the bundled app (or the dev server while developing).
  // Parse and compare the origin EXACTLY — a startsWith('app://pikaos') check would also pass
  // app://pikaosevil.com, a *different* Chromium origin that would slip outside the CSP's
  // app://pikaos allowances.
  win.webContents.on('will-navigate', (e, url) => {
    if (!isAllowedNavigation(url)) e.preventDefault()
  })

  // Deny every permission request (camera, mic, geolocation, notifications, ...) by default.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))

  win.once('ready-to-show', () => win.show())
  loadRenderer(win)
  return win
}

// Exact-origin navigation allow-check: only the bundled app origin (app://pikaos) or the exact
// dev server URL. Rejects lookalike hosts (app://pikaosevil.com) and unparseable URLs.
export function isAllowedNavigation(url: string): boolean {
  if (process.env.VITE_DEV_SERVER_URL && url === process.env.VITE_DEV_SERVER_URL) return true
  try {
    const u = new URL(url)
    return u.protocol === 'app:' && u.host === 'pikaos'
  } catch {
    return false
  }
}

// Dev → the Frontend Vite dev server; prod → the bundled Frontend/dist via app://pikaos.
export function loadRenderer(win: BrowserWindow) {
  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) win.loadURL(devUrl)
  else win.loadURL('app://pikaos/index.html')
}
