import { it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { GatewayService } from '../src/main/gateway/ipc'
import { SHIM_FLAG } from '../src/main/shim-mode'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'gwi-')) })

const service = (over: any = {}) => new GatewayService({
  userDataDir: dir,
  execPath: '/app/PiKaOs',
  toolClient: { list: async () => [], call: async () => ({ status: 200, result: null }) } as any,
  consent: async () => true,
  pairClient: async () => true,
  onStatus: () => {},
  ...over,
})

it('starts disabled and listens on nothing until it is switched on', async () => {
  const s = service()
  expect(s.status()).toEqual({ enabled: false, connections: 0 })
  expect(await s.setEnabled(true)).toEqual({ enabled: true, connections: 0 })
  expect(await s.setEnabled(false)).toEqual({ enabled: false, connections: 0 })
})

it('pushes status whenever enablement changes', async () => {
  const onStatus = vi.fn()
  const s = service({ onStatus })
  await s.setEnabled(true)
  await s.setEnabled(false)
  expect(onStatus).toHaveBeenCalledWith({ enabled: true, connections: 0 })
  expect(onStatus).toHaveBeenCalledWith({ enabled: false, connections: 0 })
})

it('config() names the shim flag and the handshake path and never leaks the token', async () => {
  const s = service()
  await s.setEnabled(true)
  const snippet = JSON.parse(s.config())
  expect(snippet.mcpServers.pikaos.args[0]).toBe(SHIM_FLAG)
  expect(snippet.mcpServers.pikaos.args[2]).toMatch(/gateway\.json$/)
  expect(s.config()).not.toMatch(/[0-9a-f]{64}/)
  await s.setEnabled(false)
})

it('config() is null while disabled — never a snippet built from an empty handshake path', async () => {
  const s = service()
  expect(s.config()).toBeNull()             // never enabled yet
  await s.setEnabled(true)
  expect(s.config()).not.toBeNull()
  await s.setEnabled(false)
  expect(s.config()).toBeNull()              // switched back off — the old snippet must not linger
})

it('revoke drops a paired client', async () => {
  const s = service()
  await s.setEnabled(true)
  expect(s.clients()).toEqual([])
  s.revoke('nobody')            // revoking an unknown client is a no-op, not a throw
  await s.setEnabled(false)
})
