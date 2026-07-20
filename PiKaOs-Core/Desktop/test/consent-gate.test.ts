import { it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { makeConsent } from '../src/main/consent/gate'
import type { CatalogTool } from '../src/main/ai/toolClient'

const T = (name: string, effect: CatalogTool['effect']): CatalogTool => ({ name, description: '', input_schema: {}, effect })
let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'consent-')) })

it('read and idempotent_write never prompt', async () => {
  const ask = vi.fn()
  const confirm = makeConsent(join(dir, 'a.json'), ask)
  expect(await confirm(T('t1', 'read'))).toBe(true)
  expect(await confirm(T('t2', 'idempotent_write'))).toBe(true)
  expect(ask).not.toHaveBeenCalled()
})

it('side_effect prompts once, persists Allow, and skips the prompt next time — across instances', async () => {
  const p = join(dir, 'a.json')
  const ask = vi.fn().mockResolvedValue(true)
  const confirm = makeConsent(p, ask)
  expect(await confirm(T('danger', 'side_effect'))).toBe(true)
  expect(await confirm(T('danger', 'side_effect'))).toBe(true)
  expect(ask).toHaveBeenCalledTimes(1)
  expect(JSON.parse(readFileSync(p, 'utf8'))).toEqual(['danger'])
  // a fresh instance reads the same file — approval survives restarts
  const ask2 = vi.fn()
  expect(await makeConsent(p, ask2)(T('danger', 'side_effect'))).toBe(true)
  expect(ask2).not.toHaveBeenCalled()
})

it('Decline is NOT persisted — the user is asked again next call', async () => {
  const ask = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true)
  const confirm = makeConsent(join(dir, 'a.json'), ask)
  expect(await confirm(T('x', 'side_effect'))).toBe(false)
  expect(await confirm(T('x', 'side_effect'))).toBe(true)
  expect(ask).toHaveBeenCalledTimes(2)
})
