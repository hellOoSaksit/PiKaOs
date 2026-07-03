import { BrowserWindow } from 'electron'

// Minimal placeholder for Task 4 scaffolding only.
// Task 12 hardens window/webPreferences security.
export function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
  })
  loadRenderer(win)
  return win
}

// Dev → the Frontend Vite dev server; prod → the bundled Frontend/dist via app://pikaos.
export function loadRenderer(win: BrowserWindow) {
  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) win.loadURL(devUrl)
  else win.loadURL('app://pikaos/index.html')
}
