import { it, expect } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { buildSystemPrompt, RULES } from '../src/main/ai/systemPrompt'
import type { CatalogTool } from '../src/main/ai/toolClient'

const T = (name: string, effect: CatalogTool['effect']): CatalogTool => ({ name, description: 'd', input_schema: {}, effect })

it('names only the tools it was given and never invents one', () => {
  const p = buildSystemPrompt([T('pikaos.storage.status', 'read')])
  expect(p).toContain('pikaos.storage.status')
  expect(p).not.toContain('pikaos.plugins')
})

it('warns that side_effect tools need the user approval and may be declined', () => {
  const p = buildSystemPrompt([T('pikaos.settings.set_nav', 'side_effect')])
  expect(p).toContain('pikaos.settings.set_nav')
  expect(p.toLowerCase()).toContain('approval')
})

it('states the never-retry-forbidden rule and the no-program-modification boundary', () => {
  const p = buildSystemPrompt([T('a', 'read')])
  expect(p.toLowerCase()).toContain('do not retry')
  expect(p.toLowerCase()).toContain('cannot modify')
})

it('an empty catalog says so plainly rather than emitting a dangling list', () => {
  const p = buildSystemPrompt([])
  expect(p.toLowerCase()).toContain('no tools')
  expect(p).not.toContain('- ')
})

// i18n note (brief Step 5): RULES lives in the main process, which has no t(). The rules are
// model-facing English, not user-facing UI copy, so they're exempt from the i18n-keys rule — but
// only as long as nobody copy-pastes this English into a renderer .jsx file where it WOULD be
// user-facing and WOULD need a t() key. This test polices that boundary.
function jsxFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    if (entry === 'node_modules' || entry === 'dist') continue
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) out.push(...jsxFiles(full))
    else if (entry.endsWith('.jsx')) out.push(full)
  }
  return out
}

it('none of the main-process rule strings leak into a renderer .jsx file', () => {
  const files = jsxFiles(join(__dirname, '..', 'Frontend', 'src'))
  expect(files.length).toBeGreaterThan(0)
  for (const file of files) {
    const content = readFileSync(file, 'utf8')
    for (const rule of RULES) {
      expect(content).not.toContain(rule)
    }
  }
})
