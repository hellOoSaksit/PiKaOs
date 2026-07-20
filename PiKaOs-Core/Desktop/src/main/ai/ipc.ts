// Every payload zod-parsed at the edge (rule 10) — the class-level fix mcp:add lacks (its
// validation is a comment). No ai:getKey exists; ai-ipc.test.ts pins that.
import { ipcMain, IpcMainInvokeEvent, app } from 'electron'
import { join } from 'node:path'
import { z } from 'zod'
import type { SecretVault } from '../vault'
import type { SessionBroker } from '../session-broker'
import { okOrigin } from '../ipc'
import { getBackendConfig } from '../config'
import { getAiConfig, setAiConfig, AiConfig, AiProviderName } from './config'
import { runLoop, AiEvent } from './loop'
import { ToolClient, CatalogTool } from './toolClient'
import { makeConsent } from '../consent/gate'
import { AnthropicProvider } from './providers/anthropic'
import { OpenAiProvider } from './providers/openai'
import { OllamaProvider } from './providers/ollama'
import { ProviderAuthError, LlmProvider } from './providers/types'

const Provider = z.enum(['anthropic', 'openai', 'ollama'])
const SetKey = z.strictObject({ provider: Provider, apiKey: z.string().min(1).max(4096) })
const ClearKey = z.strictObject({ provider: Provider })
const SetConfig = z.strictObject({
  mode: z.enum(['byo-key', 'admin']).optional(),
  provider: Provider.optional(),
  model: z.string().min(1).max(200).optional(),
  // null = reset to the adapter's own default; a set value must be a real URL, capped so a
  // hostile renderer can't stuff megabytes through the edge.
  baseUrl: z.string().url().max(2048).nullable().optional(),
  maxSteps: z.number().int().min(1).max(50).optional(),
})
const Chat = z.strictObject({
  messages: z.array(z.strictObject({
    role: z.enum(['user', 'assistant']),
    content: z.string().min(1).max(32768),
  })).min(1).max(100),
})

const PROVIDERS: Record<AiProviderName, () => LlmProvider> = {
  anthropic: () => new AnthropicProvider(),
  openai: () => new OpenAiProvider(),
  ollama: () => new OllamaProvider(),
}

// Namespaced per provider — never a bare key — so a stored AI key can never collide with or be
// mistaken for another vault secret (mirrors the mcp.<sid>.<key> convention in ipc.ts).
const keyOf = (p: string) => `ai.${p}.apiKey`

// A resolveRuntime failure is a distinct, surfaceable condition (AI plugin absent / caller lacks
// llm.view / no connection) — NOT a reason to silently downgrade to byo-key. Own class so callers
// can tell it apart from a provider/auth fault if they ever need to.
export class AdminRuntimeError extends Error {}

// The one seam that decides WHERE provider/model/baseUrl/apiKey come from. `byo-key` reads the
// local vault; `admin` fetches the server's LLM connection registry (write-only keys — the
// response never carries a key, so apiKey is null and a cloud loop would be the server's job,
// out of scope here). A 404/403 means the plugin is absent or the caller lacks `llm.view` → a
// hard, typed error, never a fall-through to byo-key.
export async function resolveRuntime(
  cfg: AiConfig,
  broker: Pick<SessionBroker, 'getAccessToken'>,
  apiBase: string,
  vault: Pick<SecretVault, 'get'>,
): Promise<{ provider: AiProviderName; model: string; baseUrl: string | null; apiKey: string | null }> {
  if (cfg.mode === 'admin') {
    const token = await broker.getAccessToken()
    const headers: Record<string, string> = { 'content-type': 'application/json' }
    if (token) headers.authorization = `Bearer ${token}`
    const res = await fetch(`${apiBase}/llm/connections`, { headers })
    if (res.status === 404 || res.status === 403) {
      throw new AdminRuntimeError(`admin runtime unavailable (/llm/connections ${res.status}): AI plugin absent or missing llm.view`)
    }
    if (!res.ok) throw new AdminRuntimeError(`admin runtime unavailable (/llm/connections ${res.status})`)
    const body = (await res.json().catch(() => null)) as { connections?: Array<{ provider?: unknown; model?: unknown; base_url?: unknown }> } | null
    const first = body?.connections?.[0]
    if (!first || typeof first.provider !== 'string' || typeof first.model !== 'string') {
      throw new AdminRuntimeError('admin runtime unavailable: no LLM connection configured on the server')
    }
    if (!(first.provider in PROVIDERS)) {
      throw new AdminRuntimeError(`admin runtime unavailable: server named an unsupported provider "${first.provider}"`)
    }
    return {
      provider: first.provider as AiProviderName,
      model: first.model,
      baseUrl: typeof first.base_url === 'string' ? first.base_url : null,
      apiKey: null,
    }
  }
  // byo-key: the key lives in the local OS-encrypted vault. Ollama is keyless by design.
  const apiKey = cfg.provider === 'ollama' ? null : vault.get(keyOf(cfg.provider))
  return { provider: cfg.provider, model: cfg.model, baseUrl: cfg.baseUrl, apiKey }
}

