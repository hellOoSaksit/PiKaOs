import { spawn, ChildProcess } from 'node:child_process'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import { EventEmitter } from 'node:events'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import type { Tool } from '@modelcontextprotocol/sdk/types.js'
import { ChildProcessTransport } from './transport'
import { resolveSpawn, NodeMissingError } from './spawn-resolver'
import type { McpRegistry, McpServerDef } from './registry'
import type { SecretVault } from '../vault'

// running = the OS handed us a pid; ready = the server answered initialize + tools/list.
// The FSM must not lie — a pid alone never shows as usable in the UI.
export type McpStatus = 'stopped' | 'starting' | 'running' | 'ready' | 'error'

// The token type is a literal union, not `string` — the generic-errors rule is what keeps a raw
// stderr line or an exception message from ever reaching the renderer, and the type system is
// where that gets enforced.
export type McpErrorToken = 'node-missing' | 'spawn-failed' | 'handshake-timeout' | 'handshake-failed' | 'exited-early'

// Bound each handshake step; unref() so a pending handshake never holds the process (or vitest) open.
const withTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('mcp handshake timeout')), ms)
    if (typeof t.unref === 'function') t.unref()
    p.then(v => { clearTimeout(t); resolve(v) }, e => { clearTimeout(t); reject(e) })
  })

const waitExit = (child: ChildProcess, ms: number) =>
  new Promise<boolean>((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve(true)
    const onExit = () => { clearTimeout(t); resolve(true) }
    const t = setTimeout(() => { child.off('exit', onExit); resolve(false) }, ms)
    if (typeof t.unref === 'function') t.unref()
    child.once('exit', onExit)
  })

export class McpManager extends EventEmitter {
  private procs = new Map<string, ChildProcess>()
  private state = new Map<string, McpStatus>()
  private clients = new Map<string, Client>()
  private toolCache = new Map<string, Tool[]>()
  // Sanitized reason tokens only (never raw stderr/stack) — see McpErrorToken above.
  private lastErrors = new Map<string, McpErrorToken>()
  constructor(private registry: McpRegistry, private vault: SecretVault,
              private confirm: (def: McpServerDef, hash: string) => Promise<boolean>,
              private approvalStorePath: string,
              private handshakeTimeoutMs = 10_000,
              private stopGraceMs = 3_000) { super() }

  private approvals(): string[] { return existsSync(this.approvalStorePath) ? JSON.parse(readFileSync(this.approvalStorePath, 'utf8')) : [] }
  private approve(hash: string) { const a = this.approvals(); if (!a.includes(hash)) { a.push(hash); writeFileSync(this.approvalStorePath, JSON.stringify(a)) } }
  private set(id: string, s: McpStatus) { this.state.set(id, s); this.emit('status', id, s, this.lastErrors.get(id) ?? null) }
  // Sets the error status AND records why, in one call — every failure path goes through this so
  // status and lastError can never drift apart.
  private fail(id: string, token: McpErrorToken) { this.lastErrors.set(id, token); this.set(id, 'error') }

  status(id: string) { return this.state.get(id) ?? 'stopped' }
  statuses(): Record<string, { status: McpStatus; lastError: McpErrorToken | null }> {
    return Object.fromEntries(this.registry.list().map(d =>
      [d.id, { status: this.status(d.id), lastError: this.lastErrors.get(d.id) ?? null }]))
  }
  tools(id: string): Tool[] { return this.toolCache.get(id) ?? [] }

