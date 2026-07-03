import { protocol, net } from 'electron'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

// Must run at module load, before app 'ready' — registerSchemesAsPrivileged is a no-op afterward.
protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
])

// Serves the bundled Frontend/dist (prod) as app://pikaos/<path>. Call after app 'ready',
// before createWindow() so the renderer never race-loads an unhandled scheme.
export function registerAppProtocol(distDir: string) {
  protocol.handle('app', (req) => {
    const url = new URL(req.url) // app://pikaos/<path>
    // Only serve the canonical host — a request to app://pikaosevil.com is a different origin
    // and must not receive the app's files (defense-in-depth alongside the nav-lock).
    if (url.host !== 'pikaos') return new Response('forbidden', { status: 403 })
    const rel = url.pathname === '/' ? '/index.html' : url.pathname
    const filePath = join(distDir, rel)
    if (!filePath.startsWith(distDir)) return new Response('forbidden', { status: 403 }) // traversal guard
    return net.fetch(pathToFileURL(filePath).toString())
      .catch(() => net.fetch(pathToFileURL(join(distDir, 'index.html')).toString())) // SPA fallback
  })
}
