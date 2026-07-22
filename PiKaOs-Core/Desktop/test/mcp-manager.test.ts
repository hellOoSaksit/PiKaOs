import { it, expect, vi, describe } from 'vitest'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path'

// pid present ⇒ manager marks it running (the real 'spawn' event doesn't fire on an EventEmitter
// fake — review F3). PassThrough pipes swallow the handshake silently: no reply ever comes, so
// status stays 'running' — exactly the "process up, protocol unconfirmed" state. stdin is a real
// writable so transport.send() doesn't reject synchronously (which would flip status to 'error'
// before the assertion).
// exitCode/signalCode null = live process (a real ChildProcess reports null until it exits); the
// PassThrough child never exits, so waitExit(stopGraceMs) times out and stop()/stopAll() reach kill().
const child = () => Object.assign(new EventEmitter(), {
  pid: 123, exitCode: null, signalCode: null,
  stdin: new PassThrough(), stdout: new PassThrough(), stderr: new EventEmitter(), kill: vi.fn(),
})

// A fake child that actually answers the MCP handshake: reads newline-delimited JSON-RPC off its
// own `stdin` PassThrough (what ChildProcessTransport writes to) and replies on `stdout` (what it
// reads from) — same framing as the real-process fixture in mcp-protocol.test.ts, just wired over
// in-memory pipes instead of a spawned interpreter.
const workingChild = () => {
  const c = child()
  c.stdin.on('data', (chunk: Buffer) => {
    for (const line of chunk.toString().split('\n')) {
      if (!line.trim()) continue
      const msg = JSON.parse(line)
      if (msg.id === undefined) continue
      if (msg.method === 'initialize') {
        c.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: {
          protocolVersion: msg.params.protocolVersion, capabilities: { tools: {} },
          serverInfo: { name: 'fake-mcp', version: '1.0.0' },
        } }) + '\n')
      } else if (msg.method === 'tools/list') {
        c.stdout.write(JSON.stringify({ jsonrpc: '2.0', id: msg.id, result: { tools: [] } }) + '\n')
      }
    }
  })
  return c
}

let fake: any
vi.mock('node:child_process', () => ({ spawn: vi.fn(() => fake) }))

// The seam Task 2 wires manager.ts through: production code calls `resolveSpawn(def.command,
// def.args)` — two arguments only, real platform/env. This mock passes that straight to the real
// implementation UNLESS a test sets `resolveOverride`, in which case it forwards resolveSpawn's own
// (platform, env) parameters — letting one test force the win32/no-node branch without touching
// manager.ts's two-arg call site or any other test's (real, passing) platform.
let resolveOverride: { platform: NodeJS.Platform; env: Record<string, string | undefined> } | null = null
vi.mock('../src/main/mcp/spawn-resolver', async () => {
  const actual = await vi.importActual<typeof import('../src/main/mcp/spawn-resolver')>('../src/main/mcp/spawn-resolver')
  return {
    ...actual,
    resolveSpawn: (command: string, args: string[]) =>
      resolveOverride
        ? actual.resolveSpawn(command, args, resolveOverride.platform, resolveOverride.env)
        : actual.resolveSpawn(command, args),
  }
})

// Handshake/consent timeouts run on the manager's short ctor timeouts (50ms) in this file, so a
// couple hundred ms of headroom is plenty — this just avoids a fixed sleep racing the FSM.
const untilStatus = (mgr: any, id: string, want: string, ms = 2000) =>
  new Promise<void>((resolve, reject) => {
    if (mgr.status(id) === want) return resolve()
    const t = setTimeout(() => reject(new Error(`never reached ${want}, at ${mgr.status(id)}`)), ms)
    mgr.on('status', (sid: string, s: string) => { if (sid === id && s === want) { clearTimeout(t); resolve() } })
  })

const mkManager = async (confirm: any, secretKeys = ['FS_TOKEN'], defs?: Array<{ id: string; label: string; command: string; args: string[]; secretKeys: string[] }>) => {
  const { McpManager } = await import('../src/main/mcp/manager')
  const { McpRegistry } = await import('../src/main/mcp/registry')
  const dir = mkdtempSync(join(tmpdir(), 'm-'))
  const reg = new McpRegistry(join(dir, 'mcp.json'))
  if (defs) { for (const def of defs) reg.add(def) }
  else reg.add({ id: 'fs', label: 'FS', command: 'npx', args: ['-y', '@x/fs'], secretKeys })
  const vault = { get: (k: string) => (k === 'mcp.fs.FS_TOKEN' ? 'SECRET' : k === 'auth.refresh' ? 'RT_LEAK' : null), set: vi.fn(), delete: vi.fn(), isAvailable: () => true } as any
  return new McpManager(reg, vault, confirm, join(dir, 'approvals.json'), 50, 50)
}

it('prompts consent on first start, injects secret as env, reports running', async () => {
  fake = child()
  const { spawn } = await import('node:child_process')
  const confirm = vi.fn().mockResolvedValue(true)
  const mgr = await mkManager(confirm)
  await mgr.start('fs')
  expect(confirm).toHaveBeenCalledOnce()
  const passedEnv = (spawn as any).mock.calls[0][2].env
  expect(passedEnv.FS_TOKEN).toBe('SECRET')          // secret injected at spawn only, resolved from mcp.fs.*
  expect(mgr.status('fs')).toBe('running')
})

