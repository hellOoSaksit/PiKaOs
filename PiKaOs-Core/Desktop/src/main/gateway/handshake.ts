import { randomBytes } from 'node:crypto'
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'
import { SHIM_FLAG } from '../shim-mode'

export type Handshake = { pipe: string; token: string }

const FILE = 'gateway.json'

// Rotated every launch. The client's config points at the FILE, never at the token, so a config a
// user pasted once keeps working while every token dies with the app — and no token is ever copied
// into another application's config file, where people paste configs around.
export function writeHandshake(userDataDir: string): { handshake: Handshake; path: string } {
  const id = randomBytes(8).toString('hex')
  const handshake: Handshake = {
    pipe: process.platform === 'win32'
      ? `\\\\.\\pipe\\pikaos-mcp-${id}`
      : join(userDataDir, `pikaos-mcp-${id}.sock`),
    token: randomBytes(32).toString('hex'),
  }
  const path = join(userDataDir, FILE)
  // POSIX open() only applies `mode` when it CREATES the file — on an overwrite of an
  // existing path the mode argument is silently ignored and the file keeps whatever
  // permissions it already had. gateway.json is written to the same path on every
  // launch, so every write after the first is an overwrite. Unlinking first forces the
  // write down the create path every time, so 0o600 always takes effect — even if the
  // file was left group/world-readable by an older build, a manual chmod, or a backup
  // tool, and even though the new content is a fresh token.
  //
  // This only matters on POSIX: `mode` bits are a POSIX permission concept, so on
  // Windows the unlink buys nothing. There it only adds risk — deleting a file needs
  // more privilege than overwriting one, and if an AV scanner, the search indexer, or a
  // backup agent has gateway.json open without FILE_SHARE_DELETE at that instant,
  // unlinkSync throws EBUSY/EPERM (not ENOENT, so the guard below rethrows it) and
  // startup fails for no security benefit. So skip the unlink on win32 and overwrite in
  // place, exactly as before this fix.
  //
  // Trade-off accepted on POSIX: a crash between the unlink and the write below leaves
  // gateway.json absent rather than stale. That's intentional — an absent file fails
  // cleanly on the next readHandshake, whereas a stale file would hand out a dead token.
  if (process.platform !== 'win32') {
    try {
      unlinkSync(path)
    } catch (err) {
      if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') throw err
    }
  }
  writeFileSync(path, JSON.stringify(handshake), { mode: 0o600 })
  return { handshake, path }
}

export function readHandshake(path: string): Handshake {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<Handshake> | null
  if (raw === null || typeof raw !== 'object' || typeof raw.pipe !== 'string' || typeof raw.token !== 'string') {
    throw new Error('gateway handshake file is malformed')
  }
  return { pipe: raw.pipe, token: raw.token }
}

// `shimPath` dropped from the signature: there is no second file to point at any more. Claude
// Desktop spawns the packaged APP BINARY itself and the flag tells that same process to run the
// shim instead of opening a window (see the argv branch in main/index.ts). ELECTRON_RUN_AS_NODE
// is gone too — electron-builder.yml turns the runAsNode fuse OFF (spec §9 hardening), so in a
// packaged build that env var is silently ignored and the binary boots the GUI instead of plain
// Node, leaving Claude Desktop talking to a process that never speaks MCP. The flag works because
// it is read by the SAME binary Claude Desktop already spawned, fuse or no fuse.
export function configSnippet(execPath: string, handshakePath: string): string {
  return JSON.stringify({
    mcpServers: {
      pikaos: {
        command: execPath,
        args: [SHIM_FLAG, '--handshake', handshakePath],
      },
    },
  }, null, 2)
}
