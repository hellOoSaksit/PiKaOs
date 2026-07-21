// Same fake-electron style as ipc-origin.test.ts / window.test.ts.
import { it, expect, vi, beforeEach, afterEach } from 'vitest'

const handlers = new Map<string, Function>()
vi.mock('electron', () => ({
  ipcMain: { handle: (ch: string, fn: Function) => handlers.set(ch, fn) },
  app: { getPath: () => tmp },
  dialog: { showMessageBox: vi.fn(async () => ({ response: 1 })) },
}))
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
let tmp: string

const okEvent = { senderFrame: { url: 'app://pikaos/index.html' }, sender: { send: vi.fn() } } as any
const evilEvent = { senderFrame: { url: 'app://pikaosevil/index.html' }, sender: { send: vi.fn() } } as any

const vault = { store: new Map<string, string>(), get(k: string) { return this.store.get(k) ?? null }, set(k: string, v: string) { this.store.set(k, v) }, delete(k: string) { this.store.delete(k) } }

beforeEach(async () => {
  tmp = mkdtempSync(join(tmpdir(), 'ai-ipc-'))
  handlers.clear(); vault.store.clear()
  const { registerAiIpc } = await import('../src/main/ai/ipc')
  registerAiIpc({ vault: vault as any, broker: { getAccessToken: async () => null } as any })
})

it('registers exactly the six ai channels — and NO ai:getKey', () => {
  const ai = [...handlers.keys()].filter(c => c.startsWith('ai:')).sort()
  expect(ai).toEqual(['ai:chat', 'ai:clearKey', 'ai:getConfig', 'ai:setConfig', 'ai:setKey', 'ai:stop'])
  expect(handlers.has('ai:getKey')).toBe(false)   // the invariant, pinned (spec §4.1)
})

it('ai:setKey writes the namespaced vault key; getConfig reports hasKey but never the value', async () => {
  await handlers.get('ai:setKey')!(okEvent, { provider: 'anthropic', apiKey: 'sk-ant-X' })
  expect(vault.get('ai.anthropic.apiKey')).toBe('sk-ant-X')
  const cfg = await handlers.get('ai:getConfig')!(okEvent)
  expect(cfg.hasKey).toBe(true)
  expect(JSON.stringify(cfg)).not.toContain('sk-ant-X')
})

it('ai:getConfig surfaces mode + baseUrl (never a key value)', async () => {
  const cfg = await handlers.get('ai:getConfig')!(okEvent)
  expect(cfg.mode).toBe('byo-key')
  expect(cfg.baseUrl).toBe(null)
  expect(typeof cfg.model).toBe('string')
  expect('apiKey' in cfg).toBe(false)
})

it('zod rejects malformed payloads at the edge', async () => {
  await expect(handlers.get('ai:setKey')!(okEvent, { provider: 'evil', apiKey: 'x' })).rejects.toThrow()
  await expect(handlers.get('ai:setConfig')!(okEvent, { maxSteps: 999 })).rejects.toThrow()
  await expect(handlers.get('ai:chat')!(okEvent, { messages: [] })).rejects.toThrow()
})

it('foreign sender origin is rejected on every channel', async () => {
  for (const ch of ['ai:setKey', 'ai:chat', 'ai:getConfig']) {
    await expect(handlers.get(ch)!(evilEvent, { provider: 'anthropic', apiKey: 'k', messages: [{ role: 'user', content: 'x' }] }))
      .rejects.toThrow(/forbidden sender/)
  }
})

it('ai:chat while a run is active rejects with busy', async () => {
  // never-resolving provider keeps the first run active
  vi.doMock('../src/main/ai/loop', () => ({ runLoop: () => new Promise(() => {}) }))
  vi.resetModules()
  const { registerAiIpc } = await import('../src/main/ai/ipc')
  handlers.clear()
  registerAiIpc({ vault: vault as any, broker: { getAccessToken: async () => null } as any })
  const first = handlers.get('ai:chat')!(okEvent, { messages: [{ role: 'user', content: 'a' }] })
  await expect(handlers.get('ai:chat')!(okEvent, { messages: [{ role: 'user', content: 'b' }] })).rejects.toThrow(/busy/)
  void first
})

// --- admin mode / resolveRuntime -----------------------------------------------------------
// resolveRuntime is the seam that decides where provider/model/baseUrl/apiKey come from: the
// local vault (byo-key) or the server's LLM connection registry (admin). These tests pin the
// two security invariants — admin never touches the local vault, and a permission failure is a
// hard error, never a silent downgrade to byo-key.

afterEach(() => { vi.unstubAllGlobals() })

const spyVault = () => ({ get: vi.fn(() => null), set: vi.fn(), delete: vi.fn() })
const brokerWith = (token: string | null) => ({ getAccessToken: async () => token } as any)

it('admin mode reads /ai/llm/connections and never touches the vault', async () => {
  const { resolveRuntime } = await import('../src/main/ai/ipc')
  const fetchMock = vi.fn(async () => ({
    ok: true, status: 200,
    json: async () => ({ connections: [{ provider: 'anthropic', model: 'claude-x', base_url: 'https://srv.example/v1' }] }),
  })) as any
  vi.stubGlobal('fetch', fetchMock)
  const v = spyVault()
  const cfg = { mode: 'admin', provider: 'ollama', model: 'llama3.3', baseUrl: null, maxSteps: 15 } as any
  const rt = await resolveRuntime(cfg, brokerWith('tkn'), 'http://127.0.0.1:8000/api', v as any)
  expect(rt).toEqual({ provider: 'anthropic', model: 'claude-x', baseUrl: 'https://srv.example/v1', apiKey: null })
  expect(v.get).not.toHaveBeenCalled()                       // admin never reads the local vault
  expect(fetchMock.mock.calls[0][0]).toContain('/ai/llm/connections')
})

