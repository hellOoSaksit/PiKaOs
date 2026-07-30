import { ipcMain } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync } from 'node:fs'
import { z } from 'zod'
import { guard } from '../ipc'
import { writeHandshake, configSnippet } from './handshake'
import { makeClientGate } from './clients'
import { createGatewayServer } from './server'
import { startPipe } from './pipe'
import type { ToolClient, CatalogTool } from '../ai/toolClient'

export type GatewayStatus = { enabled: boolean; connections: number }

export type GatewayDepsIn = {
  userDataDir: string
  execPath: string
  toolClient: Pick<ToolClient, 'list' | 'call'>
  consent: (tool: CatalogTool) => Promise<boolean>
  pairClient: (clientName: string) => Promise<boolean>
  onStatus: (s: GatewayStatus) => void
  // Electron's clipboard.writeText, injected rather than imported at module scope. MEASURED live in a
  // packaged build: the panel's old `navigator.clipboard.writeText(config)` rejected even though
  // app://pikaos is registered `secure: true` (protocol.ts) — so a missing secure context was not the
  // gap. Chromium's Clipboard API separately requires the document to be focused AND the clipboard-write
  // permission to be granted, and Electron's own permission handler was never configured for either
  // here. clipboard.writeText needs none of that: no focus check, no permission prompt, no secure
  // context. Do NOT "modernise" this back to navigator.clipboard — that is the exact regression this
  // fixes. Injected (not `import { clipboard } from 'electron'` at the top of this file) so
  // gateway-ipc.test.ts can run under vitest, which has no Electron runtime to import.
  writeToClipboard: (text: string) => void
}

// The operator's persisted on/off choice. Its neighbors are the wrong home for this bit:
// gateway.json is the handshake, rewritten with a FRESH token on every enable (a preference must
// not share a file with a rotating secret), and gateway-clients.json is the pairing allowlist.
// Missing or unreadable means OFF — every install keeps fail-closed behavior until the operator's
// first explicit enable.
const stateFile = (dir: string) => join(dir, 'gateway-state.json')
const readEnabledState = (dir: string): boolean => {
  try { return JSON.parse(readFileSync(stateFile(dir), 'utf8')).enabled === true } catch { return false }
}
const writeEnabledState = (dir: string, enabled: boolean) =>
  writeFileSync(stateFile(dir), JSON.stringify({ enabled }))

/**
 * Owns the gateway's on/off state and its per-launch handshake. Disabled is the default and means
 * the pipe does not listen at all — an operator opting in is the first gate, before the token.
 *
 * What survives a relaunch is only that opt-in: the operator's confirmed consent. Every other gate
 * is still re-run from scratch — the token rotates on every enable, each client re-pairs, and the
 * per-tool allowlist still decides each call.
 */
export class GatewayService {
  private pipe: Awaited<ReturnType<typeof startPipe>> | null = null
  private handshakePath = ''
  private connections = 0
  private gate: ReturnType<typeof makeClientGate>
  // Every setEnabled() call is threaded through this chain so the guard-then-assign below runs
  // atomically with respect to concurrent invocations (finding 1 of the E2b Task 7 review). Without
  // it, two overlapping setEnabled(true) calls — a double IPC invoke before the renderer disables its
  // toggle, or a retry — both read `this.pipe` as null and each start their own pipe; whichever
  // resolves last wins the assignment and the OTHER is orphaned: still listening, still holding a
  // valid token, and unreachable by setEnabled(false) forever, since that only closes whatever
  // `this.pipe` currently points at. Same in-flight-promise idea as makeClientGate.allow() in
  // clients.ts, generalized to "one operation in flight at a time" — there is only one gateway, not
  // one slot per client name — so a second caller awaits the first's outcome instead of racing it.
  private queue: Promise<unknown> = Promise.resolve()

  // `gate` is built in the BODY, not as a field initializer: with ES2022 class fields the
  // initializers run before parameter properties are assigned, so `this.deps` would be undefined.
  constructor(private deps: GatewayDepsIn) {
    this.gate = makeClientGate(join(deps.userDataDir, 'gateway-clients.json'), (n) => deps.pairClient(n))
  }

  status(): GatewayStatus { return { enabled: !!this.pipe, connections: this.connections } }

  setEnabled(on: boolean): Promise<GatewayStatus> {
    const run = this.queue.then(() => this.applyEnabled(on))
    // The chain must keep moving even if this call's own apply rejects — a failed enable must not
    // wedge every setEnabled() queued after it. The rejection itself still reaches THIS call's caller
    // via `run`, which is returned below untouched.
    this.queue = run.catch(() => {})
    // setEnabled is reachable only over renderer IPC, i.e. it IS operator intent — and it is the
    // ONLY writer of the persisted preference. Written after apply resolves so a failed enable
    // (startPipe rejecting) never records a choice that didn't take effect. shutdown() below goes
    // around this on purpose.
    return run.then((s) => { writeEnabledState(this.deps.userDataDir, on); return s })
  }

