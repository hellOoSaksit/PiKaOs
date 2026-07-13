import { it, expect, beforeEach, vi } from 'vitest'
import { mkdtempSync, writeFileSync, existsSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { McpRegistry } from '../src/main/mcp/registry'
import { McpManager } from '../src/main/mcp/manager'
import { RecoveryService } from '../src/main/recovery'

let dir: string
let svc: RecoveryService
let registry: McpRegistry
let manager: McpManager

const fakeSession = { getCacheSize: async () => 4096, clearCache: async () => {}, clearStorageData: async () => {} }

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'rec-'))
  registry = new McpRegistry(join(dir, 'mcp.json'))
  manager = new McpManager(registry, null as any, async () => true, join(dir, 'mcp-approvals.json'))
  svc = new RecoveryService({ userDataDir: dir, registry, manager, session: fakeSession })
})

const byId = (items: any[], id: string) => items.find((i) => i.id === id)

it('diagnose: missing files report missing, cache reports bytes', async () => {
  const items = await svc.diagnose()
  expect(items).toHaveLength(5)
  for (const id of ['mcp-registry', 'mcp-approvals', 'secrets', 'backend-config'])
    expect(byId(items, id)).toMatchObject({ status: 'missing', count: 0, bytes: 0 })
  expect(byId(items, 'http-cache')).toMatchObject({ status: 'ok', bytes: 4096 })
})

it('diagnose: healthy files report ok with counts', async () => {
  registry.add({ id: 's1', label: 'S1', command: 'node', args: [] })
  writeFileSync(join(dir, 'mcp-approvals.json'), JSON.stringify(['h1', 'h2']))
  writeFileSync(join(dir, 'secrets.json'), JSON.stringify({ 'mcp.s1.KEY': 'b64' }))
  writeFileSync(join(dir, 'backend.json'), JSON.stringify({ apiBaseUrl: 'https://x/api', servers: [{ url: 'https://x/api', lastUsedAt: null }] }))
  const items = await svc.diagnose()
  expect(byId(items, 'mcp-registry')).toMatchObject({ status: 'ok', count: 1 })
  expect(byId(items, 'mcp-approvals')).toMatchObject({ status: 'ok', count: 2 })
  expect(byId(items, 'secrets')).toMatchObject({ status: 'ok', count: 1 })
  expect(byId(items, 'backend-config')).toMatchObject({ status: 'ok', count: 1 })
})

it('diagnose: corrupt JSON reports corrupt and never throws', async () => {
  writeFileSync(join(dir, 'mcp.json'), '{nope')
  writeFileSync(join(dir, 'secrets.json'), 'also-not-json')
  const items = await svc.diagnose()
  expect(byId(items, 'mcp-registry').status).toBe('corrupt')
  expect(byId(items, 'secrets').status).toBe('corrupt')
})

it('diagnose: registry with an invalid def reports warn', async () => {
  writeFileSync(join(dir, 'mcp.json'), JSON.stringify([
    { id: 'good', label: 'G', command: 'node', args: [] },
    { id: 'bad-no-command', label: 'B', args: [] },
  ]))
  const item = byId(await svc.diagnose(), 'mcp-registry')
  expect(item.status).toBe('warn')
  expect(item.count).toBe(1) // only valid defs counted
})

it('diagnose: legacy backend.json (apiBaseUrl, no servers) reports ok, count 1 — config.ts back-compat parity', async () => {
  writeFileSync(join(dir, 'backend.json'), JSON.stringify({ apiBaseUrl: 'https://x/api' }))
  const item = byId(await svc.diagnose(), 'backend-config')
  expect(item).toMatchObject({ status: 'ok', count: 1 })
})

it('diagnose: legacy backend.json with a disallowed URL (no servers) reports corrupt', async () => {
  writeFileSync(join(dir, 'backend.json'), JSON.stringify({ apiBaseUrl: 'not-a-url' }))
  const item = byId(await svc.diagnose(), 'backend-config')
  expect(item).toMatchObject({ status: 'corrupt', count: 0 })
})

it('diagnose: secret values never appear anywhere in the result', async () => {
  writeFileSync(join(dir, 'secrets.json'), JSON.stringify({ 'mcp.s1.TOKEN': 'SUPERSECRETB64' }))
  const json = JSON.stringify(await svc.diagnose())
  expect(json).not.toContain('SUPERSECRET')
  expect(json).not.toContain('TOKEN')
})

