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
  expect(getBackendConfig()).toEqual({ apiBaseUrl: 'https://x', servers: [] })
})

it('accepts plain http for 127.0.0.1', async () => {
  const { setBackendConfig, getBackendConfig } = await import('../src/main/config')
  setBackendConfig({ apiBaseUrl: 'http://127.0.0.1:8000/api' })
  expect(getBackendConfig()).toEqual({ apiBaseUrl: 'http://127.0.0.1:8000/api', servers: [] })
})

it('accepts plain http for localhost', async () => {
  const { setBackendConfig, getBackendConfig } = await import('../src/main/config')
  setBackendConfig({ apiBaseUrl: 'http://localhost:8000/api' })
  expect(getBackendConfig()).toEqual({ apiBaseUrl: 'http://localhost:8000/api', servers: [] })
})

it('rejects plain http for a non-loopback host (spec §5.1)', async () => {
  const { setBackendConfig } = await import('../src/main/config')
  expect(() => setBackendConfig({ apiBaseUrl: 'http://evil.com' })).toThrow()
})

it('rejects http lookalike hosts that a prefix check would pass', async () => {
  const { setBackendConfig } = await import('../src/main/config')
  // exact-hostname parse, not a prefix/regex match: these must all be rejected
  expect(() => setBackendConfig({ apiBaseUrl: 'http://127.0.0.1.evil.com/api' })).toThrow()
  expect(() => setBackendConfig({ apiBaseUrl: 'http://localhost.evil.com/api' })).toThrow()
  expect(() => setBackendConfig({ apiBaseUrl: 'http://127.0.0.1evil.com/api' })).toThrow()
  expect(() => setBackendConfig({ apiBaseUrl: 'not-a-url' })).toThrow()
})

it('defaults to the loopback /api base when nothing is stored', async () => {
  const { getBackendConfig } = await import('../src/main/config')
  expect(getBackendConfig()).toEqual({ apiBaseUrl: 'http://127.0.0.1:8000/api', servers: [] })
})

// --- connect-server spec (2026-07-06): private LAN + VPN-overlay http, saved-server list ---

it('accepts plain http for private LAN and VPN-overlay IPv4 ranges', async () => {
  const { setBackendConfig } = await import('../src/main/config')
  for (const url of [
    'http://192.168.1.50:8000/api',
    'http://10.1.2.3:8000/api',
    'http://172.20.0.5:8000/api',
    'http://100.100.1.2:8000/api',   // Tailscale-style CGNAT overlay
  ]) expect(() => setBackendConfig({ apiBaseUrl: url })).not.toThrow()
})

it('rejects plain http just OUTSIDE the allowed ranges', async () => {
  const { setBackendConfig } = await import('../src/main/config')
  for (const url of [
    'http://172.32.0.1:8000/api',    // past 172.16.0.0/12
    'http://100.128.0.1:8000/api',   // past 100.64.0.0/10
    'http://8.8.8.8:8000/api',
    'http://192.169.0.1:8000/api',   // past 192.168.0.0/16
    'http://999.168.0.1:8000/api',   // not an IPv4 at all
  ]) expect(() => setBackendConfig({ apiBaseUrl: url })).toThrow()
})

it('back-compat: a pre-list one-field file becomes its own first server row', async () => {
  const { writeFileSync } = await import('node:fs')
  const { join } = await import('node:path')
  writeFileSync(join(userDataDir, 'backend.json'), JSON.stringify({ apiBaseUrl: 'https://old.example/api' }))
  const { getBackendConfig } = await import('../src/main/config')
  expect(getBackendConfig()).toEqual({
    apiBaseUrl: 'https://old.example/api',
    servers: [{ url: 'https://old.example/api', lastUsedAt: null }],
  })
})

it('persists the server list, rejecting any disallowed entry', async () => {
  const { setBackendConfig, getBackendConfig } = await import('../src/main/config')
  const servers = [{ url: 'https://a.example/api', lastUsedAt: '2026-07-06T04:00:00Z' }]
  setBackendConfig({ apiBaseUrl: 'https://a.example/api', servers })
  expect(getBackendConfig()).toEqual({ apiBaseUrl: 'https://a.example/api', servers })
  expect(() => setBackendConfig({
    apiBaseUrl: 'https://a.example/api',
    servers: [{ url: 'http://evil.com/api', lastUsedAt: null }],
  })).toThrow()
})

it('dedupes by url and caps the list at 20, newest lastUsedAt first', async () => {
  const { setBackendConfig, getBackendConfig, MAX_SERVERS } = await import('../src/main/config')
  const many = Array.from({ length: 25 }, (_, i) => ({
    url: `https://s${i}.example/api`,
    lastUsedAt: `2026-07-06T04:00:${String(i).padStart(2, '0')}Z`,
  }))
  many.push({ url: 'https://s24.example/api', lastUsedAt: '2026-07-06T05:00:00Z' })  // duplicate url
  setBackendConfig({ apiBaseUrl: 'https://s24.example/api', servers: many })
  const { servers } = getBackendConfig()
  expect(servers.length).toBe(MAX_SERVERS)
  expect(servers[0].url).toBe('https://s24.example/api')                    // newest first
  expect(new Set(servers.map((s: any) => s.url)).size).toBe(servers.length) // deduped
})
