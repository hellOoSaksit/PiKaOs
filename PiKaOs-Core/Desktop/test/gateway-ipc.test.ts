import { it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
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
  // The real electron.clipboard module isn't importable under vitest — a no-op default stands in
  // here; the tests that care about clipboard behaviour override it explicitly.
  writeToClipboard: () => {},
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

it('copyConfig writes the same snippet config() renders, via the injected clipboard, and never the token', async () => {
  const writeToClipboard = vi.fn()
  const s = service({ writeToClipboard })
  await s.setEnabled(true)
  const snippet = s.config()
  expect(s.copyConfig()).toBe(true)
  expect(writeToClipboard).toHaveBeenCalledTimes(1)
  expect(writeToClipboard).toHaveBeenCalledWith(snippet)
  expect(writeToClipboard.mock.calls[0][0]).not.toMatch(/[0-9a-f]{64}/)
  await s.setEnabled(false)
})

it('copyConfig refuses while disabled — no clipboard write, not even the word "null"', async () => {
  const writeToClipboard = vi.fn()
  const s = service({ writeToClipboard })
  expect(s.copyConfig()).toBe(false)             // never enabled yet
  expect(writeToClipboard).not.toHaveBeenCalled()
  await s.setEnabled(true)
  await s.setEnabled(false)
  expect(s.copyConfig()).toBe(false)             // switched back off — stale snippet must not copy
  expect(writeToClipboard).not.toHaveBeenCalled()
})

// --- persisted enabled state (spec 2026-07-30) ----------------------------------------------
// The operator's confirmed consent survives a relaunch; the token still rotates on every enable,
// pairing still gates each client, and the per-tool allowlist still gates each call.
const stateFile = () => join(dir, 'gateway-state.json')

it('setEnabled persists the operator choice to gateway-state.json', async () => {
  const s = service()
  await s.setEnabled(true)
  expect(JSON.parse(readFileSync(stateFile(), 'utf8'))).toEqual({ enabled: true })
  await s.setEnabled(false)
  expect(JSON.parse(readFileSync(stateFile(), 'utf8'))).toEqual({ enabled: false })
})

it('shutdown() closes the pipe but never touches the persisted preference', async () => {
  const s = service()
  await s.setEnabled(true)
  await s.shutdown()
  expect(s.status()).toEqual({ enabled: false, connections: 0 })
  // The quit path is not operator intent — the choice must still read "on" for the next launch.
  expect(JSON.parse(readFileSync(stateFile(), 'utf8'))).toEqual({ enabled: true })
})

it('restore() starts the pipe when the persisted choice says enabled', async () => {
  writeFileSync(stateFile(), JSON.stringify({ enabled: true }))
  const s = service()
  await s.restore()
  expect(s.status().enabled).toBe(true)
  await s.shutdown()
})

it('restore() is a no-op on a missing, corrupt, or disabled state file', async () => {
  const s = service()
  await s.restore()                                        // no file
  expect(s.status().enabled).toBe(false)
  writeFileSync(stateFile(), 'not json')
  await s.restore()                                        // corrupt file
  expect(s.status().enabled).toBe(false)
  writeFileSync(stateFile(), JSON.stringify({ enabled: false }))
  await s.restore()                                        // explicit off
  expect(s.status().enabled).toBe(false)
})

it('restore() contains an enable failure instead of letting it reach the boot path', async () => {
  writeFileSync(stateFile(), JSON.stringify({ enabled: true }))
  const onStatus = vi.fn()
  const s = service({ onStatus })
  vi.spyOn(s, 'setEnabled').mockRejectedValue(new Error('pipe failed'))
  await expect(s.restore()).resolves.toBeUndefined()
  expect(onStatus).toHaveBeenCalled()   // renderer still hears status-off instead of silence
})
