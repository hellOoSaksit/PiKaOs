import { app } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const path = () => join(app.getPath('userData'), 'backend.json')

// Includes /api so callers (e.g. SessionBroker) can do `${apiBaseUrl}/auth/login` directly.
const DEFAULT = { apiBaseUrl: 'http://127.0.0.1:8000/api' }

export function getBackendConfig() {
  return existsSync(path()) ? JSON.parse(readFileSync(path(), 'utf8')) : DEFAULT
}

// https anywhere, or plain http only against loopback — never let the renderer point the
// desktop client's auth traffic at an arbitrary http origin (spec §5.1). Parse and compare the
// hostname EXACTLY: a prefix/regex check would pass lookalikes like http://127.0.0.1.evil.com
// or http://localhost.evil.com, redirecting credentials to an attacker's host.
export function isAllowedBackendUrl(apiBaseUrl: string): boolean {
  let u: URL
  try {
    u = new URL(apiBaseUrl)
  } catch {
    return false
  }
  if (u.protocol === 'https:') return true
  return u.protocol === 'http:' && (u.hostname === '127.0.0.1' || u.hostname === 'localhost')
}

export function setBackendConfig(cfg: { apiBaseUrl: string }) {
  if (!isAllowedBackendUrl(cfg.apiBaseUrl)) {
    throw new Error('backend URL must be https, or http only for 127.0.0.1/localhost')
  }
  writeFileSync(path(), JSON.stringify(cfg))
}