  async start(id: string) {
    const def = this.registry.get(id); if (!def) throw new Error(`unknown mcp ${id}`)
    const hash = this.registry.hash(def)
    // Wiped BEFORE the consent gate: declining consent ends in `stopped`, and set() carries whatever
    // lastError is on record — so a stale token from a previous failure would ride out on a state
    // that is not an error at all.
    this.lastErrors.delete(id)
    if (!this.approvals().includes(hash)) {
      const ok = await this.confirm(def, hash)
      if (!ok) { this.set(id, 'stopped'); throw new Error('consent denied') }
      this.approve(hash)
    }
    this.set(id, 'starting')
    // Rewrites npx to a shell-less `node npx-cli.js` on Windows (BatBadBut) — never touches the
    // stored def, so the consent hash/dialog text above is unaffected by this platform quirk.
    let plan
    try { plan = resolveSpawn(def.command, def.args) }
    catch (e) {
      this.fail(id, e instanceof NodeMissingError ? 'node-missing' : 'spawn-failed')
      return
    }
    // Secrets resolve ONLY under this server's namespace — a def can never name a foreign vault
    // key (e.g. auth.refresh) and receive it. (F1)
    const secrets: Record<string, string> = {}
    for (const name of def.secretKeys ?? []) { const v = this.vault.get(`mcp.${def.id}.${name}`); if (v) secrets[name] = v }
    const env = { PATH: process.env.PATH, ...(def.env ?? {}), ...secrets }
    const child = spawn(plan.command, plan.args, { stdio: ['pipe', 'pipe', 'pipe'], env })
    this.procs.set(id, child)
    child.on('spawn', () => this.set(id, 'running'))
    child.on('error', () => this.fail(id, 'spawn-failed'))
    child.on('exit', () => {
      const wasCurrent = this.procs.get(id) === child
      this.procs.delete(id); this.clients.delete(id); this.toolCache.delete(id)
      if (this.status(id) === 'error') return          // a handshake/spawn reason is richer — keep it
      if (wasCurrent) this.fail(id, 'exited-early')     // died on its own, before OR after ready
      else this.set(id, 'stopped')                      // user-initiated stop()
    })
    // Some fakes/real spawns emit synchronously; if already alive, mark running.
    if (child.pid) this.set(id, 'running')
    // Handshake runs detached: start() answers "process launched", the status event answers
    // "server ready". Errors land in the FSM, never as an unhandled rejection.
    void this.handshake(id, child)
  }

  private async handshake(id: string, child: ChildProcess) {
    const client = new Client({ name: 'pikaos-desktop', version: '0.1.0' })
    try {
      await withTimeout(client.connect(new ChildProcessTransport(child)), this.handshakeTimeoutMs)
      const { tools } = await withTimeout(client.listTools(), this.handshakeTimeoutMs)
      if (this.procs.get(id) !== child) { await client.close().catch(() => {}); return } // stopped meanwhile
      this.clients.set(id, client)
      this.toolCache.set(id, tools)
      this.set(id, 'ready')
    } catch (e) {
      await client.close().catch(() => {})
      // Reap the child on handshake failure — otherwise a spawned-but-unhandshaken process leaks when the
      // user retries Start (a new child overwrites the map entry, orphaning the old one). kill() on an
      // already-dead child is a no-op, and the stopped-meanwhile guard means we never kill someone else's child.
      if (this.procs.get(id) === child) {
        this.fail(id, e instanceof Error && e.message === 'mcp handshake timeout' ? 'handshake-timeout' : 'handshake-failed')
        child.kill()
      }
    }
  }

  async callTool(id: string, name: string, args: Record<string, unknown>) {
    const client = this.clients.get(id)
    if (!client) throw new Error(`mcp ${id} is not ready`)
    return client.callTool({ name, arguments: args })
  }

  async stop(id: string) {
    const child = this.procs.get(id)
    const client = this.clients.get(id)
    this.procs.delete(id); this.clients.delete(id); this.toolCache.delete(id)
    if (client) await client.close().catch(() => {})
    if (child) {
      child.stdin?.end()                          // stdio shutdown per MCP spec: close stdin first…
      const exited = await waitExit(child, this.stopGraceMs)
      if (!exited) child.kill()                   // …kill only if the server doesn't exit on its own
    }
    this.lastErrors.delete(id)   // a deliberate stop is not an error state
    this.set(id, 'stopped')
  }

  // Recovery/lifecycle uses this before clearing the registry file so no orphan child outlives its def.
  async stopAll() { for (const id of [...this.procs.keys()]) await this.stop(id) }
}
