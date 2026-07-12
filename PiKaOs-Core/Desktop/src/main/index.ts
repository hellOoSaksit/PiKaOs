import { app, BrowserWindow, dialog, Menu } from 'electron'
import { join } from 'node:path'
import { registerAppProtocol } from './protocol'
import { removeAppMenu, registerDevtoolsShortcut, forwardMaximizeState } from './chrome'
import { createWindow } from './window'
import { registerIpc } from './ipc'
import { SecretVault } from './vault'
import { SessionBroker } from './session-broker'
import { McpRegistry } from './mcp/registry'
import { McpManager } from './mcp/manager'
import { getBackendConfig } from './config'
import type { McpServerDef } from './mcp/registry'

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()

// Prod: Frontend/dist is copied into app resources via electron-builder's extraResources
// (electron-builder.yml: `../Frontend/dist` -> `frontend`). Dev: the renderer comes from the
// Vite dev server (VITE_DEV_SERVER_URL) instead, but a sane on-disk path is still passed in
// so the app:// handler never resolves to an undefined directory.
const distDir = app.isPackaged
  ? join(process.resourcesPath, 'frontend')
  : join(__dirname, '../../../Frontend/dist')

// TODO(i18n): route these through the app's i18n th/en pair (F8) — no main-process i18n
// helper exists in this project yet, so plain English is used for now.
async function confirmMcpStart(def: McpServerDef, hash: string): Promise<boolean> {
  const envKeys = Object.keys(def.env ?? {})
  const secretKeys = def.secretKeys ?? []
  const detailLines = [
    `${def.command} ${def.args.join(' ')}`,
    envKeys.length ? `Env vars: ${envKeys.join(', ')}` : 'Env vars: (none)',
    secretKeys.length ? `Vault secrets injected: ${secretKeys.join(', ')}` : 'Vault secrets injected: (none)',
    `SHA: ${hash.slice(0, 12)}`,
  ]
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Cancel', 'Allow'],
    defaultId: 0,
    cancelId: 0,
    message: `Allow "${def.label}" to run?`,
    detail: detailLines.join('\n'),
  })
  return response === 1
}

app.whenReady().then(() => {
  registerAppProtocol(distDir)

  const userDataDir = app.getPath('userData')
  const vault = new SecretVault(join(userDataDir, 'secrets.json'))
  const broker = new SessionBroker(vault, () => getBackendConfig().apiBaseUrl)
  const registry = new McpRegistry(join(userDataDir, 'mcp.json'))
  const manager = new McpManager(registry, vault, confirmMcpStart, join(userDataDir, 'mcp-approvals.json'))

  registerIpc({ vault, broker, registry, manager })

  manager.on('status', (id: string, status: string) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('mcp:status', id, status)
    }
  })

  removeAppMenu(Menu)
  const win = createWindow()
  registerDevtoolsShortcut(win, app.isPackaged)
  forwardMaximizeState(win)
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