// Async so a synchronous throw (origin reject, zod parse failure) surfaces as a REJECTED promise
// to the renderer's invoke() — not a raw throw that would escape the handle() dispatcher.
const guard = (fn: (e: IpcMainInvokeEvent, ...a: any[]) => any) =>
  async (e: IpcMainInvokeEvent, ...a: any[]) => { if (!okOrigin(e)) throw new Error('forbidden sender'); return fn(e, ...a) }

export function registerAiIpc(deps: {
  vault: SecretVault
  broker: SessionBroker
  askConsent?: (tool: CatalogTool) => Promise<boolean>   // injected by index.ts; defaults for tests
}) {
  const { vault, broker } = deps
  const confirm = makeConsent(
    join(app.getPath('userData'), 'ai-approvals.json'),
    deps.askConsent ?? (async () => false),   // no dialog wired (tests) → decline, never hang
  )

  let active: AbortController | null = null

  ipcMain.handle('ai:setKey', guard((_e, raw) => { const p = SetKey.parse(raw); vault.set(keyOf(p.provider), p.apiKey) }))
  ipcMain.handle('ai:clearKey', guard((_e, raw) => { const p = ClearKey.parse(raw); vault.delete(keyOf(p.provider)) }))
  ipcMain.handle('ai:getConfig', guard(() => {
    const cfg = getAiConfig()
    // hasKey reflects LOCAL vault state only — a boolean, never the value. Ollama is keyless.
    return { ...cfg, hasKey: cfg.provider === 'ollama' ? true : vault.get(keyOf(cfg.provider)) !== null }
  }))
  ipcMain.handle('ai:setConfig', guard((_e, raw) => setAiConfig(SetConfig.parse(raw))))
  ipcMain.handle('ai:stop', guard(() => { active?.abort(); active = null }))

  ipcMain.handle('ai:chat', guard(async (e, raw) => {
    const { messages } = Chat.parse(raw)
    if (active) throw new Error('busy: a run is already active')
    active = new AbortController()   // claim the slot synchronously, before any await (busy guard)
    const cfg = getAiConfig()
    const send = (ev: AiEvent) => { try { e.sender.send('ai:event', ev) } catch { /* window gone */ } }
    try {
      const rt = await resolveRuntime(cfg, broker, getBackendConfig().apiBaseUrl, vault)
      // Only a local BYO key can be "missing"; admin keys live server-side (apiKey stays null).
      if (cfg.mode === 'byo-key' && rt.provider !== 'ollama' && !rt.apiKey) throw new Error('no key set for provider')
      return await runLoop(
        messages.map(m => ({ role: m.role, content: m.content })) as any,
        { model: rt.model, apiKey: rt.apiKey, maxSteps: cfg.maxSteps, signal: active.signal, baseUrl: rt.baseUrl ?? undefined },
        {
          provider: PROVIDERS[rt.provider](),
          tools: new ToolClient(() => broker.getAccessToken(), () => getBackendConfig().apiBaseUrl),
          confirm,
          onEvent: send,
        },
      )
    } catch (err: any) {
      // Bad key → clear it, no retry (rule 9). Only byo-key stored one; a 5xx/network/admin fault
      // is NOT an auth failure and must never wipe a good key. Provider errors are already
      // key-redacted (withRedaction / ProviderAuthError contract), so this message is safe to emit.
      if (err instanceof ProviderAuthError && cfg.mode === 'byo-key') vault.delete(keyOf(cfg.provider))
      send({ type: 'error', message: String(err?.message ?? err) })
      throw err
    } finally {
      active = null
    }
  }))
}
