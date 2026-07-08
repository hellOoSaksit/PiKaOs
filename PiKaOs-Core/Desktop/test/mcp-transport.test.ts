import { it, expect, vi } from 'vitest'
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
import { ChildProcessTransport } from '../src/main/mcp/transport'

const fakeChild = () =>
  Object.assign(new EventEmitter(), { stdin: new PassThrough(), stdout: new PassThrough() }) as any

it('parses newline-delimited JSON-RPC from stdout into onmessage', async () => {
  const child = fakeChild()
  const t = new ChildProcessTransport(child)
  const got: any[] = []
  t.onmessage = (m) => got.push(m)
  await t.start()
  child.stdout.write('{"jsonrpc":"2.0","id":1,"result":{}}\n{"jsonrpc":"2.0","id":2,"result":{"ok":true}}\n')
  await new Promise(r => setImmediate(r))
  expect(got).toEqual([
    { jsonrpc: '2.0', id: 1, result: {} },
    { jsonrpc: '2.0', id: 2, result: { ok: true } },
  ])
})

it('serializes outbound messages to stdin with newline framing', async () => {
  const child = fakeChild()
  const t = new ChildProcessTransport(child)
  await t.start()
  await t.send({ jsonrpc: '2.0', id: 1, method: 'ping' } as any)
  expect(child.stdin.read().toString()).toBe('{"jsonrpc":"2.0","id":1,"method":"ping"}\n')
})

it('fires onclose when the child exits', async () => {
  const child = fakeChild()
  const t = new ChildProcessTransport(child)
  const closed = vi.fn()
  t.onclose = closed
  await t.start()
  child.emit('exit', 0)
  expect(closed).toHaveBeenCalledOnce()
})
