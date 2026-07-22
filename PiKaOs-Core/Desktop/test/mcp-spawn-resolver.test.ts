import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { resolveSpawn, NodeMissingError } from '../src/main/mcp/spawn-resolver'

// A fake node install dir: node.exe + node_modules/npm/bin/npx-cli.js
let nodeDir: string
beforeAll(() => {
  nodeDir = mkdtempSync(join(tmpdir(), 'fake-node-'))
  writeFileSync(join(nodeDir, 'node.exe'), '')
  mkdirSync(join(nodeDir, 'node_modules', 'npm', 'bin'), { recursive: true })
  writeFileSync(join(nodeDir, 'node_modules', 'npm', 'bin', 'npx-cli.js'), '')
})
afterAll(() => rmSync(nodeDir, { recursive: true, force: true }))

describe('resolveSpawn', () => {
  it('passes non-npx commands through untouched on every platform', () => {
    expect(resolveSpawn('node', ['x.js'], 'win32', { PATH: nodeDir }))
      .toEqual({ command: 'node', args: ['x.js'] })
    expect(resolveSpawn('python', [], 'win32', { PATH: nodeDir }))
      .toEqual({ command: 'python', args: [] })
  })
  it('passes npx through untouched off-Windows (it is a real executable there)', () => {
    expect(resolveSpawn('npx', ['-y', 'pkg'], 'linux', { PATH: nodeDir }))
      .toEqual({ command: 'npx', args: ['-y', 'pkg'] })
  })
  it('rewrites npx to node + npx-cli.js on win32, shell-less, args preserved in order', () => {
    const r = resolveSpawn('npx', ['-y', 'pkg', 'extra'], 'win32', { PATH: nodeDir })
    expect(r.command).toBe(join(nodeDir, 'node.exe'))
    expect(r.args).toEqual([join(nodeDir, 'node_modules', 'npm', 'bin', 'npx-cli.js'), '-y', 'pkg', 'extra'])
  })
  it('treats npx.cmd (any case) the same as npx', () => {
    const r = resolveSpawn('NPX.CMD', ['-y', 'pkg'], 'win32', { PATH: nodeDir })
    expect(r.command).toBe(join(nodeDir, 'node.exe'))
  })
  it('scans PATH entries in order and skips empty segments', () => {
    const r = resolveSpawn('npx', [], 'win32', { PATH: `;C:\\definitely-missing;${nodeDir}` })
    expect(r.command).toBe(join(nodeDir, 'node.exe'))
  })
  it('throws NodeMissingError when node is not on PATH', () => {
    expect(() => resolveSpawn('npx', [], 'win32', { PATH: 'C:\\nowhere' })).toThrow(NodeMissingError)
  })
  it('throws NodeMissingError when node exists but npx-cli.js does not', () => {
    const bare = mkdtempSync(join(tmpdir(), 'bare-node-'))
    writeFileSync(join(bare, 'node.exe'), '')
    try {
      expect(() => resolveSpawn('npx', [], 'win32', { PATH: bare })).toThrow(NodeMissingError)
    } finally { rmSync(bare, { recursive: true, force: true }) }
  })
})
