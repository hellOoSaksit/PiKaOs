// Local runtime — keyless by design (the BYO-key rules don't apply to a model that never leaves
// the machine): no Authorization header, opts.apiKey is always null for this adapter.
// OpenAI-ish message/tool shape, but two vendor differences drive the parsing here:
// tool_calls[].function.arguments arrives as an already-parsed object (not a JSON string), and
// there are no per-call ids in the response, so we synthesize one.
import { ChatMessage, CompleteOpts, CompleteResult, LlmProvider, ToolSpec, withRedaction } from './types'

const API = 'http://127.0.0.1:11434/api/chat'

// Ollama's outgoing message shape only carries role+content (no assistant tool_calls echo, no
// tool_call_id) — a 'tool' message still needs its role kept distinct from 'system'/'user' so the
// model can tell a tool result apart from user input.
function toOllama(messages: ChatMessage[]) {
  return messages.map((m) => ({ role: m.role, content: m.content }))
}

// No "DOM" lib in this tsconfig means res.json() returns unknown — type the response body
// locally, same pattern as anthropic.ts's AnthropicResponseBody.
type OllamaToolCall = { function: { name: string; arguments: Record<string, unknown> } }
type OllamaResponseBody = { message?: { content?: string; tool_calls?: OllamaToolCall[] } }

export class OllamaProvider implements LlmProvider {
  async complete(messages: ChatMessage[], tools: ToolSpec[], opts: CompleteOpts): Promise<CompleteResult> {
    return withRedaction(opts.apiKey, () => this.#send(messages, tools, opts))
  }

  async #send(messages: ChatMessage[], tools: ToolSpec[], opts: CompleteOpts): Promise<CompleteResult> {
    const res = await fetch(opts.baseUrl ?? API, {
      method: 'POST',
      signal: opts.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model: opts.model,
        messages: toOllama(messages),
        stream: false,
        ...(tools.length ? { tools: tools.map((t) => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } })) } : {}),
      }),
    })
    // No key to scrub here, but the response body still funnels through withRedaction's catch
    // (a no-op redaction on a null key) so a network/parse failure never crashes the adapter raw.
    if (!res.ok) throw new Error(`ollama ${res.status}: ${await res.text()}`)
    const body = (await res.json()) as OllamaResponseBody
    const msg = body.message ?? {}
    let n = 0
    return {
      text: msg.content ?? '',
      toolCalls: (msg.tool_calls ?? []).map((c) => ({ id: `ollama_${n++}`, name: c.function.name, arguments: c.function.arguments ?? {} })),
    }
  }
}