it('cannot exfiltrate vault keys outside its namespace (F1 guard)', async () => {
  fake = child()
  const { spawn } = await import('node:child_process'); (spawn as any).mockClear()
  // hostile def names a broker key — it resolves under mcp.fs.*, not the raw key, so nothing is injected
  const mgr = await mkManager(vi.fn().mockResolvedValue(true), ['auth.refresh'])
  await mgr.start('fs')
  const env = (spawn as any).mock.calls[0][2].env
  expect(env['auth.refresh']).toBeUndefined()
})

it('refuses to spawn when consent is denied', async () => {
  fake = child()
  const { spawn } = await import('node:child_process'); (spawn as any).mockClear()
  const mgr = await mkManager(vi.fn().mockResolvedValue(false))
  await expect(mgr.start('fs')).rejects.toThrow()
  expect(spawn).not.toHaveBeenCalled()
  expect(mgr.status('fs')).toBe('stopped')
})

it('stopAll stops every running server and marks them stopped', async () => {
  const { spawn } = await import('node:child_process'); (spawn as any).mockClear()
  // each server gets its OWN fake child, so we can prove stopAll actually kills every
  // process (not just flips status) — a shared fake would hide an orphan-child regression
  const childA = child()
  const childB = child()
  ;(spawn as any).mockImplementationOnce(() => childA).mockImplementationOnce(() => childB)
  const mgr = await mkManager(vi.fn().mockResolvedValue(true), [], [
    { id: 'a', label: 'A', command: 'npx', args: ['-y', '@x/a'], secretKeys: [] },
    { id: 'b', label: 'B', command: 'npx', args: ['-y', '@x/b'], secretKeys: [] },
  ])
  await mgr.start('a')
  await mgr.start('b')
  await mgr.stopAll()
  expect(mgr.status('a')).toBe('stopped')
  expect(mgr.status('b')).toBe('stopped')
  expect(childA.kill).toHaveBeenCalled()
  expect(childB.kill).toHaveBeenCalled()
})

describe('lastError', () => {
  it('statuses() returns {status,lastError:null} per server when healthy', async () => {
    const mgr = await mkManager(vi.fn().mockResolvedValue(true))
    expect(mgr.statuses()).toEqual({ fs: { status: 'stopped', lastError: null } })
  })

  it('handshake timeout -> status error with lastError handshake-timeout, pushed on the status event', async () => {
    fake = child()   // PassThrough pipes: spawns fine, never answers the handshake
    const mgr = await mkManager(vi.fn().mockResolvedValue(true))
    const events: unknown[][] = []
    mgr.on('status', (...args: unknown[]) => events.push(args))
    await mgr.start('fs')
    await untilStatus(mgr, 'fs', 'error')
    expect(events.at(-1)).toEqual(['fs', 'error', 'handshake-timeout'])
    expect(mgr.statuses().fs).toEqual({ status: 'error', lastError: 'handshake-timeout' })
  })

  it('a successful restart clears lastError', async () => {
    fake = child()
    const mgr = await mkManager(vi.fn().mockResolvedValue(true))
    await mgr.start('fs')
    await untilStatus(mgr, 'fs', 'error')
    expect(mgr.statuses().fs.lastError).toBe('handshake-timeout')

    fake = workingChild()   // this time the "server" actually answers initialize + tools/list
    await mgr.start('fs')
    await untilStatus(mgr, 'fs', 'ready')
    expect(mgr.statuses().fs).toEqual({ status: 'ready', lastError: null })
  })

  it('unexpected child exit before ready -> error + exited-early (user stop still reports stopped)', async () => {
    fake = child()
    const mgr = await mkManager(vi.fn().mockResolvedValue(true))
    await mgr.start('fs')
    fake.emit('exit')   // dies on its own, before the handshake ever completes
    expect(mgr.status('fs')).toBe('error')
    expect(mgr.statuses().fs).toEqual({ status: 'error', lastError: 'exited-early' })

    // separately: a deliberate stop() must never be mistaken for a crash
    fake = child()
    const mgr2 = await mkManager(vi.fn().mockResolvedValue(true))
    await mgr2.start('fs')
    await mgr2.stop('fs')
    expect(mgr2.statuses().fs).toEqual({ status: 'stopped', lastError: null })
  })

  it('npx on win32 without node on PATH -> error + node-missing, nothing spawned', async () => {
    resolveOverride = { platform: 'win32', env: { PATH: 'C:\\nowhere' } }
    try {
      fake = child()
      const { spawn } = await import('node:child_process'); (spawn as any).mockClear()
      const mgr = await mkManager(vi.fn().mockResolvedValue(true))   // def.command === 'npx' (mkManager default)
      await mgr.start('fs')
      expect(spawn).not.toHaveBeenCalled()
      expect(mgr.statuses().fs).toEqual({ status: 'error', lastError: 'node-missing' })
    } finally { resolveOverride = null }
  })
})
