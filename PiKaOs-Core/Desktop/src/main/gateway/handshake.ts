import { randomBytes } from 'node:crypto'
import { writeFileSync, readFileSync, unlinkSync } from 'node:fs'
import { join } from 'node:path'

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
  try {
    unlinkSync(path)
  } catch (err) {
    if ((err as NodeJS.ErrnoException)?.code !== 'ENOENT') throw err
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

export function configSnippet(execPath: string, shimPath: string, handshakePath: string): string {
  return JSON.stringify({
    mcpServers: {
      pikaos: {
        command: execPath,
        args: [shimPath, '--handshake', handshakePath],
        // Makes the Electron binary behave as plain Node, so no Node install is required and the
        // shim can never be a different version from the app that serves it.
        env: { ELECTRON_RUN_AS_NODE: '1' },
      },
    },
  }, null, 2)
}
