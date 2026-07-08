import { ChatMessage, CompleteOpts, CompleteResult, LlmProvider, ProviderAuthError, ToolSpec, redacted, withRedaction } from './types'

const API = 'https://api.openai.com/v1/chat/completions'

// tool_calls only ever ride on an assistant message; tool results are a distinct 'tool' role
// message keyed by tool_call_id. Same discriminant-switch shape as anthropic.ts's toAnthropic.
function toOpenAi(messages: ChatMessage[]) {
  return messages.map((m) => {
    switch (m.role) {
      case 'assistant':
        return {
          role: 'assistant',
          content: m.content || null,
          ...(m.toolCalls?.length
            ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.arguments) } })) }
            : {}),
        }
      case 'tool':
        return { role: 'tool', tool_call_id: m.toolCallId, content: m.content }
      default:
        return { role: m.role, content: m.content }
    }
  })
}

// No "DOM" lib in this tsconfig means res.json() returns unknown — type the response body
// locally, same pattern as anthropic.ts's AnthropicResponseBody. Fields are optional (not the
// required shape a well-formed response would have) because the vendor body is untrusted input —
// parseOpenAiToolCall below is what actually validates each entry before it becomes a ToolCall.
type OpenAiToolCall = { id?: string; function?: { name?: string; arguments?: string } }
type OpenAiResponseBody = { choices?: Array<{ message?: { content?: string | null; tool_calls?: OpenAiToolCall[] } }> }

// A malformed tool_calls entry (missing `function`/`name`, or `arguments` that isn't valid JSON)
// is untrusted vendor data, not a program bug — one bad entry must not abort the whole turn and
// discard every other valid tool call / the response text, same reasoning as anthropic.ts's
// tool_use block filter. Returns null for anything that doesn't parse; callers filter nulls out.
function parseOpenAiToolCall(c: OpenAiToolCall): { id: string; name: string; arguments: Record<string, unknown> } | null {
  if (typeof c.id !== 'string' || typeof c.function?.name !== 'string') return null
  try {
    return { id: c.id, name: c.function.name, arguments: JSON.parse(c.function.arguments || '{}') as Record<string, unknown> }
  } catch {
    return null
  }
}

export class OpenAiProvider implements LlmProvider {
  async complete(messages: ChatMessage[], tools: ToolSpec[], opts: CompleteOpts): Promise<CompleteResult> {
    return withRedaction(opts.apiKey, () => this.#send(messages, tools, opts))
  }

  async #send(messages: ChatMessage[], tools: ToolSpec[], opts: CompleteOpts): Promise<CompleteResult> {
    const res = await fetch(opts.baseUrl ?? API, {
      method: 'POST',
      signal: opts.signal,
      headers: { 'content-type': 'application/json', authorization: `Bearer ${opts.apiKey ?? ''}` },
      body: JSON.stringify({
        model: opts.model,
        messages: toOpenAi(messages),
        ...(tools.length ? { tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } })) } : {}),
      }),
    })
    if (!res.ok) {
      const detail = redacted(`openai ${res.status}: ${await res.text()}`, opts.apiKey)
      if (res.status === 401 || res.status === 403) throw new ProviderAuthError(detail)
      throw new Error(detail)
    }
    const body = (await res.json()) as OpenAiResponseBody
    const msg = body.choices?.[0]?.message ?? {}
    return {
      text: msg.content ?? '',
      // function.arguments is a JSON-encoded string on this vendor (confirmed against current
      // OpenAI docs — see task-2-report.md), unlike Ollama's already-parsed object.
      toolCalls: (msg.tool_calls ?? [])
        .map(parseOpenAiToolCall)
        .filter((c): c is { id: string; name: string; arguments: Record<string, unknown> } => c !== null),
    }
  }
}
