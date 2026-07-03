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
  win.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://pikaos') && url !== process.env.VITE_DEV_SERVER_URL) e.preventDefault()
  })

  // Deny every permission request (camera, mic, geolocation, notifications, ...) by default.
  session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false))

  win.once('ready-to-show', () => win.show())
  loadRenderer(win)
  return win
}

// Dev → the Frontend Vite dev server; prod → the bundled Frontend/dist via app://pikaos.
export function loadRenderer(win: BrowserWindow) {
  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) win.loadURL(devUrl)
  else win.loadURL('app://pikaos/index.html')
}
