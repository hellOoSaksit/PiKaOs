import { createConnection } from 'node:net'
import { createReadStream } from 'node:fs'
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

// Wires the shim to stdio + the local pipe, given the argv the process was started with. Extracted
// into a function (this file used to run this at import time as its own build entry, spawned as
// plain Node) so the packaged app can run it in-process from the argv branch in main/index.ts
// instead of shipping a second compiled entry point that could drift from that wiring — see the
// electron-builder.yml runAsNode fuse note there for why a separate Node-spawned entry no longer
// works in a packaged build.
//
// `writeOut` is the frame sink — the ONLY thing allowed to reach the client's actual stdout.
// index.ts's shim branch repoints process.stdout.write at stderr (so nothing else in the process can
// corrupt a JSON-RPC frame) and passes in the real, pre-captured write function here. Defaults to a
// plain process.stdout.write for callers (tests) that never touched that redirection.
export function runShim(argv: string[], writeOut: (chunk: string) => void = (s) => { process.stdout.write(s) }): void {
  const i = argv.indexOf('--handshake')
  const handshakePath = i >= 0 ? argv[i + 1] : ''
  if (!handshakePath) { process.stderr.write('pikaos-mcp: --handshake <path> is required\n'); process.exit(2) }

  const shim = new Shim(
    (m) => writeOut(serializeMessage(m)),
    () => socketLink(handshakePath),
  )
  const buffer = new ReadBuffer()

  // Read the client's frames off fd 0 directly instead of process.stdin. Measured live UAT fact
  // (2026-07-27, both dist\win-unpacked\PiKaOs Desktop.exe and dev electron.exe, stdio piped from a
  // parent): in an Electron main process on Windows, process.stdin is EOF from the very first tick —
  // 'data' never fires, 'end'/'close' fire immediately, even though process.stdin.readable reports
  // true and isTTY is undefined. The underlying fd is fine — fs.createReadStream(null, { fd: 0 })
  // received the parent's bytes intact in the same process. So this MUST stay reading raw fd 0; do
  // not "simplify" it back to process.stdin, that silently drops every byte the client sends (in dev
  // Electron too — it is not packaging-specific). autoClose: false because fd 0 is not ours to close.
  const stdin = createReadStream(null as unknown as string, { fd: 0, autoClose: false })
  stdin.on('data', (chunk: string | Buffer) => {
    // No encoding is set on this stream, so it always emits Buffer at runtime; the string half of
    // the type is only there for streams that opt into one.
    buffer.append(chunk as Buffer)
    for (;;) {
      let m: JSONRPCMessage | null
      try { m = buffer.readMessage() } catch { return }
      if (!m) break
      shim.fromClient(m)
    }
  })
  // The client going away must exit 0 with nothing left running, same as process.stdin's 'close' did
  // before. A stream can end without a prompt 'close' on a half-close (the writer shut its end but
  // the fd itself is still open), so both are wired to the same exit — process.exit() runs at most
  // once in practice since the process is gone after the first call.
  stdin.on('end', () => process.exit(0))
  stdin.on('close', () => process.exit(0))
  // fd 0 going bad (e.g. the parent's pipe torn down mid-read) is a stdin fault, not a JSON-RPC one —
  // it must never be written to stdout, which is the frame channel.
  stdin.on('error', (err) => {
    process.stderr.write(`pikaos-mcp: stdin read error: ${err?.stack ?? err}\n`)
    process.exit(1)
  })
  shim.start()
}
