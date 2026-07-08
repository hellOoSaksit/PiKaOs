import { it, expect, vi, beforeEach } from 'vitest'
import { OpenAiProvider } from '../src/main/ai/providers/openai'
import { OllamaProvider } from '../src/main/ai/providers/ollama'
import { ProviderAuthError } from '../src/main/ai/providers/types'

const fetchMock = vi.fn()
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock) })
const SIG = new AbortController().signal

it('openai: maps tools to function-format and parses JSON-string arguments', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({
    choices: [{ message: { content: null, tool_calls: [{ id: 'c1', function: { name: 'pikaos.plugins.list', arguments: '{"x":2}' } }] } }],
  }), { status: 200 }))
  const r = await new OpenAiProvider().complete(
    [{ role: 'user', content: 'hi' }],
    [{ name: 'pikaos.plugins.list', description: 'd', inputSchema: { type: 'object' } }],
    { model: 'gpt-x', apiKey: 'sk-OPENAI', signal: SIG })
  expect(r.toolCalls).toEqual([{ id: 'c1', name: 'pikaos.plugins.list', arguments: { x: 2 } }])
  const [url, init] = fetchMock.mock.calls[0]
  expect(String(url)).toBe('https://api.openai.com/v1/chat/completions')
  expect(init.headers.authorization).toBe('Bearer sk-OPENAI')
  expect(JSON.parse(init.body).tools[0]).toEqual({ type: 'function', function: { name: 'pikaos.plugins.list', description: 'd', parameters: { type: 'object' } } })
})

it('openai: tool result goes back as role:tool with tool_call_id; 401 → ProviderAuthError scrubbed', async () => {
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({ choices: [{ message: { content: 'ok' } }] }), { status: 200 }))
  await new OpenAiProvider().complete([
    { role: 'assistant', content: '', toolCalls: [{ id: 'c1', name: 't', arguments: {} }] },
    { role: 'tool', toolCallId: 'c1', name: 't', content: 'r' },
  ], [], { model: 'm', apiKey: 'k', signal: SIG })
  const body = JSON.parse(fetchMock.mock.calls[0][1].body)
  expect(body.messages[1]).toEqual({ role: 'tool', tool_call_id: 'c1', content: 'r' })

  fetchMock.mockResolvedValueOnce(new Response('denied sk-OPENAI', { status: 401 }))
  await expect(new OpenAiProvider().complete([{ role: 'user', content: 'x' }], [], { model: 'm', apiKey: 'sk-OPENAI', signal: SIG }))
    .rejects.toSatisfy((e: Error) => e instanceof ProviderAuthError && !e.message.includes('sk-OPENAI'))
})

it('openai: scrubs the key even when fetch() itself throws (network/DNS/invalid-header failure)', async () => {
  fetchMock.mockRejectedValue(new Error('connect failed for key sk-OPENAI-SECRET'))
  await expect(new OpenAiProvider().complete([{ role: 'user', content: 'x' }], [], { model: 'm', apiKey: 'sk-OPENAI-SECRET', signal: SIG }))
    .rejects.toSatisfy((e: Error) => !e.message.includes('sk-OPENAI-SECRET'))
})

it('ollama: keyless, posts to /api/chat with stream:false, object arguments pass through', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({
    message: { content: '', tool_calls: [{ function: { name: 'f', arguments: { y: 3 } } }] },
  }), { status: 200 }))
  const r = await new OllamaProvider().complete([{ role: 'user', content: 'hi' }], [], { model: 'llama3.3', apiKey: null, signal: SIG })
  expect(r.toolCalls[0]).toMatchObject({ name: 'f', arguments: { y: 3 } })   // id synthesized
  const [url, init] = fetchMock.mock.calls[0]
  expect(String(url)).toBe('http://127.0.0.1:11434/api/chat')
  expect(JSON.parse(init.body).stream).toBe(false)
  expect(init.headers.authorization).toBeUndefined()
})