it('admin mode surfaces a missing llm.view (403) as an error — no silent byo-key fallback', async () => {
  const { resolveRuntime } = await import('../src/main/ai/ipc')
  const v = spyVault()
  for (const status of [403, 404]) {
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status, json: async () => ({}) })) as any)
    const cfg = { mode: 'admin', provider: 'ollama', model: 'llama3.3', baseUrl: null, maxSteps: 15 } as any
    await expect(resolveRuntime(cfg, brokerWith('tkn'), 'http://127.0.0.1:8000/api', v as any)).rejects.toThrow()
    expect(v.get).not.toHaveBeenCalled()                     // did not fall back to reading a key
  }
})

it('byo-key mode reads the vault and never calls /ai/llm/connections', async () => {
  const { resolveRuntime } = await import('../src/main/ai/ipc')
  const fetchMock = vi.fn(async () => { throw new Error('should not fetch') }) as any
  vi.stubGlobal('fetch', fetchMock)
  const v = spyVault()
  v.get.mockReturnValue('sk-ant-Y')
  const cfg = { mode: 'byo-key', provider: 'anthropic', model: 'claude-sonnet-5', baseUrl: null, maxSteps: 15 } as any
  const rt = await resolveRuntime(cfg, brokerWith(null), 'http://127.0.0.1:8000/api', v as any)
  expect(rt).toEqual({ provider: 'anthropic', model: 'claude-sonnet-5', baseUrl: null, apiKey: 'sk-ant-Y' })
  expect(v.get).toHaveBeenCalledWith('ai.anthropic.apiKey')
  expect(fetchMock).not.toHaveBeenCalled()                   // byo-key never contacts the server registry
})

it('byo-key ollama needs no key and no vault read', async () => {
  const { resolveRuntime } = await import('../src/main/ai/ipc')
  const v = spyVault()
  const cfg = { mode: 'byo-key', provider: 'ollama', model: 'llama3.3', baseUrl: null, maxSteps: 15 } as any
  const rt = await resolveRuntime(cfg, brokerWith(null), 'http://127.0.0.1:8000/api', v as any)
  expect(rt.apiKey).toBe(null)
  expect(v.get).not.toHaveBeenCalled()
})

it('accepts the custom provider in setConfig and getConfig reports it', async () => {
  await handlers.get('ai:setConfig')!(okEvent, { provider: 'custom', baseUrl: 'http://localhost:1234/v1/chat/completions' })
  const cfg = await handlers.get('ai:getConfig')!(okEvent)
  expect(cfg.provider).toBe('custom')
  expect(cfg.baseUrl).toBe('http://localhost:1234/v1/chat/completions')
})

it('resolveRuntime: custom byo-key returns the cfg baseUrl + (optional) vault key, no /ai/llm/connections fetch', async () => {
  const { resolveRuntime } = await import('../src/main/ai/ipc')
  const fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
  const cfg = { mode: 'byo-key', provider: 'custom', model: 'local-model', baseUrl: 'http://127.0.0.1:1234/v1/chat/completions', maxSteps: 15 } as any
  const rt = await resolveRuntime(cfg, { getAccessToken: async () => null } as any, 'http://x/api', { get: () => null } as any)
  expect(rt).toEqual({ provider: 'custom', model: 'local-model', baseUrl: 'http://127.0.0.1:1234/v1/chat/completions', apiKey: null })
  expect(fetchSpy).not.toHaveBeenCalled()
})

// --- ai:chat custom-provider guards ---------------------------------------------------------
// custom is the local OpenAI-compatible runtime: keyless (no "no key set" guard applies) but a
// baseUrl is mandatory (it IS the whole request URL — without it the OpenAI adapter would silently
// hit api.openai.com). Both branches live in the ai:chat handler itself, not resolveRuntime, so
// they need coverage at the ai:chat entry point.

it('ai:chat: custom provider with a baseUrl but no stored key reaches runLoop (keyless, not "no key set")', async () => {
  vi.doMock('../src/main/ai/loop', () => ({ runLoop: vi.fn(async () => ({ text: 'ok', truncated: false })) }))
  vi.resetModules()
  const { registerAiIpc } = await import('../src/main/ai/ipc')
  handlers.clear()
  registerAiIpc({ vault: vault as any, broker: { getAccessToken: async () => null } as any })
  await handlers.get('ai:setConfig')!(okEvent, { provider: 'custom', model: 'local-model', baseUrl: 'http://127.0.0.1:1234/v1/chat/completions' })
  expect(vault.get('ai.custom.apiKey')).toBe(null)   // no ai:setKey call — genuinely keyless
  const result = await handlers.get('ai:chat')!(okEvent, { messages: [{ role: 'user', content: 'hi' }] })
  expect(result).toEqual({ text: 'ok', truncated: false })
})

it('ai:chat: custom provider without a baseUrl rejects with the endpoint error (before runLoop)', async () => {
  vi.doMock('../src/main/ai/loop', () => ({ runLoop: vi.fn(async () => ({ text: 'unreachable', truncated: false })) }))
  vi.resetModules()
  const { registerAiIpc } = await import('../src/main/ai/ipc')
  handlers.clear()
  registerAiIpc({ vault: vault as any, broker: { getAccessToken: async () => null } as any })
  await handlers.get('ai:setConfig')!(okEvent, { provider: 'custom' })
  const cfg = await handlers.get('ai:getConfig')!(okEvent)
  expect(cfg.baseUrl).toBe(null)   // never set — this is what triggers the guard
  await expect(handlers.get('ai:chat')!(okEvent, { messages: [{ role: 'user', content: 'hi' }] }))
    .rejects.toThrow(/endpoint/)
})
