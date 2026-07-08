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
    // Every exit out of this method funnels through this try/catch so the key can never escape
    // unscrubbed — not just the two explicit `throw`s below, but also fetch() rejecting (network/
    // DNS/invalid header) and res.json() throwing on a malformed 200 body. Structural, not a
    // per-call-site patch, because later adapters (OpenAI/Ollama) copy this shape.
    try {
      return await this.#send(messages, tools, opts)
    } catch (err) {
      // ProviderAuthError already carries a redacted message (built below) and callers
      // instanceof-check it to clear the stored key — flattening it here would break that.
      if (err instanceof ProviderAuthError) throw err
      // AbortSignal-triggered fetch rejections are DOMException/Error with name 'AbortError'.
      // The agent loop's cancel path relies on catching that distinct identity; an abort never
      // carries the key (it's a signal, not response data), so it's safe to re-throw as-is.
      if (err instanceof Error && err.name === 'AbortError') throw err
      const message = err instanceof Error ? err.message : String(err)
      throw new Error(redacted(message, opts.apiKey))
    }
  }

  async #send(messages: ChatMessage[], tools: ToolSpec[], opts: CompleteOpts): Promise<CompleteResult> {
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
    // The vendor response is untrusted input: a malformed truthy-but-non-array `content` (e.g. an
    // object) must not crash the caller with a raw TypeError — degrade to no content instead.
    const blocks = Array.isArray(body.content) ? body.content : []
    const text = blocks.filter((b) => b.type === 'text').map((b) => b.text).join('')
    const toolCalls = blocks
      // A `tool_use` block missing `id`/`name` is malformed vendor data; skip it rather than
      // (a) yielding a ToolCall with `undefined` fields via a non-null assertion, which the loop
      // would then dispatch as a broken tool call, or (b) throwing and discarding every other
      // valid block/text in the same response for one bad entry.
      .filter((b): b is AnthropicContentBlock & { id: string; name: string } =>
        b.type === 'tool_use' && typeof b.id === 'string' && typeof b.name === 'string')
      .map((b) => ({ id: b.id, name: b.name, arguments: b.input ?? {} }))
    return { text, toolCalls }
  }
}
