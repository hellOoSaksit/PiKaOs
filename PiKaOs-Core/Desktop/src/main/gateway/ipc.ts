import { ipcMain } from 'electron'
import { join } from 'node:path'
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
  shimPath: string
  toolClient: Pick<ToolClient, 'list' | 'call'>
  consent: (tool: CatalogTool) => Promise<boolean>
  pairClient: (clientName: string) => Promise<boolean>
  onStatus: (s: GatewayStatus) => void
}

/**
 * Owns the gateway's on/off state and its per-launch handshake. Disabled is the default and means
 * the pipe does not listen at all — an operator opting in is the first gate, before the token.
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
    return run
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
    return this.pipe ? configSnippet(this.deps.execPath, this.deps.shimPath, this.handshakePath) : null
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
  ipcMain.handle('gateway:clients', guard(() => service.clients()))
  ipcMain.handle('gateway:revoke', guard((_e, raw) => service.revoke(ClientName.parse(raw).name)))
}