  // Quit-path teardown: closes the pipe like setEnabled(false) but never touches gateway-state.json.
  // App exit is not operator intent — persisting it would turn the preference off on every quit,
  // which is exactly the "silently deleted feature" this split exists to prevent. Kept on the same
  // queue as setEnabled so it can never race a concurrent enable into an orphaned pipe.
  shutdown(): Promise<GatewayStatus> {
    const run = this.queue.then(() => this.applyEnabled(false))
    this.queue = run.catch(() => {})
    return run
  }

  // Boot-time replay of the persisted choice; index.ts calls this once, after IPC registration.
  // Routed through setEnabled so a restored launch gets the same fresh-token handshake as a manual
  // enable. A failure is contained here — the gateway failing to start must never take the app down
  // — and the renderer is pushed the status it would otherwise wait for forever. Whatever that status
  // actually is: push() always sends status(), so a rejecting startPipe reports off (it throws before
  // applyEnabled's own push), while a failure in the state WRITE reports on, because the pipe really
  // did come up and applyEnabled already pushed enabled:true. Don't narrow this to "the off status" —
  // the renderer must be told the truth, not a fixed value.
  restore(): Promise<void> {
    if (!readEnabledState(this.deps.userDataDir)) return Promise.resolve()
    return this.setEnabled(true).then(() => undefined, () => { this.push() })
  }

  private async applyEnabled(on: boolean): Promise<GatewayStatus> {
    if (on && !this.pipe) {
      // A fresh token every time it is switched on, not only at launch: turning it off is a
      // revocation, and a revoked token must never work again.
      const { handshake, path } = writeHandshake(this.deps.userDataDir)
      this.handshakePath = path
      this.pipe = await startPipe({
        handshake,
        makeServer: (requirePaired) => createGatewayServer({
          listTools: () => this.deps.toolClient.list(),
          callTool: (name, args) => this.deps.toolClient.call(name, args),
          consent: this.deps.consent,
          requirePaired,
        }),
        pairClient: (name) => this.gate.allow(name),
        onConnectionsChanged: (n) => { this.connections = n; this.push() },
      })
    } else if (!on && this.pipe) {
      await this.pipe.close()
      this.pipe = null
      this.connections = 0
    }
    this.push()
    return this.status()
  }

  // null while disabled (never enabled yet, or switched back off): a snippet built from an empty
  // handshake path would look valid but could never work (finding 2). Returning null forces every
  // caller to handle "no snippet exists yet" explicitly instead of handing the operator a
  // plausible-looking config that silently can't connect. The renderer (Task 8) only shows the
  // snippet while the gateway is enabled, so this is a signal it already needs to check for.
  config(): string | null {
    return this.pipe ? configSnippet(this.deps.execPath, this.handshakePath) : null
  }
  // Copies the exact same string config() hands the renderer for display — never a second build
  // path — so there is nothing here that could drift from what the operator is looking at, and
  // nothing to leak: config() is paths only (execPath + handshake path), never the token (see the
  // "never leaks the token" test on config()). Returns false instead of writing the literal word
  // "null", an empty string, or a stale snippet when the gateway is disabled — the caller (the
  // renderer's failure banner) must hear "this did not happen", not silently see nothing occur.
  copyConfig(): boolean {
    const snippet = this.config()
    if (!snippet) return false
    this.deps.writeToClipboard(snippet)
    return true
  }
  clients(): string[] { return this.gate.list() }
  // Fix 2: revoking a client that is CURRENTLY connected must end that connection too — otherwise
  // the operator sees the row vanish from the approved-clients table while the live socket keeps
  // right on serving tools, which is a revocation that only half happened.
  revoke(name: string) { this.gate.revoke(name); this.pipe?.disconnect(name) }

  private push() { this.deps.onStatus(this.status()) }
}

const Enabled = z.strictObject({ enabled: z.boolean() })
const ClientName = z.strictObject({ name: z.string().min(1).max(200) })

export function registerGatewayIpc(service: GatewayService) {
  ipcMain.handle('gateway:status', guard(() => service.status()))
  ipcMain.handle('gateway:setEnabled', guard((_e, raw) => service.setEnabled(Enabled.parse(raw).enabled)))
  ipcMain.handle('gateway:config', guard(() => service.config()))
  // No payload — nothing here is renderer-supplied, so there is nothing for a zod schema to check
  // (matches gateway:status/gateway:config/gateway:clients above, none of which take input either).
  ipcMain.handle('gateway:copyConfig', guard(() => service.copyConfig()))
  ipcMain.handle('gateway:clients', guard(() => service.clients()))
  ipcMain.handle('gateway:revoke', guard((_e, raw) => service.revoke(ClientName.parse(raw).name)))
}
