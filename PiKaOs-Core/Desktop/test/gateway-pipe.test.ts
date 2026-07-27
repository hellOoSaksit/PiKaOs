import { it, expect, vi, afterEach } from 'vitest'
import { createConnection } from 'node:net'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { startPipe } from '../src/main/gateway/pipe'
import { createGatewayServer } from '../src/main/gateway/server'
import { StreamTransport } from '../src/main/mcp/transport'

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

// F1: a connection that opens and sends nothing must not be able to hold close() open forever —
// that would hang app quit once a later task wires the gateway in. Windows named pipes happen to
// resolve net.Server.close()'s callback the moment the LISTENER stops, even with a live connection
// still open (verified against a bare net probe outside this suite) — POSIX sockets do not, and
// that gap is exactly F1. So the real assertion is that close() also destroys this still-open,
// never-authenticated socket from the server side (observed here as OUR end seeing 'close'), not
// merely that the returned promise settles. The 2s race is the "real bound": without a
// pre-handshake timer/pending-set, that 'close' never arrives, and this test fails on the timeout
// branch instead of stalling the whole suite.
it('close() tears down a connection that never sent anything before the handshake', async () => {
  const { handshake } = await start()
  const sock = createConnection(handshake.pipe)
  await new Promise(r => sock.once('connect', r))
  const socketClosed = new Promise<void>(r => sock.once('close', r))
  try {
    const BOUND_MS = 2000
    const outcome = await Promise.race([
      Promise.all([stop!(), socketClosed]).then(() => 'closed' as const),
      new Promise<'timed-out'>(r => setTimeout(() => r('timed-out'), BOUND_MS)),
    ])
    stop = null
    expect(outcome).toBe('closed')
  } finally {
    // Whatever the outcome, drop our end so a still-buggy server side isn't left dangling for the
    // rest of the suite — a leaked open socket hangs vitest exactly the way F1 describes.
    sock.destroy()
  }
})

// F2: pairClient's denial path had no coverage. clientInfo only exists once initialize has been
// handled, so a real Client is driven far enough to trigger `oninitialized` (client.connect()
// completes the initialize/initialized round trip). Mirrors the wrong-token test above, except the
// initialize response itself is legitimate protocol traffic — what must never appear is anything
// AFTER that explaining the denial.
it('destroys a connection whose pairing is denied, with no reason on the wire', async () => {
  const { handshake } = await start({ pairClient: async () => false })
  const sock = createConnection(handshake.pipe)
  await new Promise(r => sock.once('connect', r))
  sock.write(handshake.token + '\n')

  const transport = new StreamTransport(sock, sock)
  const client = new Client({ name: 'denied-test-client', version: '0.0.1' })
  // Resolves once the client has sent notifications/initialized — the moment the gateway's
  // oninitialized (and thus pairClient) fires.
  await client.connect(transport)

  const chunks: Buffer[] = []
  sock.on('data', (c) => chunks.push(c))
  await new Promise(r => sock.once('close', r))
  expect(Buffer.concat(chunks).toString()).toBe('')
  sock.destroy()
})
