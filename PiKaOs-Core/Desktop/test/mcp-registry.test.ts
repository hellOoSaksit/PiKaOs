import { it, expect } from 'vitest'
import { mkdtempSync } from 'node:fs'; import { tmpdir } from 'node:os'; import { join } from 'node:path'
import { McpRegistry } from '../src/main/mcp/registry'

const store = () => join(mkdtempSync(join(tmpdir(), 'r-')), 'mcp.json')
const def = { id: 'fs', label: 'Filesystem', command: 'npx', args: ['-y', '@x/fs'], secretKeys: ['FS_TOKEN'] }

it('adds, gets, lists, removes', () => {
  const r = new McpRegistry(store())
  r.add(def); expect(r.get('fs')?.label).toBe('Filesystem'); expect(r.list()).toHaveLength(1)
  r.remove('fs'); expect(r.get('fs')).toBeUndefined()
})
it('hash is stable and ignores secret values', () => {
  const r = new McpRegistry(store())
  expect(r.hash(def)).toBe(r.hash({ ...def, label: 'renamed' }))       // label not in hash
  expect(r.hash(def)).not.toBe(r.hash({ ...def, args: ['-y', '@x/other'] }))
})
