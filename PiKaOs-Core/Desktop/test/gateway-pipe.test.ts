import { it, expect, vi, afterEach } from 'vitest'
import { createConnection } from 'node:net'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { serializeMessage } from '@modelcontextprotocol/sdk/shared/stdio.js'
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
    makeServer: (requirePaired) => createGatewayServer({
      listTools: async () => [], callTool: vi.fn(), consent: async () => true, requirePaired,
    }),
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

// E2b final-review Fix 1 (the CRITICAL finding): pairing used to be a side effect of
// `oninitialized`, never awaited by the request handlers — a client that never sends
// notifications/initialized kept its ListTools/CallTool handlers live and answering forever, and a
// client that raced initialize→initialized→tools/list in one write got served before the operator's
// dialog even opened. These two tests pin the fix: requirePaired() must gate every request.
it('does not serve the catalog while pairing is pending', async () => {
  let resolvePairing!: (ok: boolean) => void
  const pairClient = vi.fn(() => new Promise<boolean>(res => { resolvePairing = res }))
  const { handshake } = await start({ pairClient })
  const sock = createConnection(handshake.pipe)
  await new Promise(r => sock.once('connect', r))
  sock.write(handshake.token + '\n')

  const transport = new StreamTransport(sock, sock)
  const client = new Client({ name: 'pending-test-client', version: '0.0.1' })
  // initialize/initialized complete independently of pairing (pairing starts only once
  // oninitialized fires), so this resolves even though pairClient() is deliberately left pending.
  await client.connect(transport)

  const chunks: Buffer[] = []
  sock.on('data', (c) => chunks.push(c))
  const listPromise = client.listTools()

  const raced = await Promise.race([
    listPromise.then(() => 'resolved' as const),
    new Promise<'still-pending'>(r => setTimeout(() => r('still-pending'), 200)),
  ])
  expect(raced).toBe('still-pending')
  expect(Buffer.concat(chunks).toString()).toBe('')   // nothing crossed the wire while pairing hangs

  resolvePairing(true)   // let the connection wind down cleanly instead of leaking a pending promise
  await listPromise
  sock.destroy()
})

it('ends the connection when initialize is never followed by notifications/initialized', async () => {
  const pairClient = vi.fn(async () => true)
  // The real deadline (PRE_HANDSHAKE_TIMEOUT_MS's post-token sibling) is generous on purpose for a
  // real client; shortened here so the test doesn't sit around waiting for it.
  const { handshake } = await start({ pairClient, pairingTimeoutMs: 50 })
  const sock = createConnection(handshake.pipe)
  await new Promise(r => sock.once('connect', r))
  sock.write(handshake.token + '\n')
  sock.write(JSON.stringify({
    jsonrpc: '2.0', id: 1, method: 'initialize',
    params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'silent-client', version: '1' } },
  }) + '\n')
  // Deliberately never sent: notifications/initialized.
  sock.write(JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }) + '\n')

  const chunks: Buffer[] = []
  sock.on('data', (c) => chunks.push(c))
  await new Promise(r => sock.once('close', r))

  expect(pairClient).not.toHaveBeenCalled()      // oninitialized never fired — nothing was ever asked
  expect(Buffer.concat(chunks).toString()).not.toContain('"id":2')   // no tools/list reply, ever
  sock.destroy()
})

// E2b final-fix-wave item 2: a client that never sends clientInfo.name (or sends a blank one) used
// to pair as the literal string 'unknown client' — a name any later anonymous connection also
// matches, once one such client has been Allowed once and the operator's answer persisted under that
// shared label. `oninitialized` must now reject a blank name before ever calling pairClient(), so no
// dialog fires and nothing is ever written to gateway-clients.json for it. Same shape as the
// "pairing is denied" test above — the initialize/initialized round trip is consumed by the SDK
// Client's own transport, so a truly silent rejection leaves the raw socket listener nothing to see.
it('rejects a client whose clientInfo.name is blank, without ever asking to pair it', async () => {
  const pairClient = vi.fn(async () => true)
  const { handshake } = await start({ pairClient })
  const sock = createConnection(handshake.pipe)
  await new Promise(r => sock.once('connect', r))
  sock.write(handshake.token + '\n')

  const transport = new StreamTransport(sock, sock)
  const client = new Client({ name: '   ', version: '0.0.1' })
  await client.connect(transport)

  const chunks: Buffer[] = []
  sock.on('data', (c) => chunks.push(c))
  await new Promise(r => sock.once('close', r))
  expect(pairClient).not.toHaveBeenCalled()
  expect(Buffer.concat(chunks).toString()).toBe('')
  sock.destroy()
})

