import type { BrowserWindow } from 'electron'

// The default Electron menu (File/Edit/View/…) is removed for a native app feel. Its accelerators
// go with it, so DevTools is re-bound in dev only. (2026-07-12 window-chrome spec §3.1)
export function removeAppMenu(Menu: { setApplicationMenu(m: unknown): void }): void {
  Menu.setApplicationMenu(null)
}

export function registerDevtoolsShortcut(win: BrowserWindow, isPackaged: boolean): void {
  if (isPackaged) return
  win.webContents.on('before-input-event', (_e, input) => {
    if (input.type !== 'keyDown') return
    const key = String(input.key || '').toLowerCase()
    if (key === 'f12' || (input.control && input.shift && key === 'i')) {
      win.webContents.toggleDevTools()
    }
  })
}

// `frame:false` swallows the native maximize affordances, so the renderer owns the maximize↔restore
// icon and the maximized styling. Push the real state whenever it changes — including OS gestures
// (Win+Up, snap, double-click title). (spec §3.2)
export function forwardMaximizeState(win: BrowserWindow): void {
  const send = () => { if (!win.isDestroyed()) win.webContents.send('window:maximizedChanged', win.isMaximized()) }
  win.on('maximize', send)
  win.on('unmaximize', send)
}
