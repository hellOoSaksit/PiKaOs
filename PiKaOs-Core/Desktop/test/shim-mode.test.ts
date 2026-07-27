import { it, expect } from 'vitest'
import { isShimMode, SHIM_FLAG } from '../src/main/shim-mode'

// Pure function, no Electron involved — same style as isAllowedNavigation (window.test.ts) and
// resolveSpawn (mcp-spawn-resolver.test.ts).

it('is false for a normal launch (no argv, or unrelated flags)', () => {
  expect(isShimMode([])).toBe(false)
  expect(isShimMode(['electron', 'out/main/index.js'])).toBe(false)
  expect(isShimMode(['electron', '--inspect', '--no-sandbox'])).toBe(false)
})

it('is true only once the exact flag is present anywhere in argv', () => {
  expect(isShimMode(['electron', 'out/main/index.js', SHIM_FLAG, '--handshake', 'C:\\x\\gateway.json'])).toBe(true)
  expect(isShimMode([SHIM_FLAG])).toBe(true)
})

it('is not fooled by a near-miss flag', () => {
  expect(isShimMode(['--pikaos-mcp-shim-x'])).toBe(false)
  expect(isShimMode(['-pikaos-mcp-shim'])).toBe(false)
})
