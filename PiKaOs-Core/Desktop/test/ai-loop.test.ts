import { it, expect, vi } from 'vitest'
import { runLoop, AiEvent, LoopDeps } from '../src/main/ai/loop'
import type { CompleteResult } from '../src/main/ai/providers/types'
import type { CatalogTool } from '../src/main/ai/toolClient'

const TOOL: CatalogTool = { name: 'pikaos.plugins.list', description: '', input_schema: {}, effect: 'read' }
const DANGER: CatalogTool = { name: 'pikaos.plugins.install', description: '', input_schema: {}, effect: 'side_effect' }

// provider that plays a script: each entry is one complete() result
const scripted = (script: CompleteResult[]) => {
  let i = 0
  return { complete: vi.fn(async () => script[Math.min(i++, script.length - 1)]) }
}
const deps = (over: Partial<LoopDeps> = {}): LoopDeps & { events: AiEvent[] } => {
  const events: AiEvent[] = []
  return {
    provider: scripted([{ text: 'hi', toolCalls: [] }]),
    tools: { list: async () => [TOOL, DANGER], call: vi.fn(async () => ({ status: 200, result: { ok: 1 } })) },
    confirm: vi.fn(async () => true),
    onEvent: (ev) => events.push(ev),
    events,
    ...over,
  } as any
}
const OPTS = { model: 'm', apiKey: null, maxSteps: 5, signal: new AbortController().signal }
const USER = [{ role: 'user' as const, content: 'go' }]

it('happy path: think → tool → think → final text', async () => {
  const d = deps({ provider: scripted([
    { text: '', toolCalls: [{ id: '1', name: 'pikaos.plugins.list', arguments: {} }] },
    { text: 'answer', toolCalls: [] },
  ]) })
  const r = await runLoop(USER, OPTS, d)
  expect(r).toEqual({ text: 'answer', truncated: false })
  expect(d.tools.call).toHaveBeenCalledWith('pikaos.plugins.list', {})
  // the tool result was fed back: second complete() saw 4 messages (user, assistant, tool, →)
  const second = (d.provider.complete as any).mock.calls[1][0]
  expect(second.some((m: any) => m.role === 'tool')).toBe(true)
})

it('unknown tool name from the model → fed back as an error result, no crash, no call()', async () => {
  const d = deps({ provider: scripted([
    { text: '', toolCalls: [{ id: '1', name: 'not.in.catalog', arguments: {} }] },
    { text: 'ok', toolCalls: [] },
  ]) })
  const r = await runLoop(USER, OPTS, d)
  expect(r.text).toBe('ok')
  expect(d.tools.call).not.toHaveBeenCalled()
})

it('403 from call() is fed back as data, loop continues', async () => {
  const d = deps({
    provider: scripted([
      { text: '', toolCalls: [{ id: '1', name: 'pikaos.plugins.list', arguments: {} }] },
      { text: 'degraded answer', toolCalls: [] },
    ]),
    tools: { list: async () => [TOOL], call: vi.fn(async () => ({ status: 403, result: { detail: 'forbidden' } })) },
  })
  expect((await runLoop(USER, OPTS, d)).text).toBe('degraded answer')
})

it('consent declined → tool NOT called, decline fed back, loop continues', async () => {
  const d = deps({
    provider: scripted([
      { text: '', toolCalls: [{ id: '1', name: 'pikaos.plugins.install', arguments: {} }] },
      { text: 'understood', toolCalls: [] },
    ]),
    confirm: vi.fn(async () => false),
  })
  const r = await runLoop(USER, OPTS, d)
  expect(r.text).toBe('understood')
  expect(d.tools.call).not.toHaveBeenCalled()
  expect(d.events.some(e => e.type === 'consent')).toBe(true)
})

it('maxSteps exhausted → truncated:true with whatever text exists', async () => {
  const d = deps({ provider: scripted([{ text: '', toolCalls: [{ id: '1', name: 'pikaos.plugins.list', arguments: {} }] }]) })
  const r = await runLoop(USER, { ...OPTS, maxSteps: 3 }, d)
  expect(r.truncated).toBe(true)
  expect(d.provider.complete).toHaveBeenCalledTimes(3)
})

it('abort mid-run rejects and emits no done event', async () => {
  const ctl = new AbortController()
  const d = deps({ provider: { complete: vi.fn(() => { ctl.abort(); return Promise.reject(new DOMException('aborted', 'AbortError')) }) } as any })
  await expect(runLoop(USER, { ...OPTS, signal: ctl.signal }, d)).rejects.toThrow()
  expect(d.events.some(e => e.type === 'done')).toBe(false)
})
