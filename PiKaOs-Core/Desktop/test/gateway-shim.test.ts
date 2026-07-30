import { it, expect, vi } from 'vitest'
import { PassThrough } from 'node:stream'
import { Shim } from '../src/shim/shim'
import { createGatewayServer } from '../src/main/gateway/server'
import { StreamTransport } from '../src/main/mcp/transport'
import { cannedInitializeResult } from '../src/main/gateway/protocol'

const INIT = {
  jsonrpc: '2.0' as const, id: 1, method: 'initialize',
  params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'Claude', version: '1' } },
}

// A Link fake: whatever the shim sends is recorded; replies are injected by hand.
const link = () => {
  const sent: any[] = []
  let onMsg: (m: any) => void = () => {}
  let onClose: () => void = () => {}
  return {
    sent,
    reply: (m: any) => onMsg(m),
    drop: () => onClose(),
    api: {
      send: (m: any) => sent.push(m),
      onMessage: (cb: any) => { onMsg = cb },
      onClose: (cb: any) => { onClose = cb },
    },
  }
}

it('while disconnected it answers initialize itself and reports an empty tool list', async () => {
  const out: any[] = []
  const shim = new Shim((m) => out.push(m), () => new Promise(() => {}))
  shim.fromClient(INIT)
  shim.fromClient({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} } as any)
  expect(out[0].result).toEqual(cannedInitializeResult(INIT.params))
  expect(out[1].result).toEqual({ tools: [] })
})

it('while disconnected a tools/call is an error naming what the user must do', async () => {
  const out: any[] = []
  const shim = new Shim((m) => out.push(m), () => new Promise(() => {}))
  shim.fromClient({ jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 't' } } as any)
  expect(out[0].error.message).toMatch(/open pikaos/i)
})

it('the canned initialize result equals what a real gateway Server answers', async () => {
  // The one weak point of the thin-shim design: two initialize answers must agree. Compare the
  // shim's canned result against the real SDK Server over an in-memory stream pair.
  const toServer = new PassThrough(), fromServer = new PassThrough()
  const server = createGatewayServer({
    listTools: async () => [], callTool: vi.fn(), consent: async () => true, requirePaired: async () => {},
  })
  await server.connect(new StreamTransport(toServer, fromServer))
  const answer = new Promise<any>(r => fromServer.once('data', (c: Buffer) => r(JSON.parse(c.toString()))))
  toServer.write(JSON.stringify(INIT) + '\n')
  expect((await answer).result).toEqual(cannedInitializeResult(INIT.params))
})

