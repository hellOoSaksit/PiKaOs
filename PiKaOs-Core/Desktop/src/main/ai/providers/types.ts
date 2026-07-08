// Neutral message/tool model every vendor adapter translates to and from. The loop (ai/loop.ts)
// speaks only these types — adding a vendor is one new adapter file, never a loop change.
export type ToolSpec = { name: string; description: string; inputSchema: Record<string, unknown> }
export type ToolCall = { id: string; name: string; arguments: Record<string, unknown> }
export type ChatMessage =
  | { role: 'system' | 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string }
export type CompleteOpts = { model: string; apiKey: string | null; signal: AbortSignal; baseUrl?: string }
export type CompleteResult = { text: string; toolCalls: ToolCall[] }
export interface LlmProvider {
  complete(messages: ChatMessage[], tools: ToolSpec[], opts: CompleteOpts): Promise<CompleteResult>
}

// 401/403 from the vendor. Upstream (ai/ipc.ts) clears the stored key on this — retrying a bad
// key is a dev loop (rule 9).
//
// CONTRACT (enforce this yourself — the type system can't): the `message` you pass to this
// constructor MUST already be redacted, e.g. `new ProviderAuthError(redacted(rawBody, apiKey))`.
// withRedaction()'s catch block special-cases `instanceof ProviderAuthError` and re-throws it
// UNSCRUBBED — that's what lets a caller build a deliberately-formatted message without
// withRedaction mangling it, but it also means withRedaction does NOT scrub for you here.
// `throw new ProviderAuthError(rawVendorBody)` leaks the key straight through. Follow the
// established pattern in anthropic.ts / openai.ts: redact first, construct second.
export class ProviderAuthError extends Error {}

// A thrown error's message may embed the response body, and the body may echo the key back.
// Scrub before any error can leave a provider (rule 2: never print a credential).
export function redacted(message: string, apiKey: string | null): string {
  return apiKey ? message.split(apiKey).join('****') : message
}

// Every adapter's complete() funnels its whole request/parse path through this so the key can
// never escape unscrubbed — not just an explicit `throw` inside `fn`, but also fetch() rejecting
// (network/DNS/invalid header) and res.json() throwing on a malformed 200 body. Shared here
// (originally hand-rolled per-adapter in anthropic.ts) so adding a vendor never means re-copying
// the scrubbing funnel.
export async function withRedaction<T>(apiKey: string | null, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (err) {
    // ProviderAuthError already carries a redacted message (built by the caller before throwing —
    // see the CONTRACT comment on the class above) and callers instanceof-check it to clear the
    // stored key — flattening it here would break that. This helper trusts, not enforces, the
    // contract: it does NOT re-redact ProviderAuthError's message.
    if (err instanceof ProviderAuthError) throw err
    // AbortSignal-triggered fetch rejections are DOMException/Error with name 'AbortError'. The
    // agent loop's cancel path relies on catching that distinct identity; an abort never carries
    // the key (it's a signal, not response data), so it's safe to re-throw as-is.
    if (err instanceof Error && err.name === 'AbortError') throw err
    const message = err instanceof Error ? err.message : String(err)
    throw new Error(redacted(message, apiKey))
  }
}
