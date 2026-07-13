import { BrowserWindow, shell, session } from 'electron'
import { join } from 'node:path'

// Mandatory hardening checklist (spec §9) — every item ships in the first build, none optional:
// sandbox + contextIsolation + no nodeIntegration, external links forced to the OS browser,
// navigation locked to app://pikaos (+ the dev server URL), permission prompts deny-by-default.
export function createWindow(): BrowserWindow {
  // Escape hatch while diagnosing the scaled-display input bug: PIKAOS_NATIVE_FRAME=1 launches a
  // stock OS-framed window (no WCO) so input handling can be compared on the same build.
  const nativeFrame = process.env.PIKAOS_NATIVE_FRAME === '1'
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    // Below this the drawer/rail breakpoints stop making sense — clamp instead of rendering broken.
    minWidth: 480,
    minHeight: 360,
    show: false,
    ...(nativeFrame ? {} : {
      titleBarStyle: 'hidden' as const,
      // Window Controls Overlay: the OS draws min/max/close (correct size + hit-testing). color
      // matches the renderer's .titlebar strip; symbolColor is the button glyph; the renderer
      // re-syncs both to the active theme via window:setTitleBarOverlay.
      titleBarOverlay: { color: '#ffffff', symbolColor: '#69707d', height: 36 },
    }),
    // backgroundColor is the default theme surface so the pre-paint frame matches the app, not white.
    backgroundColor: '#f5f7fb',
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
