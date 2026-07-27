import { it, expect, beforeEach } from 'vitest'
import { mkdtempSync, statSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { writeHandshake, readHandshake, configSnippet } from '../src/main/gateway/handshake'

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

it('configSnippet is valid JSON naming the pikaos server, ELECTRON_RUN_AS_NODE, and the handshake path — and never the token', () => {
  const { handshake, path } = writeHandshake(dir)
  const snippet = JSON.parse(configSnippet('C:\\app\\PiKaOs.exe', 'C:\\app\\pikaos-mcp.js', path))
  const entry = snippet.mcpServers.pikaos
  expect(entry.command).toBe('C:\\app\\PiKaOs.exe')
  expect(entry.args).toEqual(['C:\\app\\pikaos-mcp.js', '--handshake', path])
  expect(entry.env.ELECTRON_RUN_AS_NODE).toBe('1')
  expect(JSON.stringify(snippet)).not.toContain(handshake.token)
})
