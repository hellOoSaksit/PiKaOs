import { it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeClientGate } from '../src/main/gateway/clients'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'gwc-')) })

it('asks once for an unknown client, then remembers Allow across instances', async () => {
  const p = join(dir, 'clients.json')
  const ask = vi.fn().mockResolvedValue(true)
  const gate = makeClientGate(p, ask)
  expect(await gate.allow('Claude')).toBe(true)
  expect(await gate.allow('Claude')).toBe(true)
  expect(ask).toHaveBeenCalledTimes(1)
  expect(gate.list()).toEqual(['Claude'])

  const ask2 = vi.fn()
  expect(await makeClientGate(p, ask2).allow('Claude')).toBe(true)
  expect(ask2).not.toHaveBeenCalled()
})

it('a denial is remembered for the rest of the launch and never asks twice', async () => {
  const ask = vi.fn().mockResolvedValue(false)
  const gate = makeClientGate(join(dir, 'c.json'), ask)
  expect(await gate.allow('Sneaky')).toBe(false)
  expect(await gate.allow('Sneaky')).toBe(false)
  expect(await gate.allow('Sneaky')).toBe(false)
  // Reconnecting must not be able to drill the user with dialogs until they click Allow.
  expect(ask).toHaveBeenCalledTimes(1)
})

it('a denial is NOT persisted — a fresh instance asks again', async () => {
  const p = join(dir, 'c.json')
  const ask = vi.fn().mockResolvedValue(false)
  expect(await makeClientGate(p, ask).allow('Sneaky')).toBe(false)
  const ask2 = vi.fn().mockResolvedValue(true)
  expect(await makeClientGate(p, ask2).allow('Sneaky')).toBe(true)
  expect(ask2).toHaveBeenCalledTimes(1)
})

it('two concurrent allow() calls for the same unknown client only ask once', async () => {
  const p = join(dir, 'c.json')
  let resolveAsk!: (v: boolean) => void
  const askPromise = new Promise<boolean>(resolve => { resolveAsk = resolve })
  const ask = vi.fn().mockReturnValue(askPromise)
  const gate = makeClientGate(p, ask)

  // Neither call awaits before the other starts — both must observe the same in-flight ask.
  const call1 = gate.allow('Claude')
  const call2 = gate.allow('Claude')
  resolveAsk(true)
  const [r1, r2] = await Promise.all([call1, call2])

  expect(r1).toBe(true)
  expect(r2).toBe(true)
  expect(ask).toHaveBeenCalledTimes(1)
})

it('revoke removes the client so the next connection asks again', async () => {
  const ask = vi.fn().mockResolvedValue(true)
  const gate = makeClientGate(join(dir, 'c.json'), ask)
  await gate.allow('Claude')
  gate.revoke('Claude')
  expect(gate.list()).toEqual([])
  await gate.allow('Claude')
  expect(ask).toHaveBeenCalledTimes(2)
})
