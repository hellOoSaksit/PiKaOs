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
export class ProviderAuthError extends Error {}

// A thrown error's message may embed the response body, and the body may echo the key back.
// Scrub before any error can leave a provider (rule 2: never print a credential).
export function redacted(message: string, apiKey: string | null): string {
  return apiKey ? message.split(apiKey).join('****') : message
}
