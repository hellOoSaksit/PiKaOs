// "Think on the server, execute locally" (spec §0.2). Two invariants (spec §3):
//  (a) the tool list is composed ONCE, here, from /api/mcp/tools — the model cannot name a tool
//      outside it; that composition IS the "no external MCP" enforcement for this surface;
//  (b) tool failures (403, declined consent, unknown name) are DATA fed back to the model —
//      only provider/network faults abort a run.
import type { ChatMessage, LlmProvider } from './providers/types'
import type { CatalogTool } from './toolClient'
import { buildSystemPrompt } from './systemPrompt'

export type AiEvent =
  | { type: 'step'; n: number }
  | { type: 'tool'; name: string }
  | { type: 'consent'; name: string }
  | { type: 'done'; text: string; truncated: boolean }
  | { type: 'error'; message: string }

export type LoopDeps = {
  provider: LlmProvider
  tools: { list(): Promise<CatalogTool[]>; call(name: string, args: Record<string, unknown>): Promise<{ status: number; result: unknown }> }
  confirm: (tool: CatalogTool) => Promise<boolean>
  onEvent: (ev: AiEvent) => void
}

export async function runLoop(
  messages: ChatMessage[],
  opts: { model: string; apiKey: string | null; maxSteps: number; signal: AbortSignal; baseUrl?: string },
  deps: LoopDeps,
): Promise<{ text: string; truncated: boolean }> {
  const catalog = await deps.tools.list()
  const byName = new Map(catalog.map(t => [t.name, t]))
  const specs = catalog.map(t => ({ name: t.name, description: t.description, inputSchema: t.input_schema }))
  // Ours goes first, even if the caller supplied one: the rules are not a suggestion the caller may
  // override by speaking earlier.
  const transcript: ChatMessage[] = [{ role: 'system', content: buildSystemPrompt(catalog) }, ...messages]

  for (let step = 1; step <= opts.maxSteps; step++) {
    deps.onEvent({ type: 'step', n: step })
    const r = await deps.provider.complete(transcript, specs, { model: opts.model, apiKey: opts.apiKey, signal: opts.signal, baseUrl: opts.baseUrl })

    if (!r.toolCalls.length) {
      deps.onEvent({ type: 'done', text: r.text, truncated: false })
      return { text: r.text, truncated: false }
    }

    transcript.push({ role: 'assistant', content: r.text, toolCalls: r.toolCalls })
    for (const call of r.toolCalls) {
      const tool = byName.get(call.name)
      let content: string
      if (!tool) {
        content = JSON.stringify({ error: `unknown tool: ${call.name}` })
      } else if (tool.effect === 'side_effect') {
        deps.onEvent({ type: 'consent', name: tool.name })
        if (await deps.confirm(tool)) {
          deps.onEvent({ type: 'tool', name: tool.name })
          const res = await deps.tools.call(call.name, call.arguments)
          content = JSON.stringify(res)
        } else {
          content = JSON.stringify({ error: 'user declined this tool call' })
        }
      } else {
        deps.onEvent({ type: 'tool', name: tool.name })
        const res = await deps.tools.call(call.name, call.arguments)
        content = JSON.stringify(res)
      }
      transcript.push({ role: 'tool', toolCallId: call.id, name: call.name, content })
    }
  }

  const last = [...transcript].reverse().find(m => m.role === 'assistant')
  const text = last && last.role === 'assistant' ? last.content : ''
  deps.onEvent({ type: 'done', text, truncated: true })
  return { text, truncated: true }
}
