import { it, expect, vi } from 'vitest'
import { PassThrough } from 'node:stream'
import { StreamTransport } from '../src/main/mcp/transport'

it('reads newline-delimited JSON-RPC off the readable and writes it to the writable', async () => {
  const inbound = new PassThrough()
  const outbound = new PassThrough()
  const t = new StreamTransport(inbound, outbound)
  const seen: any[] = []
  t.onmessage = (m) => seen.push(m)
  await t.start()

  inbound.write(JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }) + '\n')
  await new Promise(r => setImmediate(r))
  expect(seen).toEqual([{ jsonrpc: '2.0', id: 1, method: 'ping' }])

  const written = new Promise<string>(r => outbound.once('data', (c: Buffer) => r(c.toString())))
  await t.send({ jsonrpc: '2.0', id: 1, result: {} } as any)
  expect(JSON.parse(await written)).toEqual({ jsonrpc: '2.0', id: 1, result: {} })
})

it('rejects send() when the writable is missing', async () => {
  const t = new StreamTransport(new PassThrough(), null)
  await expect(t.send({ jsonrpc: '2.0', id: 1, result: {} } as any)).rejects.toThrow()
})

it('close() clears the buffer and fires onclose', async () => {
  const t = new StreamTransport(new PassThrough(), new PassThrough())
  const onclose = vi.fn()
  t.onclose = onclose
  await t.start()
  await t.close()
  expect(onclose).toHaveBeenCalledTimes(1)
})
