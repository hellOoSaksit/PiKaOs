import { app } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const path = () => join(app.getPath('userData'), 'backend.json')

// Includes /api so callers (e.g. SessionBroker) can do `${apiBaseUrl}/auth/login` directly.
const DEFAULT = { apiBaseUrl: 'http://127.0.0.1:8000/api' }

export function getBackendConfig() {
  return existsSync(path()) ? JSON.parse(readFileSync(path(), 'utf8')) : DEFAULT
}

export function setBackendConfig(cfg: { apiBaseUrl: string }) {
  // https anywhere, or plain http only against loopback — never let the renderer point the
  // desktop client's auth traffic at an arbitrary http origin (spec §5.1).
  if (!/^https:|^http:\/\/(127\.0\.0\.1|localhost)/.test(cfg.apiBaseUrl)) {
    throw new Error('backend URL must be https, or http only for localhost')
  }
  writeFileSync(path(), JSON.stringify(cfg))
}
