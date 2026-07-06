import { it, expect, beforeEach, afterEach } from 'vitest'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Task 12 Step 3 — the packaged renderer only gets its CSP by rewriting the extraResources
// copy of index.html (Frontend/dist has no CSP tag at build time). This exercises the
// afterPack hook against a throwaway "appOutDir" so it never touches the real Frontend/dist.
async function loadInjectCsp() {
  const mod: any = await import('../scripts/inject-csp.cjs')
  return (mod.default ?? mod) as (context: unknown) => Promise<void>
}

let appOutDir: string

function fakeContext(outDir: string) {
  return { appOutDir: outDir, packager: { getResourcesDir: (dir: string) => join(dir, 'resources') } }
}

beforeEach(() => {
  appOutDir = mkdtempSync(join(tmpdir(), 'inject-csp-test-'))
  mkdirSync(join(appOutDir, 'resources', 'frontend'), { recursive: true })
})
afterEach(() => {
  rmSync(appOutDir, { recursive: true, force: true })
})

const sampleHtml = `<!DOCTYPE html>
<html lang="th" data-theme="pro">
  <head>
    <meta charset="UTF-8" />
    <script type="module" crossorigin src="/assets/index.js"></script>
  </head>
  <body><div id="root"></div></body>
</html>
`

it('injects the exact CSP meta tag as the first element inside <head>', async () => {
  const indexPath = join(appOutDir, 'resources', 'frontend', 'index.html')
  writeFileSync(indexPath, sampleHtml, 'utf8')

  await (await loadInjectCsp())(fakeContext(appOutDir))

  const patched = readFileSync(indexPath, 'utf8')
  expect(patched).toContain(
    '<meta http-equiv="Content-Security-Policy" content="default-src \'self\' app://pikaos; ' +
      "connect-src app://pikaos https: http:; img-src 'self' app://pikaos data: blob:; " +
      "style-src 'self' 'unsafe-inline'; script-src 'self'; worker-src 'self' blob:\">",
  )
  // must precede everything else that was already in <head>
  expect(patched.indexOf('Content-Security-Policy')).toBeLessThan(patched.indexOf('<script'))
})

it('is idempotent — running twice does not duplicate the tag', async () => {
  const indexPath = join(appOutDir, 'resources', 'frontend', 'index.html')
  writeFileSync(indexPath, sampleHtml, 'utf8')

  await (await loadInjectCsp())(fakeContext(appOutDir))
  await (await loadInjectCsp())(fakeContext(appOutDir))

  const patched = readFileSync(indexPath, 'utf8')
  expect(patched.split('Content-Security-Policy').length - 1).toBe(1)
})

it('throws when the packaged index.html is missing', async () => {
  const injectCsp = await loadInjectCsp()
  await expect(injectCsp(fakeContext(appOutDir))).rejects.toThrow(/index\.html not found/)
})

it('throws when index.html has no <head> tag', async () => {
  const indexPath = join(appOutDir, 'resources', 'frontend', 'index.html')
  writeFileSync(indexPath, '<html><body>no head here</body></html>', 'utf8')

  const injectCsp = await loadInjectCsp()
  await expect(injectCsp(fakeContext(appOutDir))).rejects.toThrow(/no <head> tag/)
})
