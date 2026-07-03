import { BrowserWindow } from 'electron'

// Minimal placeholder for Task 4 scaffolding only.
// Task 5 replaces this with the app:// protocol + real Frontend renderer loading;
// Task 12 hardens window/webPreferences security.
export function createWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
  })
  win.loadURL('about:blank')
  return win
}
