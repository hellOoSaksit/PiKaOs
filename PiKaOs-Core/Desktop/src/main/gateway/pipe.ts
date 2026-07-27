import { createServer, Socket } from 'node:net'
import { chmodSync } from 'node:fs'
import { timingSafeEqual } from 'node:crypto'
import type { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamTransport } from '../mcp/transport'
import type { Handshake } from './handshake'

const MAX_TOKEN_LINE = 512   // a token line is 65 bytes; anything larger is not a client of ours

// A local IPC round-trip is effectively instant; this only has to be generous enough to absorb CI
// jitter, not to accommodate a real client. Anything slower than this is either a stalled peer or a
// hostile one, and either way must not be allowed to sit forever (mirrors McpManager's own
// handshake-timeout pattern — see manager.ts's withTimeout/handshakeTimeoutMs).
const PRE_HANDSHAKE_TIMEOUT_MS = 5_000

// `initialize` and `notifications/initialized` are two writes a conforming client issues back to
// back; this bounds the gap between them. It does NOT bound how long pairClient() itself takes —
// the operator may take any amount of time to click the dialog — only the handshake step that has
// to happen before pairing can even start. A socket that completes `initialize` and then goes quiet
// (deliberately or not) would otherwise sit forever holding a live, unpaired MCP server.
const PAIRING_TIMEOUT_MS = 5_000

// Length-independent comparison, so a wrong token never leaks how much of it was right.
const sameToken = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export type PipeOpts = {
  handshake: Handshake
  makeServer: (requirePaired: () => Promise<void>) => Server
  pairClient: (clientName: string) => Promise<boolean>
  onConnectionsChanged: (n: number) => void
  // Overridable only by tests (a real handshake round-trip is effectively instant); production
  // always gets PAIRING_TIMEOUT_MS.
  pairingTimeoutMs?: number
}

