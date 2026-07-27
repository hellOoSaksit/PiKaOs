import type { ChildProcess } from 'node:child_process'
import { ReadBuffer, serializeMessage } from '@modelcontextprotocol/sdk/shared/stdio.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'

// Attaches to streams SOMEONE ELSE owns — a child's stdio, or a pipe socket the gateway accepted.
// The SDK's own transports spawn or connect for you, but our side is where the consent gate, the
// vault and the token check live, so ownership has to stay out here. Framing is the SDK's
// (ReadBuffer/serializeMessage), never hand-rolled.
export class StreamTransport implements Transport {
  onclose?: () => void
  onerror?: (error: Error) => void
  onmessage?: (message: JSONRPCMessage) => void
  private buffer = new ReadBuffer()

  constructor(
    protected readable: NodeJS.ReadableStream | null | undefined,
    protected writable: NodeJS.WritableStream | null | undefined,
  ) {}

  async start(): Promise<void> {
    this.readable?.on('data', (chunk: Buffer) => this.ingest(chunk))
  }

  // Feeds bytes that were already read off the underlying stream by someone else BEFORE this
  // transport's own 'data' listener was attached — e.g. gateway/pipe.ts's accept() consumes the
  // pre-handshake token line by hand, and whatever arrived in the SAME chunk as that line still has
  // to reach the protocol. Goes through the exact same ReadBuffer/onmessage pipeline a live 'data'
  // event would, instead of synthesizing a fake stream event (`sock.emit('data', ...)`) on a socket
  // the transport doesn't otherwise touch — a real 'data' event carries backpressure/flow-control
  // semantics that a synthetic one does not, so this is the legitimate way to hand over already-read
  // bytes, not a workaround.
  ingestBuffered(chunk: Buffer): void {
    this.ingest(chunk)
  }

  private ingest(chunk: Buffer): void {
    this.buffer.append(chunk)
    for (;;) {
      let msg: JSONRPCMessage | null
      try { msg = this.buffer.readMessage() } catch (e) { this.onerror?.(e as Error); break }
      if (!msg) break
      this.onmessage?.(msg)
    }
  }

  send(message: JSONRPCMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      const w = this.writable
      if (!w || !(w as NodeJS.WritableStream & { writable?: boolean }).writable) {
        return reject(new Error('mcp stream not writable'))
      }
      if (w.write(serializeMessage(message))) resolve()
      else w.once('drain', () => resolve())
    })
  }

  // Closing the protocol never kills what produced the streams — process and socket lifecycle
  // belong to McpManager.stop() and to the pipe server respectively.
  async close(): Promise<void> {
    this.buffer.clear()
    this.onclose?.()
  }
}

export class ChildProcessTransport extends StreamTransport {
  constructor(private child: ChildProcess) { super(child.stdout, child.stdin) }

  async start(): Promise<void> {
    await super.start()
    this.child.on('exit', () => this.onclose?.())
    this.child.on('error', (e) => this.onerror?.(e))
  }
}
