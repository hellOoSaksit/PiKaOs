import { join } from 'node:path'
import { readFileSync, writeFileSync, rmSync, existsSync, statSync } from 'node:fs'
import type { McpRegistry, McpServerDef } from './mcp/registry'
import type { McpManager } from './mcp/manager'
import { isAllowedBackendUrl } from './config'

// Recovery spec 2026-07-13: main owns every file touch; the renderer only ever names one of
// these enum ids — never a path. `boot-cache`/`ui-state` are renderer-owned web storage and
// deliberately absent here (the renderer clears them itself and merges them into the list).
export type RecoveryItemId = 'mcp-registry' | 'mcp-approvals' | 'secrets' | 'backend-config' | 'factory-reset'
export type DiagnoseStatus = 'ok' | 'warn' | 'corrupt' | 'missing'
export type DiagnoseItem = { id: string; status: DiagnoseStatus; count: number; bytes: number }
export type ActionResult = { ok: boolean; error?: string }
export type SessionOps = { getCacheSize(): Promise<number>; clearCache(): Promise<void>; clearStorageData(): Promise<void> }

type FileItemId = Exclude<RecoveryItemId, 'factory-reset'>

// `empty` = what repair rewrites over a corrupt file; null = remove (code-side defaults take over,
// e.g. config.ts getBackendConfig treats a missing backend.json as "never configured").
const FILES: Record<FileItemId, { name: string; empty: string | null }> = {
  'mcp-registry': { name: 'mcp.json', empty: '[]' },
  'mcp-approvals': { name: 'mcp-approvals.json', empty: '[]' },
  secrets: { name: 'secrets.json', empty: null },
  'backend-config': { name: 'backend.json', empty: null },
}

const validDef = (d: any): d is McpServerDef =>
  !!d && typeof d.id === 'string' && typeof d.command === 'string' && Array.isArray(d.args)

export class RecoveryService {
  constructor(private deps: { userDataDir: string; registry: McpRegistry; manager: McpManager; session: SessionOps }) {}

  private path(id: FileItemId) { return join(this.deps.userDataDir, FILES[id].name) }
  private bytes(id: FileItemId) { try { return statSync(this.path(id)).size } catch { return 0 } }

  // Read-only, never throws: a per-item failure becomes that item's `corrupt` row. Counts only —
  // no key names, no values, nothing sensitive crosses the IPC bridge (spec §4).
  async diagnose(): Promise<DiagnoseItem[]> {
    const items: DiagnoseItem[] = (Object.keys(FILES) as FileItemId[]).map((id) => {
      if (!existsSync(this.path(id))) return { id, status: 'missing', count: 0, bytes: 0 }
      const bytes = this.bytes(id)
      let parsed: any
      try { parsed = JSON.parse(readFileSync(this.path(id), 'utf8')) } catch { return { id, status: 'corrupt', count: 0, bytes } }
      if (id === 'mcp-registry') {
        if (!Array.isArray(parsed)) return { id, status: 'corrupt', count: 0, bytes }
        const valid = parsed.filter(validDef).length
        return { id, status: valid === parsed.length ? 'ok' : 'warn', count: valid, bytes }
      }
      if (id === 'mcp-approvals')
        return Array.isArray(parsed) ? { id, status: 'ok', count: parsed.length, bytes } : { id, status: 'corrupt', count: 0, bytes }
      if (id === 'secrets')
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
          ? { id, status: 'ok', count: Object.keys(parsed).length, bytes }
          : { id, status: 'corrupt', count: 0, bytes }
      // backend-config: mirror config.ts getBackendConfig's validity notion exactly, incl. its
      // legacy back-compat branch (a pre-list one-field file with a policy-allowed apiBaseUrl,
      // which getBackendConfig silently upgrades to a one-entry server list) — else a healthy
      // legacy config false-alarms here as corrupt and could prompt a destructive repair.
      if (!parsed || typeof parsed !== 'object') return { id, status: 'corrupt', count: 0, bytes }
      if (Array.isArray(parsed.servers)) return { id, status: 'ok', count: parsed.servers.length, bytes }
      if (typeof parsed.apiBaseUrl === 'string' && isAllowedBackendUrl(parsed.apiBaseUrl))
        return { id, status: 'ok', count: 1, bytes }
      return { id, status: 'corrupt', count: 0, bytes }
    })
    let cacheBytes = 0
    try { cacheBytes = await this.deps.session.getCacheSize() } catch { /* size is cosmetic */ }
    items.push({ id: 'http-cache', status: 'ok', count: 0, bytes: cacheBytes })
    return items
  }

  // Tasks 3-4 add clear/repair/clearHttpCache below.
}
