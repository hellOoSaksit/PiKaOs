import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { CatalogTool } from '../ai/toolClient'
import { GATEWAY_SERVER_INFO, GATEWAY_CAPABILITIES } from './protocol'

export type GatewayDeps = {
  listTools: () => Promise<CatalogTool[]>
  callTool: (name: string, args: Record<string, unknown>) => Promise<{ status: number; result: unknown }>
  consent: (tool: CatalogTool) => Promise<boolean>
  // Resolves once pipe.ts's pairing dialog has allowed this connection, rejects on denial or a
  // stalled handshake. Awaited before EITHER handler below touches `deps` — the SDK does not refuse
  // requests before `notifications/initialized` on its own (verified against 1.29.0's
  // Protocol._onrequest, which dispatches straight to the handler map), so this is the only gate.
  requirePaired: () => Promise<void>
}

// The external face of the gateway. It owns NO authorization: listTools is /api/mcp/tools (already
// allowlist ∩ the caller's permissions) and callTool is /api/mcp/call, which re-enters the ASGI app
// so require_perm decides. Pre-filtering here would be a second, drifting copy of authz.
export function createGatewayServer(deps: GatewayDeps): Server {
  const server = new Server(GATEWAY_SERVER_INFO, { capabilities: GATEWAY_CAPABILITIES })

  server.setRequestHandler(ListToolsRequestSchema, async () => {
    // A rejection here means the connection is already being torn down by pipe.ts's forceClose —
    // by the time this throw reaches the SDK's own error-response path, the transport's underlying
    // socket is already unwritable, so nothing crosses the wire (rule 10).
    await deps.requirePaired()
    let tools: CatalogTool[]
    try {
      tools = await deps.listTools()
    } catch {
      // ListToolsResult has no isError slot (unlike CallToolResult below) — a listing failure has to
      // surface as a JSON-RPC protocol error. The SDK forwards a thrown message verbatim (rule 10:
      // no internal paths/status), so rethrow sanitized instead of letting listTools()'s fault through.
      throw new Error('failed to list tools')
    }
    return {
      tools: tools.map(t => ({
        name: t.name, description: t.description, inputSchema: t.input_schema,
      })),
    }
  })

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    // Same gate as ListTools, before the catalog or consent or the backend are touched at all.
    await deps.requirePaired()
    const name = req.params.name
    const args = (req.params.arguments ?? {}) as Record<string, unknown>
    // Resolved from the same list the client was given, so effect class comes from the catalog and
    // is never re-derived here (E1 classifies pessimistically; second-guessing it loses that).
    let catalog: CatalogTool[]
    try {
      catalog = await deps.listTools()
    } catch {
      // Re-fetched here (not cached from tools/list) so the effect class is always current; a failure
      // is a tool result like every other fault on this path, never an uncaught rejection.
      return err('could not reach the tool catalog')
    }
    const tool = catalog.find(t => t.name === name)
    if (!tool) return err('unknown tool')
    let consented: boolean
    try {
      consented = await deps.consent(tool)
    } catch {
      // makeConsent (consent/gate.ts) persists an approval with a bare writeFileSync; if that throws
      // (disk full, permission denied, path gone) the message carries the real approvals-file path —
      // same fault class as the two catches below, sanitize it the same way.
      return err('could not record consent for this call')
    }
    if (!consented) return err('the operator declined this call')
    let called: { status: number; result: unknown }
    try {
      called = await deps.callTool(name, args)
    } catch {
      // ToolClient.call only throws on 5xx (a fault, not data for the model) — surface it the same
      // way every other failure path here does: a tool result, never an uncaught rejection (that
      // would become a protocol error carrying the fault's message, e.g. "mcp/call 500", verbatim).
      return err('the backend failed to execute this call')
    }
    return {
      isError: called.status >= 400,
      content: [{ type: 'text' as const, text: JSON.stringify(called.result) }],
    }
  })

  return server
}

// Client-facing text stays generic — no stack traces, no internal paths (rule 10).
const err = (text: string) => ({ isError: true, content: [{ type: 'text' as const, text }] })
