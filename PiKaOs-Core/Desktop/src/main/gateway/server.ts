import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { CatalogTool } from '../ai/toolClient'
import { GATEWAY_SERVER_INFO, GATEWAY_CAPABILITIES } from './protocol'

export type GatewayDeps = {
  listTools: () => Promise<CatalogTool[]>
  callTool: (name: string, args: Record<string, unknown>) => Promise<{ status: number; result: unknown }>
  consent: (tool: CatalogTool) => Promise<boolean>
}

// The external face of the gateway. It owns NO authorization: listTools is /api/mcp/tools (already
// allowlist ∩ the caller's permissions) and callTool is /api/mcp/call, which re-enters the ASGI app
// so require_perm decides. Pre-filtering here would be a second, drifting copy of authz.
export function createGatewayServer(deps: GatewayDeps): Server {
  const server = new Server(GATEWAY_SERVER_INFO, { capabilities: GATEWAY_CAPABILITIES })

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: (await deps.listTools()).map(t => ({
      name: t.name, description: t.description, inputSchema: t.input_schema,
    })),
  }))

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const name = req.params.name
    const args = (req.params.arguments ?? {}) as Record<string, unknown>
    // Resolved from the same list the client was given, so effect class comes from the catalog and
    // is never re-derived here (E1 classifies pessimistically; second-guessing it loses that).
    const tool = (await deps.listTools()).find(t => t.name === name)
    if (!tool) return err('unknown tool')
    if (!(await deps.consent(tool))) return err('the operator declined this call')
    const { status, result } = await deps.callTool(name, args)
    return {
      isError: status >= 400,
      content: [{ type: 'text' as const, text: JSON.stringify(result) }],
    }
  })

  return server
}

// Client-facing text stays generic — no stack traces, no internal paths (rule 10).
const err = (text: string) => ({ isError: true, content: [{ type: 'text' as const, text }] })
