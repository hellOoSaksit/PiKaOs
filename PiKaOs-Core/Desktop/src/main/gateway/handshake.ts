import { randomBytes } from 'node:crypto'
import { writeFileSync, readFileSync } from 'node:fs'
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
  // mode on the open() call, not a later chmod — a chmod leaves a window where the file exists
  // with the default mode and the token is already in it.
  writeFileSync(path, JSON.stringify(handshake), { mode: 0o600 })
  return { handshake, path }
}

export function readHandshake(path: string): Handshake {
  const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<Handshake>
  if (typeof raw.pipe !== 'string' || typeof raw.token !== 'string') {
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
