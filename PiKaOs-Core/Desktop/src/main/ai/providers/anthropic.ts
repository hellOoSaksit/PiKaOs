import { ChatMessage, CompleteOpts, CompleteResult, LlmProvider, ProviderAuthError, ToolSpec, redacted } from './types'

const API = 'https://api.anthropic.com/v1/messages'
const VERSION = '2023-06-01'

// system prompt is a top-level field; assistant tool calls and tool results are content blocks.
// A switch on the discriminant (rather than sequential if/continue) is what lets TS narrow
// ChatMessage's role-tagged union all the way to the 'tool' member's toolCallId field below.
function toAnthropic(messages: ChatMessage[]) {
  let system = ''
  const out: Array<{ role: 'user' | 'assistant'; content: unknown }> = []
  for (const m of messages) {
    switch (m.role) {
      case 'system':
        system = m.content
        break
      case 'user':
        out.push({ role: 'user', content: m.content })
        break
      case 'assistant': {
        const blocks: unknown[] = m.content ? [{ type: 'text', text: m.content }] : []
        for (const c of m.toolCalls ?? []) blocks.push({ type: 'tool_use', id: c.id, name: c.name, input: c.arguments })
        out.push({ role: 'assistant', content: blocks })
        break
      }
      case 'tool':
        out.push({ role: 'user', content: [{ type: 'tool_result', tool_use_id: m.toolCallId, content: m.content }] })
        break
    }
  }
  return { system, messages: out }
}

// @types/node's fetch typings return Promise<unknown> from Response.json() (stricter than DOM's
// Promise<any>) since this tsconfig has no "DOM" lib — narrow explicitly at the one call site.
type AnthropicContentBlock = { type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }
type AnthropicResponseBody = { content?: AnthropicContentBlock[] }

export class AnthropicProvider implements LlmProvider {
  async complete(messages: ChatMessage[], tools: ToolSpec[], opts: CompleteOpts): Promise<CompleteResult> {
    const { system, messages: msgs } = toAnthropic(messages)
    const res = await fetch(opts.baseUrl ?? API, {
      method: 'POST',
      signal: opts.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': opts.apiKey ?? '', 'anthropic-version': VERSION },
      body: JSON.stringify({
        model: opts.model, max_tokens: 4096,
        ...(system ? { system } : {}),
        messages: msgs,
        ...(tools.length ? { tools: tools.map(t => ({ name: t.name, description: t.description, input_schema: t.inputSchema })) } : {}),
      }),
    })
    if (!res.ok) {
      const detail = redacted(`anthropic ${res.status}: ${await res.text()}`, opts.apiKey)
      if (res.status === 401 || res.status === 403) throw new ProviderAuthError(detail)
      throw new Error(detail)
    }
    const body = (await res.json()) as AnthropicResponseBody
    const blocks = body.content ?? []
    const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('')
    const toolCalls = blocks
      .filter((b) => b.type === 'tool_use')
      .map((b) => ({ id: b.id!, name: b.name!, arguments: b.input ?? {} }))
    return { text, toolCalls }
  }
}
