import { spawn, ChildProcess } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import type { McpRegistry, McpServerDef } from './registry'
import type { SecretVault } from '../vault'
export type McpStatus = 'stopped' | 'starting' | 'running' | 'error'

export class McpManager extends EventEmitter {
  private procs = new Map<string, ChildProcess>()
  private state = new Map<string, McpStatus>()
  constructor(private registry: McpRegistry, private vault: SecretVault,
              private confirm: (def: McpServerDef, hash: string) => Promise<boolean>,
              private approvalStorePath: string) { super() }

  private approvals(): string[] { return existsSync(this.approvalStorePath) ? JSON.parse(readFileSync(this.approvalStorePath, 'utf8')) : [] }
  private approve(hash: string) { const a = this.approvals(); if (!a.includes(hash)) { a.push(hash); writeFileSync(this.approvalStorePath, JSON.stringify(a)) } }
  private set(id: string, s: McpStatus) { this.state.set(id, s); this.emit('status', id, s) }

  status(id: string) { return this.state.get(id) ?? 'stopped' }
  statuses() { return Object.fromEntries(this.registry.list().map(d => [d.id, this.status(d.id)])) }

  async start(id: string) {
    const def = this.registry.get(id); if (!def) throw new Error(`unknown mcp ${id}`)
    const hash = this.registry.hash(def)
    if (!this.approvals().includes(hash)) {
      const ok = await this.confirm(def, hash)
      if (!ok) { this.set(id, 'stopped'); throw new Error('consent denied') }
      this.approve(hash)
    }
    this.set(id, 'starting')
    // Secrets resolve ONLY under this server's namespace — a def can never name a foreign vault
    // key (e.g. auth.refresh) and receive it. (F1)
    const secrets: Record<string, string> = {}
    for (const name of def.secretKeys ?? []) { const v = this.vault.get(`mcp.${def.id}.${name}`); if (v) secrets[name] = v }
    const env = { PATH: process.env.PATH, ...(def.env ?? {}), ...secrets }
    const child = spawn(def.command, def.args, { stdio: ['pipe', 'pipe', 'pipe'], env })
    this.procs.set(id, child)
    child.on('spawn', () => this.set(id, 'running'))
    child.on('error', () => this.set(id, 'error'))
    child.on('exit', () => { this.procs.delete(id); this.set(id, 'stopped') })
    // Some fakes/real spawns emit synchronously; if already alive, mark running.
    if (child.pid) this.set(id, 'running')
  }
  async stop(id: string) { this.procs.get(id)?.kill(); this.procs.delete(id); this.set(id, 'stopped') }
  // Recovery uses this before clearing the registry file so no orphan child outlives its definition.
  async stopAll() { for (const id of [...this.procs.keys()]) await this.stop(id) }
}
