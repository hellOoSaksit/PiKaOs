// THE shared effect-class TOOL-CALL consent gate (G3): "may this tool be CALLED?", keyed per tool
// NAME by its catalog effect class. Both the AI Console (this plan) and the E2 MCP gateway consume
// THIS one module — a second copy would let approval semantics diverge. This is a DIFFERENT surface
// from McpManager's start-consent ("may this server PROCESS spawn?", command/args hash — index.ts
// confirmMcpStart + mcp-approvals.json), which is untouched.
// Effect classes come from the catalog (E1 classifies pessimistically: POST/DELETE = side_effect) —
// never re-derived here. Declines are deliberately not persisted: "no" means "not this time".
//
// One module, one store PER SURFACE. Approvals are keyed by tool NAME alone — this gate has no
// notion of who is asking — so every caller sharing an approvalsPath inherits every approval given
// through it. That is why index.ts passes a different path for each surface (`ai-approvals.json` for
// the AI Console, `gateway-approvals.json` for the external MCP gateway): an approval the operator
// granted a foreground, user-driven loop must not silently transfer to a background client that can
// run while nobody is watching. Adding a third surface means adding a third path, never reusing one.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'
import type { CatalogTool } from '../ai/toolClient'

export function makeConsent(approvalsPath: string, ask: (tool: CatalogTool) => Promise<boolean>) {
  const load = (): Set<string> => {
    if (!existsSync(approvalsPath)) return new Set()
    try { return new Set(JSON.parse(readFileSync(approvalsPath, 'utf8'))) } catch { return new Set() }
  }
  return async (tool: CatalogTool): Promise<boolean> => {
    if (tool.effect !== 'side_effect') return true
    const approved = load()
    if (approved.has(tool.name)) return true
    const ok = await ask(tool)
    if (ok) { approved.add(tool.name); writeFileSync(approvalsPath, JSON.stringify([...approved])) }
    return ok
  }
}
