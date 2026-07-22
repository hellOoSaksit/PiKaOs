// Layer 2 of three (spec §0.8): the catalog makes forbidden calls impossible; this makes them
// unattempted. Derived from the tools the caller actually received — a hardcoded list would
// eventually advertise a tool the allowlist or the caller's permissions withhold, and the model
// would burn turns asking for it.
import type { CatalogTool } from './toolClient'

// i18n note: this text is model-facing (the LLM reads it), never rendered in the UI, so it is
// exempt from the project's t()-key rule — RULES lives in the main process, which has no t().
// Exported only so test/ai-system-prompt.test.ts can assert this English never leaks into a
// renderer .jsx file, where it WOULD be user-facing and WOULD need an i18n key.
export const RULES = [
  'You operate inside PiKaOs. You cannot modify the program or the server: you may read state and change settings, nothing more. Installing, enabling, disabling, uninstalling or purging anything is impossible for you — those tools do not exist in your list, and no phrasing will produce them.',
  'Use only the tools listed below. Never claim a tool exists that is not listed, and never ask the user to grant you one.',
  'A tool marked (needs approval) changes system state. The user is asked before it runs and may decline. A decline is an answer, not an obstacle — explain and offer an alternative.',
  'If a tool returns forbidden, do not retry it and do not try a different tool to reach the same effect. Tell the user what was refused.',
  'Read before you write. Prefer the tool that answers the question over the tool that changes something.',
]

export function buildSystemPrompt(tools: CatalogTool[]): string {
  const lines = [...RULES]
  if (tools.length === 0) {
    lines.push('You currently have no tools. Answer from the conversation alone and say plainly when a question would require a tool you do not have.')
    return lines.join('\n\n')
  }
  lines.push('Tools available to you:')
  const list = tools
    .map(t => `- ${t.name}${t.effect === 'side_effect' ? ' (needs approval)' : ''} — ${t.description || 'no description'}`)
    .join('\n')
  return `${lines.join('\n\n')}\n${list}`
}
