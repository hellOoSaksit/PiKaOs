import { createConnection } from 'node:net'
import { ReadBuffer, serializeMessage } from '@modelcontextprotocol/sdk/shared/stdio.js'
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js'
import { readHandshake } from '../main/gateway/handshake'
import { Shim, type Link } from './shim'

function socketLink(handshakePath: string): Promise<Link> {
  // Re-read on EVERY attempt: the token rotates when the app restarts, and re-reading is what lets
  // a restarted app be picked up without the client restarting too.
  const { pipe, token } = readHandshake(handshakePath)
  return new Promise((resolve, reject) => {
    const sock = createConnection(pipe)
    sock.once('error', reject)
    sock.once('connect', () => {
      sock.off('error', reject)
      sock.write(token + '\n')
      const buffer = new ReadBuffer()
      let onMessage: (m: JSONRPCMessage) => void = () => {}
      let onClose: () => void = () => {}
      sock.on('data', (chunk: Buffer) => {
        buffer.append(chunk)
        for (;;) {
          let m: JSONRPCMessage | null
          try { m = buffer.readMessage() } catch { return sock.destroy() }
          if (!m) break
          onMessage(m)
        }
      })
      sock.once('close', () => onClose())
      sock.on('error', () => sock.destroy())
      resolve({
        send: (m) => { sock.write(serializeMessage(m)) },
        onMessage: (cb) => { onMessage = cb },
        onClose: (cb) => { onClose = cb },
      })
    })
  })
}

const i = process.argv.indexOf('--handshake')
const handshakePath = i >= 0 ? process.argv[i + 1] : ''
if (!handshakePath) { process.stderr.write('pikaos-mcp: --handshake <path> is required\n'); process.exit(2) }

const shim = new Shim(
  (m) => process.stdout.write(serializeMessage(m)),
  () => socketLink(handshakePath),
)
const buffer = new ReadBuffer()
process.stdin.on('data', (chunk: Buffer) => {
  buffer.append(chunk)
  for (;;) {
    let m: JSONRPCMessage | null
    try { m = buffer.readMessage() } catch { return }
    if (!m) break
    shim.fromClient(m)
  }
})
process.stdin.on('close', () => process.exit(0))   // the client killed us; leave nothing running
shim.start()
