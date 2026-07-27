import { it, expect, vi, afterEach } from 'vitest'
import { createConnection } from 'node:net'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { startPipe } from '../src/main/gateway/pipe'
import { createGatewayServer } from '../src/main/gateway/server'

// A unix socket under a temp dir on posix, a named pipe on Windows — the same code path either way.
const pipeName = () => process.platform === 'win32'
  ? `\\\\.\\pipe\\pikaos-test-${Math.random().toString(16).slice(2)}`
  : join(mkdtempSync(join(tmpdir(), 'gwp-')), 's.sock')

let stop: (() => Promise<void>) | null = null
afterEach(async () => { await stop?.(); stop = null })

const start = async (over: Partial<Parameters<typeof startPipe>[0]> = {}) => {
  const handshake = { pipe: pipeName(), token: 'a'.repeat(64) }
  const gw = await startPipe({
    handshake,
    makeServer: () => createGatewayServer({ listTools: async () => [], callTool: vi.fn(), consent: async () => true }),
    pairClient: async () => true,
    onConnectionsChanged: () => {},
    ...over,
  })
  stop = gw.close
  return { handshake, gw }
}

it('accepts a connection whose first line is the token', async () => {
  const { handshake, gw } = await start()
  const sock = createConnection(handshake.pipe)
  await new Promise(r => sock.once('connect', r))
  sock.write(handshake.token + '\n')
  await new Promise(r => setTimeout(r, 50))
  expect(gw.connections()).toBe(1)
  sock.destroy()
})

it('destroys a connection whose first line is the wrong token, with no reason on the wire', async () => {
  const { handshake, gw } = await start()
  const sock = createConnection(handshake.pipe)
  await new Promise(r => sock.once('connect', r))
  const chunks: Buffer[] = []
  sock.on('data', (c) => chunks.push(c))
  sock.write('b'.repeat(64) + '\n')
  await new Promise(r => sock.once('close', r))
  expect(gw.connections()).toBe(0)
  expect(Buffer.concat(chunks).toString()).toBe('')
})

it('close() stops accepting new connections', async () => {
  const { handshake } = await start()
  await stop!(); stop = null
  await expect(new Promise((res, rej) => {
    const s = createConnection(handshake.pipe)
    s.once('connect', () => { s.destroy(); res(null) })
    s.once('error', rej)
  })).rejects.toBeTruthy()
})
