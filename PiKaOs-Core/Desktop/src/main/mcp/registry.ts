import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

// Secret VALUES never live here — only bare key NAMES in `secretKeys` (resolved via vault at run time).
export type McpServerDef = {
  id: string
  label: string
  command: string
  args: string[]
  env?: Record<string, string>
  secretKeys?: string[]
}

export class McpRegistry {
  constructor(private storePath: string) {}
  private read(): McpServerDef[] { return existsSync(this.storePath) ? JSON.parse(readFileSync(this.storePath, 'utf8')) : [] }
  private write(d: McpServerDef[]) { writeFileSync(this.storePath, JSON.stringify(d, null, 2)) }
  list() { return this.read() }
  get(id: string) { return this.read().find(d => d.id === id) }
  add(def: McpServerDef) { const d = this.read().filter(x => x.id !== def.id); d.push(def); this.write(d) }
  remove(id: string) { this.write(this.read().filter(d => d.id !== id)) }
  // Content hash gates consent later, so it MUST cover everything that affects what runs and
  // what gets injected: command, args, env (keys AND values), and the SET of injected secret
  // names (`secretKeys`). Omitting env values would let a tampered store swap e.g.
  // NODE_OPTIONS=--require /evil.js under an already-approved hash (RCE); omitting secretKeys
  // would let it inject an extra vault secret without re-consent (exfiltration).
  // It deliberately excludes `label` (cosmetic) and actual secret VALUES — those live in the
  // vault, never in the def — so rotating a vault secret never invalidates prior consent.
  hash(def: McpServerDef) {
    const env = Object.entries(def.env ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    const secretKeys = [...(def.secretKeys ?? [])].sort()
    return createHash('sha256')
      .update(JSON.stringify([def.command, def.args, env, secretKeys]))
      .digest('hex')
  }
}