it('on connect it replays initialize, swallows the reply, and announces the list once', async () => {
  const out: any[] = []
  const L = link()
  const shim = new Shim((m) => out.push(m), async () => L.api)
  shim.fromClient(INIT)
  shim.fromClient({ jsonrpc: '2.0', method: 'notifications/initialized' } as any)
  shim.start()
  await new Promise(r => setImmediate(r))

  expect(L.sent.map((m: any) => m.method)).toEqual(['initialize', 'notifications/initialized'])
  L.reply({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-11-25' } })   // main's own answer
  L.reply({ jsonrpc: '2.0', id: 9, result: { tools: [] } })                        // an ordinary reply

  const ids = out.filter((m: any) => m.id !== undefined).map((m: any) => m.id)
  expect(ids).toEqual([1, 9])              // exactly one answer to id 1 — main's was swallowed
  const notes = out.filter((m: any) => m.method === 'notifications/tools/list_changed')
  expect(notes).toHaveLength(1)
})

it('when the link drops it announces the list again so the client sees it empty', async () => {
  const out: any[] = []
  const L = link()
  const shim = new Shim((m) => out.push(m), async () => L.api)
  shim.fromClient(INIT)
  shim.start()
  await new Promise(r => setImmediate(r))
  L.drop()
  await new Promise(r => setImmediate(r))
  expect(out.filter((m: any) => m.method === 'notifications/tools/list_changed')).toHaveLength(2)
})

// The five tests above all call fromClient() before start() — the client's first message always
// arrives while the shim is still offline. That is not the common case: PiKaOs is usually already
// running when the client starts, so the link is up before `initialize` ever shows up. This test
// inverts the order to prove initReq/initNote get captured in that case too.
it('captures initialize even when the link is already connected, then replays it on the next reconnect', async () => {
  vi.useFakeTimers()
  try {
    const out: any[] = []
    const links = [link(), link()]
    let i = 0
    const shim = new Shim((m) => out.push(m), async () => links[i++].api)

    shim.start()
    await vi.advanceTimersByTimeAsync(0)   // first link attaches before the client ever speaks

    shim.fromClient(INIT)
    shim.fromClient({ jsonrpc: '2.0', method: 'notifications/initialized' } as any)

    // The handshake must be forwarded to main (it needs to answer it) even though the link is up.
    expect(links[0].sent.map((m: any) => m.method)).toEqual(['initialize', 'notifications/initialized'])
    links[0].reply({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-11-25' } })

    links[0].drop()
    await vi.advanceTimersByTimeAsync(0)
    // announce() must fire on this drop, which only happens if initReq was actually captured.
    expect(out.filter((m: any) => m.method === 'notifications/tools/list_changed')).toHaveLength(1)

    await vi.advanceTimersByTimeAsync(5000)   // let scheduleRetry's backoff elapse and reconnect fire
    // The replay on reconnect only happens if initReq/initNote survived being captured while online.
    expect(links[1].sent.map((m: any) => m.method)).toEqual(['initialize', 'notifications/initialized'])
  } finally {
    vi.useRealTimers()
  }
})

// Fix 3: `initialize` is the one message the shim otherwise always answers locally (see the two
// disconnected-state tests above). When the link IS up (the steady state — PiKaOs already running),
// the client's initialize is forwarded and its id lands in inFlight like any other request. If the
// link drops before main answers it, failInFlight() used to error it with the same offline message
// as every other pending request — but an MCP client whose `initialize` fails marks the server
// failed and never retries, wedging the connection until the user restarts Claude Desktop. It must
// get the shim's own canned result instead, exactly as if it had arrived while offline.
it('answers a client initialize itself if the link drops before main replies (not the offline error)', async () => {
  const out: any[] = []
  const L = link()
  const shim = new Shim((m) => out.push(m), async () => L.api)
  shim.start()
  await new Promise(r => setImmediate(r))   // link attaches before the client ever speaks

  shim.fromClient(INIT)   // link is already up, so this is forwarded (not answered locally)
  expect(L.sent.some((m: any) => m.method === 'initialize' && m.id === 1)).toBe(true)

  L.drop()   // main never got to answer
  await new Promise(r => setImmediate(r))

  const answer = out.find((m: any) => m.id === 1)
  expect(answer?.result).toEqual(cannedInitializeResult(INIT.params))
  expect(answer?.error).toBeUndefined()
})

it('errors an in-flight request when the link drops before main answers it', async () => {
  const out: any[] = []
  const L = link()
  const shim = new Shim((m) => out.push(m), async () => L.api)
  shim.fromClient(INIT)
  shim.start()
  await new Promise(r => setImmediate(r))

  shim.fromClient({ jsonrpc: '2.0', id: 42, method: 'tools/call', params: { name: 't' } } as any)
  expect(L.sent.some((m: any) => m.id === 42)).toBe(true)   // forwarded to main, no reply yet

  L.drop()
  await new Promise(r => setImmediate(r))

  const answer = out.find((m: any) => m.id === 42)
  expect(answer?.error?.message).toMatch(/open pikaos/i)   // errored, not abandoned
})

// ---- proven-link backoff (spec 2026-07-30-gateway-retry-persistence-design.md §1) ----

// Test rig for the retry ladder. `dials` counts connect attempts; `rejectNext` flips the rig from
// "gateway accepts then denies" to "pipe absent" (connect rejects). `expectNextDialAfter` is the
// only reliable way to measure a gap under fake timers: assert nothing fires one tick early, then
// that exactly one dial fires on the tick — computing gaps from recorded timestamps silently
// includes whatever the test advanced between drop and dial.
const rig = () => {
  const out: any[] = []
  const links: ReturnType<typeof link>[] = []
  const state = { dials: 0, rejectNext: false }
  const shim = new Shim((m) => out.push(m), async () => {
    state.dials++
    if (state.rejectNext) throw new Error('ENOENT')
    const L = link(); links.push(L); return L.api
  })
  const last = () => links[links.length - 1]
  // Swallowed replay answer + drop = one deny cycle, exactly what main does to a denied client.
  const deny = () => {
    last().reply({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-11-25' } })
    last().drop()
  }
  const expectNextDialAfter = async (ms: number) => {
    const before = state.dials
    await vi.advanceTimersByTimeAsync(ms - 1)
    expect(state.dials).toBe(before)          // one tick early: nothing
    await vi.advanceTimersByTimeAsync(1)
    expect(state.dials).toBe(before + 1)      // on the tick: exactly one dial
  }
  return { out, links, state, shim, last, deny, expectNextDialAfter }
}

it('a link that dies before answering any real request parks at the 60s dead-link ceiling', async () => {
  vi.useFakeTimers()
  try {
    const r = rig()
    r.shim.fromClient(INIT)
    r.shim.fromClient({ jsonrpc: '2.0', method: 'notifications/initialized' } as any)
    r.shim.start()
    await vi.advanceTimersByTimeAsync(0)      // first link attaches
    // The full ladder: doubles from 1s and PARKS at 60s (not 5s, not still climbing).
    for (const gap of [1000, 2000, 4000, 8000, 16_000, 32_000, 60_000, 60_000]) {
      r.deny()
      await r.expectNextDialAfter(gap)
    }
  } finally { vi.useRealTimers() }
})

it('a response the client is waiting on proves the link and re-arms the fast track', async () => {
  vi.useFakeTimers()
  try {
    const r = rig()
    r.shim.fromClient(INIT)
    r.shim.fromClient({ jsonrpc: '2.0', method: 'notifications/initialized' } as any)
    r.shim.start()
    await vi.advanceTimersByTimeAsync(0)
    // Climb first, so a reset is distinguishable from "was still at the minimum".
    r.deny(); await r.expectNextDialAfter(1000)
    r.deny(); await r.expectNextDialAfter(2000)
    r.deny(); await r.expectNextDialAfter(4000)
    // Healthy cycle: main answers a REAL request (id 9 — not the replayed initialize).
    r.last().reply({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-11-25' } })  // swallowed
    r.last().reply({ jsonrpc: '2.0', id: 9, result: { tools: [] } })                      // proof
    r.last().drop()
    await r.expectNextDialAfter(1000)         // proven ⇒ back to RETRY_MIN_MS, not 8s
  } finally { vi.useRealTimers() }
})

it("the client's own initialize response does not prove the link", async () => {
  vi.useFakeTimers()
  try {
    const r = rig()
    r.shim.start()
    await vi.advanceTimersByTimeAsync(0)      // link up before the client speaks
    r.shim.fromClient(INIT)                   // forwarded to main (id 1 lands in inFlight)
    r.last().reply({ jsonrpc: '2.0', id: 1, result: { protocolVersion: '2025-11-25' } })
    r.last().drop()                           // died having answered ONLY the client's initialize
    await r.expectNextDialAfter(1000)         // delay was still at the minimum...
    r.deny()
    // ...and had it counted as proof this gap would be 1s again. Unproven, it doubled.
    await r.expectNextDialAfter(2000)
  } finally { vi.useRealTimers() }
})

it('a shim parked at 60s falls back to the 5s track when the pipe disappears', async () => {
  vi.useFakeTimers()
  try {
    const r = rig()
    r.shim.fromClient(INIT)
    r.shim.start()
    await vi.advanceTimersByTimeAsync(0)
    for (const gap of [1000, 2000, 4000, 8000, 16_000, 32_000, 60_000]) {   // park at the ceiling
      r.deny()
      await r.expectNextDialAfter(gap)
    }
    r.state.rejectNext = true                 // app restarted: the old pipe name is gone
    r.deny()                                  // drop the current link; next dial (at 60s) rejects
    await r.expectNextDialAfter(60_000)
    await r.expectNextDialAfter(5000)         // clamped to the connect-rejected ceiling, not 60s
  } finally { vi.useRealTimers() }
})
