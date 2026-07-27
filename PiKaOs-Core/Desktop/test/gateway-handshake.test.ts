import { it, expect, beforeEach } from 'vitest'
import { mkdtempSync, statSync, readFileSync, chmodSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeHandshake, readHandshake, configSnippet } from '../src/main/gateway/handshake'
import { SHIM_FLAG } from '../src/main/shim-mode'

let dir: string
beforeEach(() => { dir = mkdtempSync(join(tmpdir(), 'gw-')) })

it('writes a 64-hex token and a unique pipe name, and rotates both on every call', () => {
  const a = writeHandshake(dir)
  const b = writeHandshake(dir)
  expect(a.handshake.token).toMatch(/^[0-9a-f]{64}$/)
  expect(b.handshake.token).not.toBe(a.handshake.token)
  expect(b.handshake.pipe).not.toBe(a.handshake.pipe)
  expect(b.path).toBe(a.path)   // same file path — only the contents rotate
})

it('readHandshake round-trips what writeHandshake wrote', () => {
  const { handshake, path } = writeHandshake(dir)
  expect(readHandshake(path)).toEqual(handshake)
})

it('readHandshake throws on a malformed file rather than returning a partial handshake', () => {
  const { path } = writeHandshake(dir)
  require('node:fs').writeFileSync(path, '{"pipe":"x"}')
  expect(() => readHandshake(path)).toThrow()
})

it('the file is not group- or world-readable on posix', () => {
  if (process.platform === 'win32') return
  const { path } = writeHandshake(dir)
  expect(statSync(path).mode & 0o077).toBe(0)
})

it('re-tightens permissions on overwrite even if the existing file was left group/world-readable', () => {
  if (process.platform === 'win32') return
  const { path } = writeHandshake(dir)
  chmodSync(path, 0o644) // simulate a loose file left by an older build / manual chmod / backup tool
  writeHandshake(dir)    // second write to the same path — this is the overwrite path
  expect(statSync(path).mode & 0o077).toBe(0)
})

it('readHandshake throws its own error on a file containing JSON null, not a raw TypeError', () => {
  const { path } = writeHandshake(dir)
  require('node:fs').writeFileSync(path, 'null')
  expect(() => readHandshake(path)).toThrow('gateway handshake file is malformed')
})

it('configSnippet is valid JSON naming the pikaos server, the shim flag, and the handshake path — and never the token or ELECTRON_RUN_AS_NODE', () => {
  const { handshake, path } = writeHandshake(dir)
  const snippet = JSON.parse(configSnippet('C:\\app\\PiKaOs.exe', path))
  const entry = snippet.mcpServers.pikaos
  expect(entry.command).toBe('C:\\app\\PiKaOs.exe')
  expect(entry.args).toEqual([SHIM_FLAG, '--handshake', path])
  expect(entry.env).toBeUndefined()
  expect(JSON.stringify(snippet)).not.toContain(handshake.token)
  expect(JSON.stringify(snippet)).not.toContain('ELECTRON_RUN_AS_NODE')
})
