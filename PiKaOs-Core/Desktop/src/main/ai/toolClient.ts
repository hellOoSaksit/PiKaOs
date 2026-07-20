// The ONLY tool source the AI loop has. Authorization stays server-owned: we never pre-check
// permissions here — /api/mcp/call re-enters the ASGI app and require_perm decides (E1 design).
// getToken() returning null IS the open-mode branch: no header, backend's bootstrap provider
// treats the caller as the machine owner.
export type CatalogTool = {
  name: string; description: string
  input_schema: Record<string, unknown>
  effect: 'read' | 'idempotent_write' | 'side_effect'
}

export class ToolClient {
  constructor(
    private getToken: () => Promise<string | null>,
    private getApiBase: () => string,
  ) {}

  private async headers(): Promise<Record<string, string>> {
    const h: Record<string, string> = { 'content-type': 'application/json' }
    const t = await this.getToken()
    if (t) h.authorization = `Bearer ${t}`
    return h
  }

  async list(): Promise<CatalogTool[]> {
    const res = await fetch(`${this.getApiBase()}/mcp/tools`, { headers: await this.headers() })
    if (!res.ok) throw new Error(`mcp/tools ${res.status}`)
    const data = (await res.json()) as { tools: CatalogTool[] }
    return data.tools
  }

  // 4xx is data for the model (forbidden / not found are answers, not faults); 5xx is a fault.
  async call(name: string, args: Record<string, unknown>): Promise<{ status: number; result: unknown }> {
    const res = await fetch(`${this.getApiBase()}/mcp/call`, {
      method: 'POST', headers: await this.headers(),
      body: JSON.stringify({ name, arguments: args }),
    })
    if (res.status >= 500) throw new Error(`mcp/call ${res.status}`)
    return { status: res.status, result: await res.json().catch(() => null) }
  }
}
