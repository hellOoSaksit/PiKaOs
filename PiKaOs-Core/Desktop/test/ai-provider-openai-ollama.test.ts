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

// Regression for the malformed-tool_calls finding: an entry with invalid JSON in `arguments` and
// an entry missing `function` entirely must be skipped, not crash the turn — same "filter, don't
// throw" pattern anthropic.ts already applies to malformed tool_use blocks. The one well-formed
// entry must still come through.
it('openai: malformed tool_calls entries (bad JSON, missing function) are skipped, not thrown', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({
    choices: [{ message: { content: '', tool_calls: [
      { id: 'c1', function: { name: 'ok_tool', arguments: '{"x":1}' } },
      { id: 'c2', function: { name: 'bad_json', arguments: '{not valid json' } },
      { id: 'c3' },
    ] } }],
  }), { status: 200 }))
  const r = await new OpenAiProvider().complete([{ role: 'user', content: 'hi' }], [], { model: 'm', apiKey: 'k', signal: SIG })
  expect(r.toolCalls).toEqual([{ id: 'c1', name: 'ok_tool', arguments: { x: 1 } }])
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

// Regression for the Critical finding: toOllama() used to map every message to {role,content},
// dropping the assistant's tool_calls and the tool result's identity. On the loop's SECOND
// complete() call the model would see an assistant turn that appeared to say nothing, followed by
// an unlabeled result. Shape asserted here is the live-docs wire format (see task-2-report.md):
// assistant tool_calls carry only {function:{name,arguments}} (no id), and a tool result is
// {role:'tool', content, tool_name} — labeled by name, not by tool_call_id.
it('ollama: multi-turn round trip preserves the assistant tool call and labels the tool result by name', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: { content: 'The weather in Toronto is 11C.' } }), { status: 200 }))
  await new OllamaProvider().complete([
    { role: 'user', content: 'what is the weather in Toronto?' },
    { role: 'assistant', content: '', toolCalls: [{ id: 'ollama_0', name: 'get_weather', arguments: { city: 'Toronto' } }] },
    { role: 'tool', toolCallId: 'ollama_0', name: 'get_weather', content: '11 degrees celsius' },
  ], [], { model: 'llama3.2', apiKey: null, signal: SIG })
  const body = JSON.parse(fetchMock.mock.calls[0][1].body)
  expect(body.messages[1]).toEqual({
    role: 'assistant',
    content: '',
    tool_calls: [{ function: { name: 'get_weather', arguments: { city: 'Toronto' } } }],
  })
  expect(body.messages[2]).toEqual({ role: 'tool', content: '11 degrees celsius', tool_name: 'get_weather' })
})

// Regression for the id-collision finding: a per-#send() counter reset to 0 on every complete()
// call, so the same conversation's turn 1 and turn 3 could both synthesize `ollama_0`. Two
// sequential complete() calls (simulating two turns of one conversation) must not reuse an id.
it('ollama: synthesized tool-call ids do not repeat across turns of the same conversation', async () => {
  // A fresh Response per call — vitest's mockResolvedValue would hand back the SAME Response
  // instance both times, and a fetch Response body can only be read (.json()) once.
  const respond = () => new Response(JSON.stringify({
    message: { content: '', tool_calls: [{ function: { name: 'f', arguments: {} } }] },
  }), { status: 200 })
  fetchMock.mockImplementation(async () => respond())
  const provider = new OllamaProvider()
  const r1 = await provider.complete([{ role: 'user', content: 'a' }], [], { model: 'llama3.3', apiKey: null, signal: SIG })
  const r2 = await provider.complete([{ role: 'user', content: 'b' }], [], { model: 'llama3.3', apiKey: null, signal: SIG })
  expect(r1.toolCalls[0].id).not.toBe(r2.toolCalls[0].id)
})

