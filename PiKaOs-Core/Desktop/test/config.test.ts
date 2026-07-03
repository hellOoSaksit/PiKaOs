import { it, expect, vi, beforeEach } from 'vitest'
import { mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path'

let userDataDir: string

vi.mock('electron', () => ({
  app: { getPath: (_name: string) => userDataDir },
}))

beforeEach(() => {
  userDataDir = mkdtempSync(join(tmpdir(), 'cfg-'))
  vi.resetModules()
})

it('accepts https URLs', async () => {
  const { setBackendConfig, getBackendConfig } = await import('../src/main/config')
  setBackendConfig({ apiBaseUrl: 'https://x' })
  expect(getBackendConfig()).toEqual({ apiBaseUrl: 'https://x' })
})

it('accepts plain http for 127.0.0.1', async () => {
  const { setBackendConfig, getBackendConfig } = await import('../src/main/config')
  setBackendConfig({ apiBaseUrl: 'http://127.0.0.1:8000/api' })
  expect(getBackendConfig()).toEqual({ apiBaseUrl: 'http://127.0.0.1:8000/api' })
})

it('accepts plain http for localhost', async () => {
  const { setBackendConfig, getBackendConfig } = await import('../src/main/config')
  setBackendConfig({ apiBaseUrl: 'http://localhost:8000/api' })
  expect(getBackendConfig()).toEqual({ apiBaseUrl: 'http://localhost:8000/api' })
})

it('rejects plain http for a non-loopback host (spec §5.1)', async () => {
  const { setBackendConfig } = await import('../src/main/config')
  expect(() => setBackendConfig({ apiBaseUrl: 'http://evil.com' })).toThrow()
})

it('defaults to the loopback /api base when nothing is stored', async () => {
  const { getBackendConfig } = await import('../src/main/config')
  expect(getBackendConfig()).toEqual({ apiBaseUrl: 'http://127.0.0.1:8000/api' })
})
