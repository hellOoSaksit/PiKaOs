import { it, expect } from 'vitest'
import { parseServerDef } from '../src/main/mcp/registry'

const good = { id: 'fs', label: 'FS', command: 'npx', args: ['-y', '@x/fs'] }

it('accepts a well-formed def (and optional env/secretKeys)', () => {
  expect(parseServerDef(good)).toEqual(good)
  const full = { ...good, env: { NODE_ENV: 'production' }, secretKeys: ['FS_TOKEN'] }
  expect(parseServerDef(full)).toEqual(full)
})

it('rejects missing command, non-array args, and unknown keys', () => {
  expect(() => parseServerDef({ ...good, command: undefined })).toThrow()
  expect(() => parseServerDef({ ...good, args: 'rm -rf /' })).toThrow()
  expect(() => parseServerDef({ ...good, exec: 'evil' })).toThrow()
  expect(() => parseServerDef(null)).toThrow()
})

it('rejects env/secret names that are not env-var shaped', () => {
  expect(() => parseServerDef({ ...good, env: { 'LD_PRELOAD;x': 'y' } })).toThrow()
  expect(() => parseServerDef({ ...good, secretKeys: ['bad key'] })).toThrow()
})

it('bounds sizes: id shape, arg count, string lengths', () => {
  expect(() => parseServerDef({ ...good, id: 'Bad Id!' })).toThrow()
  expect(() => parseServerDef({ ...good, args: Array(65).fill('x') })).toThrow()
  expect(() => parseServerDef({ ...good, command: 'x'.repeat(1025) })).toThrow()
})
