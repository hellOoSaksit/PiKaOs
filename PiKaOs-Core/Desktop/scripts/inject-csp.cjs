'use strict'

const fs = require('node:fs')
const path = require('node:path')

// Mandatory hardening (spec §9) — the bundled renderer must ship a CSP. Packaging copies
// Frontend/dist via extraResources (electron-builder.yml: `../Frontend/dist` -> `frontend`),
// so index.html can't get the tag at Frontend build time; this afterPack hook rewrites the
// COPIED index.html in the packaged app instead. Verbatim from the spec (do not widen):
//   - connect-src needs http(s) 127.0.0.1/localhost — the default backend is loopback http (F4).
//   - worker-src 'self' blob: — three.js workers.
// If DevTools later reports a violation from a remote-loaded stylesheet/font, bundle the asset
// into Frontend instead of loosening this policy.
const CSP_CONTENT =
  "default-src 'self' app://pikaos; connect-src app://pikaos https: http://127.0.0.1:* http://localhost:*; " +
  "img-src 'self' app://pikaos data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self'; worker-src 'self' blob:"

const CSP_TAG = `<meta http-equiv="Content-Security-Policy" content="${CSP_CONTENT}">`

/** @param {import('electron-builder').AfterPackContext} context */
module.exports = async function injectCsp(context) {
  const resourcesDir = context.packager.getResourcesDir(context.appOutDir)
  const indexPath = path.join(resourcesDir, 'frontend', 'index.html')

  if (!fs.existsSync(indexPath)) {
    throw new Error(`[inject-csp] packaged index.html not found at ${indexPath}`)
  }

  const html = fs.readFileSync(indexPath, 'utf8')
  if (html.includes('Content-Security-Policy')) return // already injected (re-run / multi-arch pack)

  const headOpenTag = /<head[^>]*>/i
  if (!headOpenTag.test(html)) {
    throw new Error(`[inject-csp] no <head> tag found in ${indexPath}`)
  }

  // First element inside <head> so the policy covers every subsequent tag.
  const patched = html.replace(headOpenTag, (match) => `${match}\n    ${CSP_TAG}`)
  fs.writeFileSync(indexPath, patched, 'utf8')
}
