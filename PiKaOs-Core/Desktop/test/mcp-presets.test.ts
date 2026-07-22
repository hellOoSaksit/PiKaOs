import { describe, it, expect } from 'vitest'
// Cross-package imports are deliberate: presets/logic are dependency-free JS (no React),
// and only THIS suite owns the real serverDefSchema — presets must never drift from the gate.
import { MCP_PRESETS } from '../Frontend/src/data/mcpPresets.js'
import { presetToDef } from '../Frontend/src/screens/secondary/LocalMcp.logic.js'
import { parseServerDef } from '../src/main/mcp/registry'

describe('MCP_PRESETS', () => {
  it('every preset def (params filled with plausible values) passes parseServerDef', () => {
    for (const p of MCP_PRESETS) {
      const params = Object.fromEntries((p.params ?? []).map(prm => [prm.name, 'C:\\example']))
      const def = presetToDef(p, params, `${p.id} label`)
      expect(() => parseServerDef(def)).not.toThrow()
    }
  })
  it('ids are unique and command is npx (the resolver-covered path)', () => {
    const ids = MCP_PRESETS.map(p => p.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const p of MCP_PRESETS) expect(p.command).toBe('npx')
  })
  it('presets never carry secret VALUES, only env-var-shaped names', () => {
    for (const p of MCP_PRESETS) {
      if (p.secret) expect(p.secret.key).toMatch(/^[A-Za-z_][A-Za-z0-9_]*$/)
      expect(JSON.stringify(p)).not.toMatch(/value|token['"]?\s*:/i)
    }
  })
})