it('clear mcp-registry stops all processes first, then writes an empty list', async () => {
  registry.add({ id: 's1', label: 'S1', command: 'node', args: [] })
  const spy = vi.spyOn(manager, 'stopAll')
  const r = await svc.clear('mcp-registry')
  expect(r.ok).toBe(true)
  expect(spy).toHaveBeenCalled()
  expect(registry.list()).toEqual([])
})

it('clear secrets / backend-config removes the files', async () => {
  writeFileSync(join(dir, 'secrets.json'), '{}')
  writeFileSync(join(dir, 'backend.json'), '{}')
  expect((await svc.clear('secrets')).ok).toBe(true)
  expect((await svc.clear('backend-config')).ok).toBe(true)
  expect(existsSync(join(dir, 'secrets.json'))).toBe(false)
  expect(existsSync(join(dir, 'backend.json'))).toBe(false)
})

it('clear is idempotent — clearing a missing file succeeds', async () => {
  expect((await svc.clear('secrets')).ok).toBe(true)
  expect((await svc.clear('mcp-approvals')).ok).toBe(true)
})

it('clear rejects unknown and renderer-owned ids', async () => {
  expect((await svc.clear('../../etc/passwd')).ok).toBe(false)
  expect((await svc.clear('ui-state')).ok).toBe(false)   // renderer-owned, main must refuse
  expect((await svc.clear('boot-cache')).ok).toBe(false)
})

it('clear rejects inherited Object.prototype keys (in-operator prototype-chain gap)', async () => {
  for (const id of ['constructor', 'toString', 'hasOwnProperty']) {
    const r = await svc.clear(id)
    expect(r.ok).toBe(false)
  }
  // proves no filesystem side effect slipped through (e.g. a delete under name 'Object')
  expect(existsSync(join(dir, 'Object'))).toBe(false)
})

it('factory-reset clears every file item and both session stores', async () => {
  registry.add({ id: 's1', label: 'S1', command: 'node', args: [] })
  writeFileSync(join(dir, 'secrets.json'), '{}')
  const cache = vi.spyOn(fakeSession, 'clearCache')
  const storage = vi.spyOn(fakeSession, 'clearStorageData')
  expect((await svc.clear('factory-reset')).ok).toBe(true)
  expect(registry.list()).toEqual([])
  expect(existsSync(join(dir, 'secrets.json'))).toBe(false)
  expect(cache).toHaveBeenCalled()
  expect(storage).toHaveBeenCalled()
})

it('repair(mcp-registry, subId) stops the server and drops only its approval hash — def stays', async () => {
  const def = { id: 's1', label: 'S1', command: 'node', args: [] as string[] }
  const other = { id: 's2', label: 'S2', command: 'node', args: ['x'] }
  registry.add(def); registry.add(other)
  writeFileSync(join(dir, 'mcp-approvals.json'), JSON.stringify([registry.hash(def), registry.hash(other)]))
  const stop = vi.spyOn(manager, 'stop')
  const r = await svc.repair('mcp-registry', 's1')
  expect(r.ok).toBe(true)
  expect(stop).toHaveBeenCalledWith('s1')
  expect(registry.get('s1')).toBeTruthy()   // repair keeps the module installed
  const approvals = JSON.parse(readFileSync(join(dir, 'mcp-approvals.json'), 'utf8'))
  expect(approvals).toEqual([registry.hash(other)])   // other server's consent untouched
})

it('repair(mcp-registry, unknown-subId) fails without touching files', async () => {
  expect((await svc.repair('mcp-registry', 'ghost')).ok).toBe(false)
})

it('repair on a corrupt file rewrites a valid empty default', async () => {
  writeFileSync(join(dir, 'mcp.json'), '{nope')
  expect((await svc.repair('mcp-registry')).ok).toBe(true)
  expect(registry.list()).toEqual([])
})

it('repair on a healthy or missing file is a no-op success', async () => {
  registry.add({ id: 's1', label: 'S1', command: 'node', args: [] })
  expect((await svc.repair('mcp-registry')).ok).toBe(true)
  expect(registry.list()).toHaveLength(1)   // healthy content untouched
  expect((await svc.repair('secrets')).ok).toBe(true)   // missing file: nothing to do
})

it('repair rejects unknown ids and factory-reset', async () => {
  expect((await svc.repair('nope')).ok).toBe(false)
  expect((await svc.repair('factory-reset')).ok).toBe(false)
})

it('repair rejects inherited Object.prototype keys (in-operator prototype-chain gap)', async () => {
  expect((await svc.repair('constructor')).ok).toBe(false)
})