// Regression for the malformed-tool_calls finding: ollama.ts used to type OllamaToolCall with
// required fields and dereference c.function.name directly inside .map() — a `{}` entry (missing
// `function`) throws a raw TypeError there. Because the map sits inside the single returned object
// literal, that throw rejects the whole complete() call, discarding the response text and every
// OTHER valid tool call in the same turn, not just the bad entry. Same "filter, don't throw"
// reasoning as openai.ts's parseOpenAiToolCall / anthropic.ts's tool_use filter — locally-run
// models are the most likely of the three vendors to emit a malformed call.
it('ollama: a tool_calls entry missing `function` is skipped, not thrown; text and valid siblings survive', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({
    message: { content: 'partial answer', tool_calls: [{ function: { name: 'f', arguments: { a: 1 } } }, {}] },
  }), { status: 200 }))
  const r = await new OllamaProvider().complete([{ role: 'user', content: 'hi' }], [], { model: 'llama3.3', apiKey: null, signal: SIG })
  expect(r.text).toBe('partial answer')
  expect(r.toolCalls).toHaveLength(1)
  expect(r.toolCalls[0]).toMatchObject({ name: 'f', arguments: { a: 1 } })
})

// An entry with `function` present but `name` absent doesn't throw today — it silently yields
// {id, name: undefined, arguments}, violating ToolCall.name: string for every downstream consumer.
// Must be dropped like any other malformed entry, not passed through with an undefined name.
it('ollama: an entry with `function` present but `name` missing is dropped, not emitted with name: undefined', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({
    message: { content: '', tool_calls: [{ function: { arguments: { a: 1 } } }] },
  }), { status: 200 }))
  const r = await new OllamaProvider().complete([{ role: 'user', content: 'hi' }], [], { model: 'llama3.3', apiKey: null, signal: SIG })
  expect(r.toolCalls).toEqual([])
})

// Mirrors openai.ts's exact edge-case behavior: an entry whose `arguments` is absent must still
// yield `{}`, not be discarded — an argument-less tool call is a legitimate call (e.g. a
// zero-parameter tool), and dropping it would make the loop read "the model answered with nothing."
it('ollama: an entry with a valid name but no arguments is kept, with arguments: {}', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({
    message: { content: '', tool_calls: [{ function: { name: 'no_args_tool' } }] },
  }), { status: 200 }))
  const r = await new OllamaProvider().complete([{ role: 'user', content: 'hi' }], [], { model: 'llama3.3', apiKey: null, signal: SIG })
  expect(r.toolCalls).toEqual([{ id: expect.any(String), name: 'no_args_tool', arguments: {} }])
})

// Regression for the id-counter: dropped entries must not burn a synthesized id. If they did, the
// gap would be invisible in any single call but would desync the id sequence from "one id per kept
// tool call" the moment anything (logging, a pending-call map) assumes that invariant. Verified by
// bracketing an all-malformed call between two single-valid-entry calls and checking the kept ids
// are sequential, not skipped by the 3 drops in between.
it('ollama: dropped entries do not consume a synthesized id', async () => {
  const provider = new OllamaProvider()
  const respond = (tool_calls: unknown[]) => new Response(JSON.stringify({ message: { content: '', tool_calls } }), { status: 200 })

  fetchMock.mockImplementationOnce(async () => respond([{ function: { name: 'baseline' } }]))
  const r1 = await provider.complete([{ role: 'user', content: 'a' }], [], { model: 'llama3.3', apiKey: null, signal: SIG })

  fetchMock.mockImplementationOnce(async () => respond([{}, {}, {}])) // all malformed, nothing kept
  const r2 = await provider.complete([{ role: 'user', content: 'b' }], [], { model: 'llama3.3', apiKey: null, signal: SIG })
  expect(r2.toolCalls).toEqual([])

  fetchMock.mockImplementationOnce(async () => respond([{ function: { name: 'next' } }]))
  const r3 = await provider.complete([{ role: 'user', content: 'c' }], [], { model: 'llama3.3', apiKey: null, signal: SIG })

  const baselineNum = Number(r1.toolCalls[0].id.split('_')[1])
  const nextNum = Number(r3.toolCalls[0].id.split('_')[1])
  expect(nextNum).toBe(baselineNum + 1)
})
