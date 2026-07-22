import { ipcMain, IpcMainInvokeEvent, BrowserWindow, app, screen } from 'electron'
import { z } from 'zod'
import type { SecretVault } from './vault'
import type { SessionBroker } from './session-broker'
import type { McpRegistry } from './mcp/registry'
import type { McpManager } from './mcp/manager'
import { parseServerDef } from './mcp/registry'
import type { RecoveryService } from './recovery'
import { getBackendConfig, setBackendConfig } from './config'

// Parse the sender URL and compare protocol+host exactly — a startsWith('app://pikaos') check
// would also pass app://pikaosevil. (F5)
export const okOrigin = (e: IpcMainInvokeEvent) => {
  try {
    const u = new URL(e.senderFrame?.url ?? '')
    if (u.protocol === 'app:' && u.host === 'pikaos') return true
    const dev = process.env.VITE_DEV_SERVER_URL
    return !!dev && u.origin === new URL(dev).origin
  } catch { return false }
}

const guard = (fn: (e: IpcMainInvokeEvent, ...a: any[]) => any) =>
  (e: IpcMainInvokeEvent, ...a: any[]) => { if (!okOrigin(e)) throw new Error('forbidden sender'); return fn(e, ...a) }

export function registerIpc(deps: { vault: SecretVault; broker: SessionBroker; registry: McpRegistry; manager: McpManager; recovery: RecoveryService }) {
  const { vault, broker, registry, manager, recovery } = deps

  ipcMain.handle('config:get', guard(() => getBackendConfig()))
  ipcMain.handle('config:set', guard((_e, cfg) => setBackendConfig(cfg)))

  ipcMain.handle('auth:login', guard((_e, u, p) => broker.login(u, p)))
  ipcMain.handle('auth:getAccessToken', guard(() => broker.getAccessToken()))
  ipcMain.handle('auth:logout', guard(() => broker.logout()))

  // Renderer input is untrusted even behind okOrigin — every arg is shape-checked before it
  // touches the registry/manager (rule 10). parseServerDef is the spawn()-reaching gate.
  const mcpIdOf = (v: unknown) => z.string().min(1).max(64).parse(v)
  const mcpNameOf = (v: unknown) => z.string().min(1).max(128).parse(v)
  const mcpArgsOf = (v: unknown) => z.record(z.string(), z.unknown()).optional().parse(v) ?? {}   // zod v4: two args

  ipcMain.handle('mcp:list', guard(() => registry.list()))
  ipcMain.handle('mcp:add', guard((_e, def) => registry.add(parseServerDef(def))))
  ipcMain.handle('mcp:remove', guard((_e, id) => registry.remove(mcpIdOf(id))))
  ipcMain.handle('mcp:start', guard((_e, id) => manager.start(mcpIdOf(id))))
  ipcMain.handle('mcp:stop', guard((_e, id) => manager.stop(mcpIdOf(id))))
  ipcMain.handle('mcp:statuses', guard(() => manager.statuses()))
  ipcMain.handle('mcp:tools', guard((_e, id) => manager.tools(mcpIdOf(id))))
  ipcMain.handle('mcp:callTool', guard((_e, id, name, args) => manager.callTool(mcpIdOf(id), mcpNameOf(name), mcpArgsOf(args))))

  // Namespaced under `mcp.<sid>.<key>` — never a bare key — so a server def can never name and
  // receive a foreign vault secret (e.g. auth.refresh). (F1)
  ipcMain.handle('secrets:setForServer', guard((_e, sid, key, value) => vault.set(`mcp.${sid}.${key}`, value)))

  // Recovery (spec 2026-07-13 §6): enum item ids only — RecoveryService rejects anything else,
  // so a renderer can never name a path. Outcome-only logging; never contents, never secrets.
  ipcMain.handle('recovery:diagnose', guard(() => recovery.diagnose()))
  ipcMain.handle('recovery:repair', guard(async (_e, id: string, subId?: string) => {
    const r = await recovery.repair(id, subId)
    console.log('[recovery] repair', id, subId ?? '', r.ok ? 'ok' : 'failed')
    return r
  }))
  ipcMain.handle('recovery:clear', guard(async (_e, id: string) => {
    const r = await recovery.clear(id)
    console.log('[recovery] clear', id, r.ok ? 'ok' : 'failed')
    return r
  }))
  ipcMain.handle('recovery:clearCache', guard(() => recovery.clearHttpCache()))

  // Title-bar controls (Window Controls Overlay draws min/max/close natively — only the verbs the
  // renderer toolbar still needs exist here). Resolve the sender's own window each call — never a
  // captured reference — so a control always acts on the window that asked. (spec §3.2)
  ipcMain.handle('window:toggleMaximize', guard((e) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (w) w.isMaximized() ? w.unmaximize() : w.maximize()
  }))
  ipcMain.handle('window:isMaximized', guard((e) => BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false))
  ipcMain.handle('window:getBounds', guard((e) => BrowserWindow.fromWebContents(e.sender)?.getBounds()))
  // Fire-and-forget for smooth JS window drag (avoids invoke round-trip per mousemove).
  // setBounds with the caller's captured size, NEVER bare setPosition: on a scaled display Electron's
  // DIP<->physical rounding drifts the size a little on every setPosition, and a drag issues one per
  // mousemove — measured live at 150% scaling, 40 calls inflated the window by +34x+32. Re-asserting
  // the same size each move gives the rounding nothing to accumulate on.
  ipcMain.on('window:move', (e, x, y, w, h) => {
    if (!okOrigin(e) || ![x, y, w, h].every(Number.isFinite)) return
    BrowserWindow.fromWebContents(e.sender)?.setBounds({
      x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h),
    })
  })
  /* Windows IGNORES setPosition while a window is maximized, so window:move alone made a maximized
     window undraggable — a stray double-click on the drag handle stranded it with no way back down by
     hand. Native behaviour is to restore and let the window follow the cursor, which needs the restore
     and the reposition to happen together, before the next mousemove: the renderer's captured bounds
     are the MAXIMIZED ones and are worthless the moment we unmaximize. Returns the post-move bounds so
     the caller can re-anchor its drag; null when there was nothing to restore. */
  ipcMain.handle('window:restoreForDrag', guard((e) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!w?.isMaximized()) return null
    const max = w.getBounds()
    const cur = screen.getCursorScreenPoint()
    // Keep the grab point PROPORTIONAL horizontally (the title bar shrinks under the cursor) but
    // absolute vertically, so the window lands exactly where the hand already is.
    const ratio = Math.min(1, Math.max(0, (cur.x - max.x) / max.width))
    const grabY = cur.y - max.y
    w.unmaximize()
    const b = w.getBounds()
    const { workArea } = screen.getDisplayNearestPoint(cur)
    const x = Math.round(cur.x - ratio * b.width)
    // A maximized window's y is negative on Windows (invisible resize border), so the naive result can
    // push the title bar off the top of the screen where it can never be grabbed again.
    const y = Math.max(workArea.y, Math.round(cur.y - grabY))
    // setBounds, not setPosition — same DPI size-drift trap as window:move above.
    w.setBounds({ x, y, width: b.width, height: b.height })
    return { x, y, width: b.width, height: b.height }
  }))
  // Theme sync: the renderer sends its computed --bg-1/--ink-3 tokens (and --bg-1 again as bg) when the
  // theme changes so the OS-drawn overlay buttons AND the window fill match. Hex-only at the edge —
  // anything else is dropped, not sanitized.
  ipcMain.handle('window:setTitleBarOverlay', guard((e, colors: { color?: string; symbolColor?: string; bg?: string }) => {
    const hex = (v: unknown) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : undefined)
    const color = hex(colors?.color); const symbolColor = hex(colors?.symbolColor)
    if (!color || !symbolColor) throw new Error('invalid overlay colors')
    const w = BrowserWindow.fromWebContents(e.sender)
    if (!w) return
    // setTitleBarOverlay only exists where WCO is active (Windows/Linux) — a no-op elsewhere.
    if (typeof w.setTitleBarOverlay === 'function') w.setTitleBarOverlay({ color, symbolColor, height: 36 })
    // Repaint the window fill on the active theme surface so a maximize/resize never flashes the
    // creation-time light colour (the dark-theme blink on maximize).
    const bg = hex(colors?.bg)
    if (bg) w.setBackgroundColor(bg)
  }))

  // App-menu actions (the ☰ File/View/Help menu). Each resolves the sender's own window; quit ends
  // the app. DevTools/fullscreen/zoom act on the sender's webContents only.
  ipcMain.handle('window:quit', guard(() => app.quit()))
  ipcMain.handle('window:toggleFullscreen', guard((e) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (w) w.setFullScreen(!w.isFullScreen())
  }))
  // DevTools stays dev-only, matching chrome.ts's F12 binding — never openable from a packaged build.
  ipcMain.handle('window:toggleDevTools', guard((e) => { if (!app.isPackaged) BrowserWindow.fromWebContents(e.sender)?.webContents.toggleDevTools() }))
  // Page zoom from the menu — mirrors chrome.ts's Ctrl+=/-/0 binding: ±0.5 per step, clamped to ±4.
  ipcMain.handle('window:zoom', guard((e, dir: 'in' | 'out' | 'reset') => {
    const wc = BrowserWindow.fromWebContents(e.sender)?.webContents
    if (!wc) return
    if (dir === 'reset') return wc.setZoomLevel(0)
    const next = wc.getZoomLevel() + (dir === 'in' ? 0.5 : -0.5)
    wc.setZoomLevel(Math.min(4, Math.max(-4, next)))
  }))
}
