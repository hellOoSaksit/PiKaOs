// The command-line flag Claude Desktop passes on the packaged APP BINARY's own command line (see
// configSnippet() in gateway/handshake.ts) to make an ordinary launch run the MCP shim over stdio
// instead of opening a window — see the argv branch in index.ts for why this replaced spawning the
// binary as plain Node. Chromium/Electron switches are either bare words (--no-sandbox,
// --disable-gpu, ...) or namespaced under a small reserved set (--remote-debugging-*,
// --enable-features, ...); nothing there collides with a "pikaos"-prefixed flag, and this string is
// never used anywhere else in the app.
export const SHIM_FLAG = '--pikaos-mcp-shim'

// Pure so it can be unit-tested without pulling in Electron — same style as isAllowedNavigation in
// window.ts and resolveSpawn in mcp/spawn-resolver.ts.
export function isShimMode(argv: string[]): boolean {
  return argv.includes(SHIM_FLAG)
}
