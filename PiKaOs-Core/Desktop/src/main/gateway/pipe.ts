import { createServer, Socket } from 'node:net'
import { timingSafeEqual } from 'node:crypto'
import type { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { StreamTransport } from '../mcp/transport'
import type { Handshake } from './handshake'

const MAX_TOKEN_LINE = 512   // a token line is 65 bytes; anything larger is not a client of ours

// Length-independent comparison, so a wrong token never leaks how much of it was right.
const sameToken = (a: string, b: string) => {
  const x = Buffer.from(a), y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

export type PipeOpts = {
  handshake: Handshake
  makeServer: () => Server
  pairClient: (clientName: string) => Promise<boolean>
  onConnectionsChanged: (n: number) => void
}

export async function startPipe(opts: PipeOpts) {
  const live = new Set<Socket>()
  const changed = () => opts.onConnectionsChanged(live.size)

  const server = createServer((sock) => {
    // Phase 1: the token line, consumed by hand. The MCP transport must not see these bytes, so it
    // is only attached once the line has been taken off the wire.
    let pre = ''
    const onData = (chunk: Buffer) => {
      pre += chunk.toString('utf8')
      if (pre.length > MAX_TOKEN_LINE && !pre.includes('\n')) return sock.destroy()
      const nl = pre.indexOf('\n')
      if (nl < 0) return
      // pause() before detaching: the socket is in flowing mode, and removing the last 'data'
      // listener does NOT stop it — bytes that arrive before the transport attaches would be
      // dropped on the floor, which looks exactly like a client that never sent its handshake.
      sock.pause()
      sock.off('data', onData)
      const line = pre.slice(0, nl).trim()
      const rest = Buffer.from(pre.slice(nl + 1), 'utf8')
      // A rejected token gets silence and a closed socket — no code, no message (rule 10).
      if (!sameToken(line, opts.handshake.token)) return sock.destroy()
      accept(sock, rest)
    }
    sock.on('data', onData)
    sock.on('error', () => sock.destroy())
  })

  const accept = (sock: Socket, rest: Buffer) => {
    live.add(sock)
    changed()
    sock.once('close', () => { live.delete(sock); changed() })

    const mcp = opts.makeServer()
    const transport = new StreamTransport(sock, sock)
    // Pairing keys off clientInfo, which only exists once initialize has been handled — so it is
    // checked here rather than at connect time. A denial closes the socket; the client sees a
    // dropped connection, which is all it is entitled to know.
    mcp.oninitialized = () => {
      const name = mcp.getClientVersion()?.name ?? 'unknown client'
      opts.pairClient(name).then(ok => { if (!ok) sock.destroy() }, () => sock.destroy())
    }
    mcp.connect(transport).then(() => {
      // Anything that arrived in the same chunk as the token still has to reach the protocol.
      if (rest.length) sock.emit('data', rest)
      sock.resume()
    }, () => sock.destroy())
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(opts.handshake.pipe, () => { server.off('error', reject); resolve() })
  })

  return {
    connections: () => live.size,
    close: () => new Promise<void>((resolve) => {
      for (const s of live) s.destroy()
      live.clear()
      server.close(() => resolve())
    }),
  }
}
