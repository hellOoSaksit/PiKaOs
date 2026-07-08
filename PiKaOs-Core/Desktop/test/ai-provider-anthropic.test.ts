import { it, expect, vi, beforeEach } from 'vitest'
import { AnthropicProvider } from '../src/main/ai/providers/anthropic'
import { ProviderAuthError, redacted } from '../src/main/ai/providers/types'

const fetchMock = vi.fn()
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock) })

const OPTS = { model: 'claude-sonnet-5', apiKey: 'sk-ant-SECRET123', signal: new AbortController().signal }

it('maps messages+tools to the /v1/messages shape and parses a text answer', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({
    content: [{ type: 'text', text: 'hello' }], stop_reason: 'end_turn',
  }), { status: 200 }))
  const p = new AnthropicProvider()
  const r = await p.complete(
    [{ role: 'system', content: 'sys' }, { role: 'user', content: 'hi' }],
    [{ name: 'pikaos.storage.status', description: 'd', inputSchema: { type: 'object' } }],
    OPTS)
  expect(r).toEqual({ text: 'hello', toolCalls: [] })
  const [url, init] = fetchMock.mock.calls[0]
  expect(String(url)).toBe('https://api.anthropic.com/v1/messages')
  expect(init.headers['x-api-key']).toBe('sk-ant-SECRET123')
  const body = JSON.parse(init.body)
  expect(body.system).toBe('sys')                                  // system goes top-level, not in messages
  expect(body.messages).toEqual([{ role: 'user', content: 'hi' }])
  expect(body.tools[0]).toEqual({ name: 'pikaos.storage.status', description: 'd', input_schema: { type: 'object' } })
})

it('parses tool_use blocks into ToolCalls and serializes tool results back', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({
    content: [{ type: 'tool_use', id: 'tu_1', name: 'pikaos.plugins.list', input: { a: 1 } }],
    stop_reason: 'tool_use',
  }), { status: 200 }))
  const p = new AnthropicProvider()
  const r = await p.complete([
    { role: 'user', content: 'go' },
    { role: 'assistant', content: '', toolCalls: [{ id: 'tu_0', name: 't', arguments: {} }] },
    { role: 'tool', toolCallId: 'tu_0', name: 't', content: '{"ok":true}' },
  ], [], OPTS)
  expect(r.toolCalls).toEqual([{ id: 'tu_1', name: 'pikaos.plugins.list', arguments: { a: 1 } }])
  const body = JSON.parse(fetchMock.mock.calls[0][1].body)
  // assistant tool call → content block; tool result → user message with tool_result block
  expect(body.messages[1].content[0]).toMatchObject({ type: 'tool_use', id: 'tu_0' })
  expect(body.messages[2]).toMatchObject({ role: 'user', content: [{ type: 'tool_result', tool_use_id: 'tu_0' }] })
})

it('throws ProviderAuthError on 401 with the key scrubbed from the message', async () => {
  fetchMock.mockResolvedValue(new Response('bad key sk-ant-SECRET123', { status: 401 }))
  const p = new AnthropicProvider()
  await expect(p.complete([{ role: 'user', content: 'x' }], [], OPTS)).rejects.toSatisfy(
    (e: Error) => e instanceof ProviderAuthError && !e.message.includes('SECRET123'))
})

it('redacted() scrubs every occurrence and tolerates a null key', () => {
  expect(redacted('a sk-x b sk-x', 'sk-x')).toBe('a **** b ****')
  expect(redacted('untouched', null)).toBe('untouched')
})

it('scrubs the key even when fetch() itself throws (network/DNS/invalid-header failure)', async () => {
  fetchMock.mockRejectedValue(new Error('connect failed for key sk-ant-SECRET123'))
  const p = new AnthropicProvider()
  await expect(p.complete([{ role: 'user', content: 'x' }], [], OPTS)).rejects.toSatisfy(
    (e: Error) => !e.message.includes('SECRET123'))
})

it('scrubs the key even when res.json() itself throws (malformed 200 body)', async () => {
  // A real JSON.parse SyntaxError never embeds the body text, so it can't demonstrate a leak on
  // its own — mock the minimal Response shape the adapter reads (.ok, .json()) with a rejection
  // whose message carries the key, proving the wrapper scrubs *any* throw out of res.json(), not
  // just the two explicit `throw`s.
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: () => Promise.reject(new Error('parse failed near sk-ant-SECRET123')) })
  const p = new AnthropicProvider()
  await expect(p.complete([{ role: 'user', content: 'x' }], [], OPTS)).rejects.toSatisfy(
    (e: Error) => !e.message.includes('SECRET123'))
})

it('preserves AbortError identity so the caller can distinguish an abort from a generic failure', async () => {
  const abortErr = new DOMException('The operation was aborted.', 'AbortError')
  fetchMock.mockRejectedValue(abortErr)
  const p = new AnthropicProvider()
  await expect(p.complete([{ role: 'user', content: 'x' }], [], OPTS)).rejects.toSatisfy(
    (e: Error) => e.name === 'AbortError')
})

it('still throws ProviderAuthError on 401 after the redaction wrapper (regression guard)', async () => {
  fetchMock.mockResolvedValue(new Response('bad key sk-ant-SECRET123', { status: 401 }))
  const p = new AnthropicProvider()
  await expect(p.complete([{ role: 'user', content: 'x' }], [], OPTS)).rejects.toSatisfy(
    (e: Error) => e instanceof ProviderAuthError && !e.message.includes('SECRET123'))
})

it('does not throw when a 200 response has a malformed non-array content field', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ content: { not: 'an array' } }), { status: 200 }))
  const p = new AnthropicProvider()
  const r = await p.complete([{ role: 'user', content: 'x' }], [], OPTS)
  expect(r).toEqual({ text: '', toolCalls: [] })
})
