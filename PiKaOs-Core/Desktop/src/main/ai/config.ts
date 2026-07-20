// Same file-per-concern pattern as backend.json (config.ts) — corrupt file degrades to defaults,
// never throws out of a read path.
import { app } from 'electron'
import { join } from 'node:path'
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

export type AiProviderName = 'anthropic' | 'openai' | 'ollama'
export type AiMode = 'byo-key' | 'admin'
// `baseUrl: null` = "let the adapter use its own default" (ollama.ts keeps 127.0.0.1:11434 as
// that default; nothing else hardcodes an endpoint). `admin` mode overwrites it from the server.
export type AiConfig = { mode: AiMode; provider: AiProviderName; model: string; baseUrl: string | null; maxSteps: number }

// Verified current on 2026-07-20 (Task 6 Step 0, rule 8): claude-sonnet-5 is this project's
// naming; gpt-5.1 remains a documented, stable OpenAI API model (newer 5.6 tiers exist but 5.1
// is not deprecated/EOL); llama3.3:latest is the current Ollama tag.
export const DEFAULT_MODELS: Record<AiProviderName, string> = {
  anthropic: 'claude-sonnet-5',
  openai: 'gpt-5.1',
  ollama: 'llama3.3',
}
// Default = the keyless local runtime, so a fresh install can chat without a key or a server.
const DEFAULT: AiConfig = { mode: 'byo-key', provider: 'ollama', model: DEFAULT_MODELS.ollama, baseUrl: null, maxSteps: 15 }

const path = () => join(app.getPath('userData'), 'ai.json')

export function getAiConfig(): AiConfig {
  if (!existsSync(path())) return DEFAULT
  try {
    const p = JSON.parse(readFileSync(path(), 'utf8'))
    if (p && (p.provider === 'anthropic' || p.provider === 'openai' || p.provider === 'ollama')
      && typeof p.model === 'string' && Number.isInteger(p.maxSteps)) {
      // Normalize forward-compat fields: an older ai.json (pre-mode/baseUrl) is a valid file that
      // simply degrades to the safe defaults for the new keys rather than being discarded.
      return {
        mode: p.mode === 'admin' ? 'admin' : 'byo-key',
        provider: p.provider,
        model: p.model,
        baseUrl: typeof p.baseUrl === 'string' ? p.baseUrl : null,
        maxSteps: p.maxSteps,
      }
    }
  } catch { /* fall through */ }
  return DEFAULT
}

export function setAiConfig(patch: Partial<AiConfig>): AiConfig {
  const next = { ...getAiConfig(), ...patch }
  if (patch.provider && !patch.model) next.model = DEFAULT_MODELS[patch.provider]  // provider switch resets the model default
  writeFileSync(path(), JSON.stringify(next))
  return next
}