export async function startPipe(opts: PipeOpts) {
  const live = new Set<Socket>()
  // Accepted but still pre-handshake (no valid token line yet). Tracked separately from `live` so
  // close() can tear both down — a socket that opens and sends nothing never joins `live`, and
  // net.Server.close() otherwise waits for every accepted socket to end, tracked or not, which would
  // hang it (and later, app quit) forever.
  const pending = new Set<Socket>()
  // Sockets whose MCP side is attached, keyed here rather than closed over per-connection so every
  // forced-destroy path below — including close() — can route through it uniformly.
  const attached = new Map<Socket, Server>()
  // The clientInfo name a socket was paired under, once pairing succeeds. Doubles as Fix 2's
  // client→socket mapping (disconnect() below) and as the record `changed()` re-fires against when
  // pairing completes — one map serving both "who is this" and "tell the panel something changed".
  const pairedName = new Map<Socket, string>()
  const changed = () => opts.onConnectionsChanged(live.size)

  // The one place that ends a socket. A rejected token, a timed-out handshake, a denied pairing, and
  // a raw socket error all get identical treatment from the outside: silence and a closed socket —
  // no code, no message, no hint which one happened (rule 10). Closing the attached MCP server first
  // (if there is one) runs the SDK's own teardown (Protocol._onclose via transport.close()) instead
  // of skipping it on a raw destroy.
  const forceClose = (sock: Socket) => {
    attached.get(sock)?.close().catch(() => {})
    sock.destroy()
  }

  const server = createServer((sock) => {
    pending.add(sock)
    const timer = setTimeout(() => forceClose(sock), PRE_HANDSHAKE_TIMEOUT_MS)
    // unref() so a pending handshake timer never holds the process (or vitest) open — same reason
    // manager.ts's withTimeout does it for the outbound handshake.
    if (typeof timer.unref === 'function') timer.unref()
    sock.once('close', () => { clearTimeout(timer); pending.delete(sock) })

    // Phase 1: the token line, consumed by hand. The MCP transport must not see these bytes, so it
    // is only attached once the line has been taken off the wire. Accumulated as a Buffer (not a
    // string) and split on the raw newline byte — concatenating `chunk.toString('utf8')` pieces
    // would mangle a multi-byte UTF-8 character that a chunk boundary happens to bisect in whatever
    // trails the token line. The token itself is plain ASCII hex, so it's the only part decoded to a
    // string, and only once the whole line is in hand.
    let pre = Buffer.alloc(0)
    const onData = (chunk: Buffer) => {
      pre = Buffer.concat([pre, chunk])
      const nl = pre.indexOf(0x0a)
      if (pre.length > MAX_TOKEN_LINE && nl < 0) return forceClose(sock)
      if (nl < 0) return
      // pause() before detaching: the socket is in flowing mode, and removing the last 'data'
      // listener does NOT stop it — bytes that arrive before the transport attaches would be
      // dropped on the floor, which looks exactly like a client that never sent its handshake.
      sock.pause()
      sock.off('data', onData)
      clearTimeout(timer)
      pending.delete(sock)
      const line = pre.subarray(0, nl).toString('ascii').trim()
      const rest = pre.subarray(nl + 1)
      // A rejected token gets silence and a closed socket — no code, no message (rule 10).
      if (!sameToken(line, opts.handshake.token)) return forceClose(sock)
      accept(sock, rest)
    }
    sock.on('data', onData)
    sock.on('error', () => forceClose(sock))
  })

  const accept = (sock: Socket, rest: Buffer) => {
    live.add(sock)
    changed()

    // The pairing gate every request handler awaits before touching `deps` (server.ts). Resolved on
    // an allowed pairing; rejected on a denial or a stalled handshake — either way forceClose() below
    // has already ended the socket by the time anything downstream observes the rejection, so a
    // rejection here never turns into a reply on the wire (rule 10). Swallowed with a no-op .catch
    // so a socket that never issues a single request doesn't leave this dangling as an unhandled
    // rejection.
    let resolvePaired!: () => void
    let rejectPaired!: (e: unknown) => void
    const paired = new Promise<void>((res, rej) => { resolvePaired = res; rejectPaired = rej })
    paired.catch(() => {})

    // Covers only the initialize→initialized gap (see PAIRING_TIMEOUT_MS) — cleared the moment
    // oninitialized fires, whether or not pairClient() itself has answered yet.
    const deadline = setTimeout(() => {
      rejectPaired(new Error('handshake stalled'))
      forceClose(sock)
    }, opts.pairingTimeoutMs ?? PAIRING_TIMEOUT_MS)
    if (typeof deadline.unref === 'function') deadline.unref()

    const mcp = opts.makeServer(() => paired)
    attached.set(sock, mcp)
    sock.once('close', () => {
      clearTimeout(deadline)
      live.delete(sock); attached.delete(sock); pairedName.delete(sock); changed()
    })

    const transport = new StreamTransport(sock, sock)
    // Pairing keys off clientInfo, which only exists once initialize has been handled — so it is
    // checked here rather than at connect time. A denial closes the socket; the client sees a
    // dropped connection, which is all it is entitled to know.
    mcp.oninitialized = () => {
      clearTimeout(deadline)
      const name = mcp.getClientVersion()?.name ?? 'unknown client'
      opts.pairClient(name).then(ok => {
        if (ok) {
          pairedName.set(sock, name)
          resolvePaired()
          // The approved-clients list just changed (clients.ts persisted the name) even though the
          // live connection COUNT did not — re-emit so the panel's status listener knows to refresh
          // the table (Fix 4: stale approved-clients table), not just react to a literal count change.
          changed()
        } else {
          rejectPaired(new Error('pairing denied'))
          forceClose(sock)
        }
      }, () => { rejectPaired(new Error('pairing denied')); forceClose(sock) })
    }
    mcp.connect(transport).then(() => {
      // Anything that arrived in the same chunk as the token still has to reach the protocol.
      if (rest.length) sock.emit('data', rest)
      sock.resume()
    }, () => forceClose(sock))
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(opts.handshake.pipe, () => { server.off('error', reject); resolve() })
  })
  // Windows names pipes with their own ACL model; POSIX sockets inherit the umask, which typically
  // leaves them world-connectable. Tightened to the owner only, after listen (the path must exist
  // first) and on POSIX only (chmodSync on a Windows pipe path throws — it isn't a filesystem node).
  if (process.platform !== 'win32') chmodSync(opts.handshake.pipe, 0o600)

  return {
    connections: () => live.size,
    // Fix 2: an operator revoking a client that is CURRENTLY connected must end that connection, not
    // just edit it out of gateway-clients.json — otherwise the panel shows a revocation that didn't
    // actually happen. Reuses the same pairedName map Fix 1 populates on a successful pairing.
    disconnect: (name: string) => {
      for (const [sock, paired] of pairedName) if (paired === name) forceClose(sock)
    },
    close: () => new Promise<void>((resolve) => {
      for (const s of pending) forceClose(s)
      pending.clear()
      for (const s of live) forceClose(s)
      live.clear()
      server.close(() => resolve())
    }),
  }
}
