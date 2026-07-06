import { app } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const path = () => join(app.getPath('userData'), 'backend.json')

export type ServerEntry = { url: string; lastUsedAt: string | null }
export type BackendConfig = { apiBaseUrl: string; servers: ServerEntry[] }

export const MAX_SERVERS = 20

// Includes /api so callers (e.g. SessionBroker) can do `${apiBaseUrl}/auth/login` directly.
// A missing file means "never configured" — AppBoot shows the Connect-Server screen then.
const DEFAULT: BackendConfig = { apiBaseUrl: 'http://127.0.0.1:8000/api', servers: [] }

// --- URL policy (spec §5.1 + connect-server spec 2026-07-06) --------------------------------
// https anywhere; plain http only where the hop itself is trusted: loopback, RFC1918 private
// LAN, or the 100.64.0.0/10 CGNAT range VPN overlays (Tailscale) hand out — the tunnel already
// encrypts that hop. Parse and range-check the hostname EXACTLY — a prefix/regex check would
// pass lookalikes like http://127.0.0.1.evil.com (config.test.ts pins this).

const HTTP_OK_RANGES: Array<[number, number]> = [
  // [network as uint32, prefix bits]
  [0x7f000000, 8],  // 127.0.0.0/8   loopback
  [0x0a000000, 8],  // 10.0.0.0/8    RFC1918
  [0xac100000, 12], // 172.16.0.0/12 RFC1918
  [0xc0a80000, 16], // 192.168.0.0/16 RFC1918
  [0x64400000, 10], // 100.64.0.0/10 CGNAT / VPN overlay
]

function ipv4ToInt(host: string): number | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (!m) return null
  const p = m.slice(1).map(Number)
  if (p.some((x) => x > 255)) return null
  return ((p[0] << 24) | (p[1] << 16) | (p[2] << 8) | p[3]) >>> 0
}

function isHttpAllowedHost(hostname: string): boolean {
  if (hostname === 'localhost') return true
  const n = ipv4ToInt(hostname)
  if (n === null) return false
  return HTTP_OK_RANGES.some(([net, bits]) => (n >>> (32 - bits)) === (net >>> (32 - bits)))
}

export function isAllowedBackendUrl(apiBaseUrl: string): boolean {
  let u: URL
  try {
    u = new URL(apiBaseUrl)
  } catch {
    return false
  }
  if (u.protocol === 'https:') return true
  return u.protocol === 'http:' && isHttpAllowedHost(u.hostname)
}

export function getBackendConfig(): BackendConfig {
  if (!existsSync(path())) return DEFAULT
  // a corrupt / truncated / hand-edited file must not throw out of a read path (that would brick
  // every boot with no recovery) — treat anything unparseable as "never configured" so AppBoot
  // falls through to the Connect-Server screen.
  let parsed: any
  try {
    parsed = JSON.parse(readFileSync(path(), 'utf8'))
  } catch {
    return DEFAULT
  }
  if (!parsed || typeof parsed !== 'object') return DEFAULT
  // back-compat: a pre-list one-field file becomes its own first row, so an already-configured
  // machine keeps auto-connecting instead of being re-prompted by the Connect-Server screen —
  // but only if that URL still satisfies the policy (the read path must not smuggle a disallowed
  // host past the gate setBackendConfig enforces on write).
  if (!Array.isArray(parsed.servers)) {
    if (typeof parsed.apiBaseUrl !== 'string' || !isAllowedBackendUrl(parsed.apiBaseUrl)) return DEFAULT
    return { apiBaseUrl: parsed.apiBaseUrl, servers: [{ url: parsed.apiBaseUrl, lastUsedAt: null }] }
  }
  return parsed
}

export function setBackendConfig(cfg: { apiBaseUrl: string; servers?: ServerEntry[] }) {
  if (!isAllowedBackendUrl(cfg.apiBaseUrl)) {
    throw new Error('backend URL must be https, or http only for loopback / private-LAN / VPN-overlay hosts')
  }
  const entries = cfg.servers ?? []
  for (const s of entries) {
    if (!s || typeof s.url !== 'string' || !isAllowedBackendUrl(s.url)) {
      throw new Error('saved server entry is not an allowed backend URL')
    }
    if (s.lastUsedAt !== null && typeof s.lastUsedAt !== 'string') {
      throw new Error('saved server lastUsedAt must be an ISO string or null')
    }
  }
  // newest-first, dedupe by url (first occurrence wins), cap — the renderer sends the full
  // list on every save, so this is the single place the list's shape is enforced
  const seen = new Set<string>()
  const servers = [...entries]
    .sort((a, b) => String(b.lastUsedAt ?? '').localeCompare(String(a.lastUsedAt ?? '')))
    .filter((s) => (seen.has(s.url) ? false : (seen.add(s.url), true)))
    .slice(0, MAX_SERVERS)
  writeFileSync(path(), JSON.stringify({ apiBaseUrl: cfg.apiBaseUrl, servers }))
}
