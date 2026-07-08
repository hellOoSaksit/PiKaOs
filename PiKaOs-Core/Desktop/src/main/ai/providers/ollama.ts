// Local runtime — keyless by design (the BYO-key rules don't apply to a model that never leaves
// the machine): no Authorization header, opts.apiKey is always null for this adapter.
// OpenAI-ish message/tool shape, but three vendor differences drive the parsing/serializing here:
// tool_calls[].function.arguments arrives as an already-parsed object (not a JSON string), there
// are no per-call ids anywhere in Ollama's wire format (request or response) so we synthesize one
// for OUR internal ToolCall.id contract, and a 'tool' result is identified by name (`tool_name`),
// not by an id. Confirmed against the live docs — see task-2-report.md for the source + the exact
// example request body this mirrors.
import { ChatMessage, CompleteOpts, CompleteResult, LlmProvider, ToolSpec, withRedaction } from './types'

const API = 'http://127.0.0.1:11434/api/chat'

// The agent loop round-trips a transcript through complete() repeatedly: it calls complete(),
// gets toolCalls back, executes them, appends the assistant turn AND the tool results to the
// SAME messages array, and calls complete() again. That means an assistant message with
// toolCalls and its matching tool-result message must both survive re-serialization on every
// later call — dropping either one (as a bare {role,content} map does) makes the model see an
// assistant turn that said nothing, followed by an unlabeled result, and it loses all context of
// what it called and why. Ollama's own wire format carries this differently from ours: an
// assistant tool call is `{function:{name,arguments}}` (no id), and a tool result is
// `{role:'tool', content, tool_name}` (named, not id-keyed) — our ChatMessage's `toolCallId` is
// purely an internal correlation key the loop uses to route each tool result to the call that
// produced it; Ollama never sees it, only `name`/`tool_name`.
function toOllama(messages: ChatMessage[]) {
  return messages.map((m) => {
    switch (m.role) {
      case 'assistant':
        return {
          role: 'assistant',
          content: m.content,
          ...(m.toolCalls?.length
            ? { tool_calls: m.toolCalls.map((c) => ({ function: { name: c.name, arguments: c.arguments } })) }
            : {}),
        }
      case 'tool':
        return { role: 'tool', content: m.content, tool_name: m.name }
      default:
        return { role: m.role, content: m.content }
    }
  })
}

// No "DOM" lib in this tsconfig means res.json() returns unknown — type the response body
// locally, same pattern as anthropic.ts's AnthropicResponseBody.
type OllamaToolCall = { function: { name: string; arguments: Record<string, unknown> } }
type OllamaResponseBody = { message?: { content?: string; tool_calls?: OllamaToolCall[] } }

// Module-scope, not a per-#send()-call local: the agent loop calls complete() once per turn of a
// conversation (often via a fresh `new OllamaProvider()` each time — see ai/loop.ts), and Ollama's
// response never carries its own ids. A counter reset to 0 on every call would recur the same
// `ollama_0` on turn 1 and turn 3 of the SAME conversation. That collision is otherwise latent
// (today's toOllama() never echoes an id back to Ollama — it re-derives what to send from `name`),
// but nothing guarantees every future consumer of ToolCall.id treats it as scoped-to-one-turn, so
// keep ids globally unique for the process lifetime rather than lean on that assumption holding.
let nextOllamaToolCallId = 0

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
    return {
      text: msg.content ?? '',
      toolCalls: (msg.tool_calls ?? []).map((c) => ({ id: `ollama_${nextOllamaToolCallId++}`, name: c.function.name, arguments: c.function.arguments ?? {} })),
    }
  }
}
