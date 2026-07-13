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

// Removing the app menu also removed the zoom accelerators its roles provided, so page zoom is
// re-bound here for every build: Ctrl+= / Ctrl+- / Ctrl+0 and Ctrl+wheel. Levels are clamped so a
// runaway zoom can't make the UI unrecoverable (each level step is ×1.2).
const ZOOM_MIN = -4, ZOOM_MAX = 4
export function registerZoomShortcuts(win: BrowserWindow): void {
  const wc = win.webContents
  const zoomBy = (delta: number) =>
    wc.setZoomLevel(Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, wc.getZoomLevel() + delta)))
  wc.on('before-input-event', (e, input) => {
    if (input.type !== 'keyDown' || !input.control || input.alt) return
    const key = String(input.key || '')
    if (key === '=' || key === '+') { zoomBy(+0.5); e.preventDefault() }
    else if (key === '-') { zoomBy(-0.5); e.preventDefault() }
    else if (key === '0') { wc.setZoomLevel(0); e.preventDefault() }
  })
  wc.on('zoom-changed', (_e, direction) => zoomBy(direction === 'in' ? +0.5 : -0.5))
}

// The window has no native title bar (WCO), so the renderer owns the maximized styling (hairline
// ring dropped when maximized). Push the real state whenever it changes — including OS gestures
// (Win+Up, snap, double-click the drag handle). (spec §3.2)
export function forwardMaximizeState(win: BrowserWindow): void {
  const send = () => { if (!win.isDestroyed()) win.webContents.send('window:maximizedChanged', win.isMaximized()) }
  win.on('maximize', send)
  win.on('unmaximize', send)
}
