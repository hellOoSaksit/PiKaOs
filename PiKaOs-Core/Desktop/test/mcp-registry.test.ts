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
it('hash covers command/args/env/secretKeys but ignores label', () => {
  const r = new McpRegistry(store())
  const base = { ...def, env: { FOO: 'bar' } }
  expect(r.hash(base)).toBe(r.hash({ ...base, label: 'renamed' }))                    // label cosmetic — ignored
  expect(r.hash(base)).not.toBe(r.hash({ ...base, args: ['-y', '@x/other'] }))        // args matter
  expect(r.hash(base)).not.toBe(r.hash({ ...base, env: { FOO: 'evil' } }))            // env VALUE matters (RCE guard)
  expect(r.hash(base)).not.toBe(r.hash({ ...base, secretKeys: ['FS_TOKEN', 'EXTRA'] })) // injected-secret set matters (exfil guard)
})
