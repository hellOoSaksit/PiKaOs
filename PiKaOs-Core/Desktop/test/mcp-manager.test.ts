import { it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path'

// pid present ⇒ manager marks it running (the real 'spawn' event doesn't fire on an EventEmitter fake — review F3)
const child = () => Object.assign(new EventEmitter(), { pid: 123, stdin: {}, stdout: new EventEmitter(), stderr: new EventEmitter(), kill: vi.fn() })
let fake: any
vi.mock('node:child_process', () => ({ spawn: vi.fn(() => fake) }))

const mkManager = async (confirm: any, secretKeys = ['FS_TOKEN'], defs?: Array<{ id: string; label: string; command: string; args: string[]; secretKeys: string[] }>) => {
  const { McpManager } = await import('../src/main/mcp/manager')
  const { McpRegistry } = await import('../src/main/mcp/registry')
  const dir = mkdtempSync(join(tmpdir(), 'm-'))
  const reg = new McpRegistry(join(dir, 'mcp.json'))
  if (defs) { for (const def of defs) reg.add(def) }
  else reg.add({ id: 'fs', label: 'FS', command: 'npx', args: ['-y', '@x/fs'], secretKeys })
  const vault = { get: (k: string) => (k === 'mcp.fs.FS_TOKEN' ? 'SECRET' : k === 'auth.refresh' ? 'RT_LEAK' : null), set: vi.fn(), delete: vi.fn(), isAvailable: () => true } as any
  return new McpManager(reg, vault, confirm, join(dir, 'approvals.json'))
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
