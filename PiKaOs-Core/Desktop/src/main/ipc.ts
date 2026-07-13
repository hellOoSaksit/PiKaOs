import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron'
import type { SecretVault } from './vault'
import type { SessionBroker } from './session-broker'
import type { McpRegistry } from './mcp/registry'
import type { McpManager } from './mcp/manager'
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

  ipcMain.handle('mcp:list', guard(() => registry.list()))
  ipcMain.handle('mcp:add', guard((_e, def) => registry.add(def))) // schema-validate def in impl
  ipcMain.handle('mcp:remove', guard((_e, id) => registry.remove(id)))
  ipcMain.handle('mcp:start', guard((_e, id) => manager.start(id)))
  ipcMain.handle('mcp:stop', guard((_e, id) => manager.stop(id)))
  ipcMain.handle('mcp:statuses', guard(() => manager.statuses()))

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
  // fire-and-forget for smooth JS window drag (avoids invoke round-trip per mousemove)
  ipcMain.on('window:move', (e, x, y) => { if (okOrigin(e)) BrowserWindow.fromWebContents(e.sender)?.setPosition(Math.round(x), Math.round(y)) })
  // Theme sync: the renderer sends its computed --bg-2/--ink-3 tokens when the theme changes so the
  // OS-drawn overlay buttons match. Hex-only at the edge — anything else is dropped, not sanitized.
  ipcMain.handle('window:setTitleBarOverlay', guard((e, colors: { color?: string; symbolColor?: string }) => {
    const hex = (v: unknown) => (typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v) ? v : undefined)
    const color = hex(colors?.color); const symbolColor = hex(colors?.symbolColor)
    if (!color || !symbolColor) throw new Error('invalid overlay colors')
    const w = BrowserWindow.fromWebContents(e.sender)
    // setTitleBarOverlay only exists where WCO is active (Windows/Linux) — a no-op elsewhere.
    if (w && typeof w.setTitleBarOverlay === 'function') w.setTitleBarOverlay({ color, symbolColor, height: 36 })
  }))
}
