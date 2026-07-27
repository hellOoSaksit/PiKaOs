import { app, BrowserWindow, dialog, Menu, session, clipboard } from 'electron'
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
import { isShimMode } from './shim-mode'
import { runShim } from '../shim/pikaos-mcp'

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

runMain()

function runMain(): void {
  // Claude Desktop spawns the packaged APP BINARY itself (not plain Node) with SHIM_FLAG, because
  // electron-builder.yml turns the runAsNode fuse OFF (spec §9 hardening): in a packaged build
  // ELECTRON_RUN_AS_NODE is silently ignored, so the old "spawn as plain Node" model booted the
  // full GUI instead of the shim (see configSnippet()'s comment in gateway/handshake.ts for the
  // whole story). This check MUST run before app.requestSingleInstanceLock(): PiKaOs is normally
  // already running when Claude Desktop launches the shim — that IS the point, the shim talks to
  // the running app over its local pipe — so the lock would otherwise treat this launch as a
  // second instance and app.quit() it before the shim ever gets a chance to speak MCP on stdio.
  // No window, no session, and nothing is ever SERVED on the app:// scheme here (protocol.handle is
  // only called from registerAppProtocol(), inside the else branch below) — but protocol.ts's
  // registerSchemesAsPrivileged() call still runs at module load because index.ts imports it
  // unconditionally, so the app: scheme IS registered as a privileged scheme on this path too. That
  // registration alone is inert (no window ever loads app://, no handler is attached), so it changes
  // nothing observable — but it does mean "no app:// protocol" would overstate what actually happens.
  if (isShimMode(process.argv)) {
    // stdout is the JSON-RPC channel to the MCP client (src/shim/pikaos-mcp.ts) — nothing else may
    // write to it. Redirect the SINK, not the callers: capture the real process.stdout.write once,
    // before anything else can rebind it or read it into a local (`const log = console.log`-style
    // capture would otherwise keep the ORIGINAL binding forever), then repoint process.stdout.write
    // at stderr. That covers every JS-level writer in one place — console.log/info/debug plus the
    // methods that don't go through console.log at all (console.dir/table/group*/count*/timeEnd) and
    // any dependency that calls process.stdout.write directly — none of which a per-method
    // console override could reach. The captured original is handed to the shim below as its own
    // frame sink, so the shim's replies still reach the real stdout. This cannot cover native
    // Electron/Chromium output that never goes through Node's process.stdout — see the gateway shim
    // report for exactly what live UAT must still check.
    //
    // Measured fact (live UAT, both dist\win-unpacked\PiKaOs Desktop.exe and dev electron.exe):
    // Electron itself writes a bare "\r\n" to stdout before any JavaScript runs — present in every
    // run, ahead of our own first write, and NOT suppressed by ELECTRON_NO_ATTACH_CONSOLE=1. No
    // redirection here can prevent it: it happens before this file's code exists to run. It is
    // tolerable rather than worth fighting because the MCP SDK already absorbs it — ReadBuffer's
    // readMessage() strips the trailing \r, leaving an empty line, JSON.parse('') throws, and
    // StdioClientTransport.processReadBuffer() (node_modules/@modelcontextprotocol/sdk/dist/esm/
    // client/stdio.js, via shared/stdio.js) catches that, reports it through onerror, and continues
    // the loop with the buffer already advanced past that line. Net effect: the client sees exactly
    // one harmless parse error at startup, then the connection behaves normally.
    const realStdoutWrite = process.stdout.write.bind(process.stdout)
    process.stdout.write = process.stderr.write.bind(process.stderr) as typeof process.stdout.write

    // E2b final-review Fix 1: this is a windowless process, so `registerCrashHandlers` — the only
    // thing that installs an app-level uncaughtException handler — never runs (it lives inside
    // app.whenReady(), in the else branch below). Without a handler here, an uncaught exception falls
    // through to Electron's DEFAULT handler, which calls dialog.showErrorBox — a native modal from a
    // process advertised as having no UI, and one that BLOCKS this process until someone dismisses
    // it. The exact trigger: Claude Desktop closes or kills the shim's stdout pipe while a frame is
    // queued → process.stdout.write (now redirected above, but the same is true of any other write to
    // a dead fd) raises EPIPE → with no listener that becomes an uncaughtException. Write to stderr
    // (the diagnostic channel, never the client's) and exit non-zero — the client going away is a
    // normal event here, not a reason to prompt for relaunch.
    process.on('uncaughtException', (err) => {
      process.stderr.write(`pikaos-mcp: uncaught exception: ${err?.stack ?? err}\n`)
      process.exit(1)
    })
    process.on('unhandledRejection', (reason) => {
      process.stderr.write(`pikaos-mcp: unhandled rejection: ${String(reason)}\n`)
      process.exit(1)
    })
    // Belt-and-braces alongside the handlers above: an 'error' event on the stream itself (e.g. the
    // EPIPE case) is handled right here, before it can even become an uncaughtException, and exits 0
    // — a closed pipe is expected, not a fault.
    process.stdout.on('error', () => process.exit(0))

    return runShim(process.argv, realStdoutWrite)
  }

  const gotLock = app.requestSingleInstanceLock()
  if (!gotLock) app.quit()

  // Prod: Desktop/Frontend/dist is copied into app resources via electron-builder's extraResources
  // (electron-builder.yml: `Frontend/dist` -> `frontend`). Dev: the renderer comes from the
  // Vite dev server (VITE_DEV_SERVER_URL) instead, but a sane on-disk path is still passed in
  // so the app:// handler never resolves to an undefined directory.
  const distDir = app.isPackaged
    ? join(process.resourcesPath, 'frontend')
    : join(__dirname, '../../Frontend/dist')

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
      toolClient: new ToolClient(() => broker.getAccessToken(), () => getBackendConfig().apiBaseUrl),
      // The SAME gate the AI Console uses, deliberately: two copies would let approval semantics drift.
      consent: makeConsent(join(userDataDir, 'ai-approvals.json'), confirmToolCall),
      pairClient: confirmClientPairing,
      writeToClipboard: (text: string) => clipboard.writeText(text),
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
    // Both awaited so the returned promise doesn't settle until the gateway's pipe (an async
    // net.Server.close, unlike MCP children's synchronous kill()) AND every MCP child have actually
    // torn down — the previous `void gateway.setEnabled(false)` dropped the gateway half entirely.
    // registerQuitCleanup still dispatches this via `void` (lifecycle.ts), so the whole thing stays
    // fire-and-forget from Electron's perspective; process exit remains the real backstop for the pipe
    // handle. That's acceptable here — this fix only makes the two teardowns run and finish together
    // when the event loop does get to turn before exit, instead of silently only running one of them.
    // .catch(() => {}) because lifecycle.ts's registerQuitCleanup dispatches this via `void` — a
    // rejection here would otherwise become an unhandled rejection at quit instead of just being a
    // best-effort teardown that didn't fully finish.
    registerQuitCleanup(app, () => Promise.all([gateway.setEnabled(false), manager.stopAll()]).then(() => undefined).catch(() => {}))

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
}