// E2b final-review Fix 2: revoking a currently-connected client must end its connection, not just
// edit gateway-clients.json out from under it.
//
// client.connect() resolves once the SDK has SENT notifications/initialized, not once the gateway
// has received it, run pairClient(), and recorded the name in pairedName — that is a real extra
// round trip over the pipe (server must also process+respond to initialize first). A fixed number
// of setImmediate() ticks proved flaky on Windows named pipes (the round trip can take longer than
// one tick), so this waits on the actual pairClient() call instead of guessing how many ticks the
// underlying transport needs.
it('disconnect(name) closes a live connection paired under that name', async () => {
  let onPairClientCalled!: () => void
  const pairedCall = new Promise<void>(res => { onPairClientCalled = res })
  const pairClient = vi.fn(async (_name: string) => { onPairClientCalled(); return true })
  const { handshake, gw } = await start({ pairClient })
  const sock = createConnection(handshake.pipe)
  await new Promise(r => sock.once('connect', r))
  sock.write(handshake.token + '\n')

  const transport = new StreamTransport(sock, sock)
  const client = new Client({ name: 'revoke-test-client', version: '0.0.1' })
  await client.connect(transport)
  await pairedCall
  // pairClient() resolving true and pairedName actually recording the name both happen in the same
  // .then() continuation right after pairClient()'s own promise settles — one more tick for that.
  await new Promise(r => setImmediate(r))

  const closed = new Promise<void>(r => sock.once('close', r))
  gw.disconnect('revoke-test-client')
  await closed
})

// Live-UAT regression: this is the shim's actual write pattern (pikaos-mcp.ts's socketLink writes
// the token line via one sock.write(), then the SDK Client under it flushes initialize and
// notifications/initialized as fast, separate — but OS-coalesced — writes). When the token line and
// the first JSON-RPC frames land in ONE 'data' chunk on the server, the measured live-UAT defect was
// the socket closing in ~2ms with zero bytes written back and no pairing dialog ever shown.
it('answers initialize when the token line and the full handshake arrive in a single write', async () => {
  const { handshake } = await start()
  const sock = createConnection(handshake.pipe)
  await new Promise(r => sock.once('connect', r))

  const initRequest = serializeMessage({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'same-write-client', version: '1' },
    },
  })
  const initializedNotification = serializeMessage({ jsonrpc: '2.0', method: 'notifications/initialized' })
  // One write, deliberately: token line + initialize + notifications/initialized concatenated into a
  // single Buffer before it ever reaches the socket, so Node hands it to 'data' as one chunk.
  sock.write(handshake.token + '\n' + initRequest + initializedNotification)

  const chunks: Buffer[] = []
  sock.on('data', (c) => chunks.push(c))
  const closed = new Promise<void>(r => sock.once('close', r))
  await Promise.race([
    new Promise(r => setTimeout(r, 300)),
    closed.then(() => { throw new Error('socket closed before answering initialize') }),
  ])
  expect(Buffer.concat(chunks).toString()).toContain('"id":1')
  sock.destroy()
})

// Pins the working case alongside the one above so a fix for same-chunk delivery can't regress the
// split case: token line arrives, then the handshake frames arrive in a LATER chunk. This is the
// case the live UAT measured as already working (400ms apart) and it must stay that way.
it('answers initialize when the token line and the handshake arrive in separate chunks', async () => {
  const { handshake } = await start()
  const sock = createConnection(handshake.pipe)
  await new Promise(r => sock.once('connect', r))
  sock.write(handshake.token + '\n')
  await new Promise(r => setTimeout(r, 50))   // force two distinct 'data' events on the server

  const initRequest = serializeMessage({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-11-25',
      capabilities: {},
      clientInfo: { name: 'split-write-client', version: '1' },
    },
  })
  const initializedNotification = serializeMessage({ jsonrpc: '2.0', method: 'notifications/initialized' })
  sock.write(initRequest + initializedNotification)

  const chunks: Buffer[] = []
  sock.on('data', (c) => chunks.push(c))
  await new Promise(r => setTimeout(r, 300))
  expect(Buffer.concat(chunks).toString()).toContain('"id":1')
  sock.destroy()
})
