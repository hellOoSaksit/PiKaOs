import { app, BrowserWindow, dialog, Menu, session } from 'electron'
import { join } from 'node:path'
import { registerAppProtocol } from './protocol'
import { removeAppMenu, registerDevtoolsShortcut, registerZoomShortcuts, forwardMaximizeState } from './chrome'
import { createWindow } from './window'
import { registerIpc } from './ipc'
import { SecretVault } from './vault'
import { SessionBroker } from './session-broker'
import { McpRegistry } from './mcp/registry'
import { McpManager } from './mcp/manager'
import type { McpErrorToken } from './mcp/manager'
import { RecoveryService } from './recovery'
import { getBackendConfig } from './config'
import { registerCrashHandlers, registerRendererCrashHandler } from './crash'
import { registerSingleInstanceFocus, registerQuitCleanup } from './lifecycle'
import { registerAiIpc } from './ai/ipc'
import type { McpServerDef } from './mcp/registry'
import type { CatalogTool } from './ai/toolClient'
import { GatewayService, registerGatewayIpc } from './gateway/ipc'
import type { GatewayStatus } from './gateway/ipc'
import { ToolClient } from './ai/toolClient'
import { makeConsent } from './consent/gate'

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) app.quit()

// Prod: Desktop/Frontend/dist is copied into app resources via electron-builder's extraResources
// (electron-builder.yml: `Frontend/dist` -> `frontend`). Dev: the renderer comes from the
// Vite dev server (VITE_DEV_SERVER_URL) instead, but a sane on-disk path is still passed in
// so the app:// handler never resolves to an undefined directory.
const distDir = app.isPackaged
  ? join(process.resourcesPath, 'frontend')
  : join(__dirname, '../../Frontend/dist')

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

// Effect-class tool-call consent (the AI Console's side_effect gate) — a DIFFERENT surface from
// confirmMcpStart's process-spawn consent above. Default-Cancel so a stray Enter never approves a
// state-changing call.
async function confirmToolCall(tool: CatalogTool): Promise<boolean> {
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Cancel', 'Allow'],
    defaultId: 0, cancelId: 0,
    message: `Allow the AI to run "${tool.name}"?`,
    detail: `${tool.description || '(no description)'}\nEffect: ${tool.effect} — this call changes server state.`,
  })
  return response === 1
}

// Pairing an EXTERNAL MCP client. The name is what the client claims about itself, so the copy must
// not imply it was verified — the defence is that this dialog appears at all when the user did not
// ask for it.
async function confirmClientPairing(clientName: string): Promise<boolean> {
  const { response } = await dialog.showMessageBox({
    type: 'warning',
    buttons: ['Cancel', 'Allow'],
    defaultId: 0, cancelId: 0,
    message: `Allow "${clientName}" to use PiKaOs tools?`,
    detail: 'This program says it is "' + clientName + '"; that name is not verified.\n'
      + 'It will be able to call every tool you granted on the AI Access screen, as you.',
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
  const recovery = new RecoveryService({
    userDataDir, registry, manager,
    session: {
      getCacheSize: () => session.defaultSession.getCacheSize(),
      clearCache: () => session.defaultSession.clearCache(),
      clearStorageData: () => session.defaultSession.clearStorageData({ origin: 'app://pikaos' }),
    },
  })

  registerIpc({ vault, broker, registry, manager, recovery })
  registerAiIpc({ vault, broker, askConsent: confirmToolCall })

  const gateway = new GatewayService({
    userDataDir,
    execPath: process.execPath,
    shimPath: join(__dirname, 'pikaos-mcp.js'),   // emitted beside index.js by electron.vite.config.ts
    toolClient: new ToolClient(() => broker.getAccessToken(), () => getBackendConfig().apiBaseUrl),
    // The SAME gate the AI Console uses, deliberately: two copies would let approval semantics drift.
    consent: makeConsent(join(userDataDir, 'ai-approvals.json'), confirmToolCall),
    pairClient: confirmClientPairing,
    onStatus: (s: GatewayStatus) => {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) win.webContents.send('gateway:status', s)
      }
    },
  })
  registerGatewayIpc(gateway)

  manager.on('status', (id: string, status: string, lastError: McpErrorToken | null) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send('mcp:status', id, status, lastError ?? null)
    }
  })

  removeAppMenu(Menu)
  const win = createWindow()

  // Last-resort crash handling (crash spec 2026-07-20): main fatal → dialog → relaunch/quit;
  // renderer crash → reload-once-then-ask with a Recovery escape; internal children → log.
  registerCrashHandlers({ app, dialog })
  registerRendererCrashHandler(win, { app, dialog })

  // Instance lifecycle (crash spec §2.4): focus the running window on a second launch instead
  // of silently killing the new instance; stop every MCP child so none orphans on quit.
  registerSingleInstanceFocus(app, () => BrowserWindow.getAllWindows()[0] ?? null)
  registerQuitCleanup(app, () => { void gateway.setEnabled(false); return manager.stopAll() })

  registerDevtoolsShortcut(win, app.isPackaged)
  registerZoomShortcuts(win)
  forwardMaximizeState(win)
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      registerRendererCrashHandler(createWindow(), { app, dialog })
    }
  })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
