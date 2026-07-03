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
  // Content hash gates consent later — covers command + args + the SET of env keys only.
  // Deliberately excludes `label` and `secretKeys`/secret values so renaming or rotating
  // secrets never invalidates a user's prior consent.
  hash(def: McpServerDef) {
    return createHash('sha256')
      .update(JSON.stringify([def.command, def.args, Object.keys(def.env ?? {}).sort()]))
      .digest('hex')
  }
}
