import type { ChildProcess } from 'node:child_process'
import { ReadBuffer, serializeMessage } from '@modelcontextprotocol/sdk/shared/stdio.js'
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js'
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'

// The SDK's StdioClientTransport spawns the child itself — but OUR spawn is where the consent
// gate + vault namespacing live (manager.ts), so this transport attaches to an already-spawned
// child instead. Framing is the SDK's (ReadBuffer/serializeMessage), never hand-rolled.
export class ChildProcessTransport implements Transport {
  onclose?: () => void
  onerror?: (error: Error) => void
  onmessage?: (message: JSONRPCMessage) => void
  private buffer = new ReadBuffer()

  constructor(private child: ChildProcess) {}

  async start(): Promise<void> {
    this.child.stdout?.on('data', (chunk: Buffer) => {
      this.buffer.append(chunk)
      for (;;) {
        let msg: JSONRPCMessage | null
        try { msg = this.buffer.readMessage() } catch (e) { this.onerror?.(e as Error); break }
        if (!msg) break
        this.onmessage?.(msg)
      }
    })
    this.child.on('exit', () => this.onclose?.())
    this.child.on('error', (e) => this.onerror?.(e))
  }

  send(message: JSONRPCMessage): Promise<void> {
    return new Promise((resolve, reject) => {
      const stdin = this.child.stdin
      if (!stdin || !stdin.writable) return reject(new Error('mcp child stdin not writable'))
      if (stdin.write(serializeMessage(message))) resolve()
      else stdin.once('drain', () => resolve())
    })
  }

  // Closing the protocol never kills the child — process lifecycle belongs to McpManager.stop().
  async close(): Promise<void> {
    this.buffer.clear()
    this.onclose?.()
  }
}
