import { ipcMain, IpcMainInvokeEvent, BrowserWindow } from 'electron'
import type { SecretVault } from './vault'
import type { SessionBroker } from './session-broker'
import type { McpRegistry } from './mcp/registry'
import type { McpManager } from './mcp/manager'
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

export function registerIpc(deps: { vault: SecretVault; broker: SessionBroker; registry: McpRegistry; manager: McpManager }) {
  const { vault, broker, registry, manager } = deps

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

  // Custom title-bar controls (frame:false). Resolve the sender's own window each call — never a
  // captured reference — so a control always acts on the window that asked. (spec §3.2)
  ipcMain.handle('window:minimize', guard((e) => BrowserWindow.fromWebContents(e.sender)?.minimize()))
  ipcMain.handle('window:toggleMaximize', guard((e) => {
    const w = BrowserWindow.fromWebContents(e.sender)
    if (w) w.isMaximized() ? w.unmaximize() : w.maximize()
  }))
  ipcMain.handle('window:close', guard((e) => BrowserWindow.fromWebContents(e.sender)?.close()))
  ipcMain.handle('window:isMaximized', guard((e) => BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false))
  ipcMain.handle('window:getBounds', guard((e) => BrowserWindow.fromWebContents(e.sender)?.getBounds()))
  // fire-and-forget for smooth JS window drag (avoids invoke round-trip per mousemove)
  ipcMain.on('window:move', (e, x, y) => { if (okOrigin(e)) BrowserWindow.fromWebContents(e.sender)?.setPosition(Math.round(x), Math.round(y)) })
}
