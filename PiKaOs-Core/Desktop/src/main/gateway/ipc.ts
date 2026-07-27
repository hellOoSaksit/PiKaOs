import { ipcMain, IpcMainInvokeEvent } from 'electron'
import { join } from 'node:path'
import { z } from 'zod'
import { okOrigin } from '../ipc'
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

  // `gate` is built in the BODY, not as a field initializer: with ES2022 class fields the
  // initializers run before parameter properties are assigned, so `this.deps` would be undefined.
  constructor(private deps: GatewayDepsIn) {
    this.gate = makeClientGate(join(deps.userDataDir, 'gateway-clients.json'), (n) => deps.pairClient(n))
  }

  status(): GatewayStatus { return { enabled: !!this.pipe, connections: this.connections } }

  async setEnabled(on: boolean): Promise<GatewayStatus> {
    if (on && !this.pipe) {
      // A fresh token every time it is switched on, not only at launch: turning it off is a
      // revocation, and a revoked token must never work again.
      const { handshake, path } = writeHandshake(this.deps.userDataDir)
      this.handshakePath = path
      this.pipe = await startPipe({
        handshake,
        makeServer: () => createGatewayServer({
          listTools: () => this.deps.toolClient.list(),
          callTool: (name, args) => this.deps.toolClient.call(name, args),
          consent: this.deps.consent,
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

  config(): string { return configSnippet(this.deps.execPath, this.deps.shimPath, this.handshakePath) }
  clients(): string[] { return this.gate.list() }
  revoke(name: string) { this.gate.revoke(name) }

  private push() { this.deps.onStatus(this.status()) }
}

const guard = (fn: (e: IpcMainInvokeEvent, ...a: any[]) => any) =>
  async (e: IpcMainInvokeEvent, ...a: any[]) => { if (!okOrigin(e)) throw new Error('forbidden sender'); return fn(e, ...a) }

const Enabled = z.strictObject({ enabled: z.boolean() })
const ClientName = z.strictObject({ name: z.string().min(1).max(200) })

export function registerGatewayIpc(service: GatewayService) {
  ipcMain.handle('gateway:status', guard(() => service.status()))
  ipcMain.handle('gateway:setEnabled', guard((_e, raw) => service.setEnabled(Enabled.parse(raw).enabled)))
  ipcMain.handle('gateway:config', guard(() => service.config()))
  ipcMain.handle('gateway:clients', guard(() => service.clients()))
  ipcMain.handle('gateway:revoke', guard((_e, raw) => service.revoke(ClientName.parse(raw).name)))
}
