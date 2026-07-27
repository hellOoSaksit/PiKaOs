import { it, expect, vi } from 'vitest'
import { PassThrough } from 'node:stream'
import { createGatewayServer, type GatewayDeps } from '../src/main/gateway/server'
import { StreamTransport } from '../src/main/mcp/transport'
import type { CatalogTool } from '../src/main/ai/toolClient'

const TOOL = (name: string, effect: CatalogTool['effect'] = 'read'): CatalogTool =>
  ({ name, description: 'd', input_schema: { type: 'object', properties: {} }, effect })

// Drive the gateway the way a real client does — over a transport, completing the handshake first.
// Reaching into the SDK's private handler map would test the same behaviour, but a rename inside
// the SDK would then break these tests in a way that says nothing about our code.
async function client(deps: GatewayDeps) {
  const toServer = new PassThrough(), fromServer = new PassThrough()
  const replies = new Map<number, (v: any) => void>()
  let buf = ''
  fromServer.on('data', (c: Buffer) => {
    buf += c.toString()
    for (;;) {
      const nl = buf.indexOf('\n')
      if (nl < 0) break
      const msg = JSON.parse(buf.slice(0, nl)); buf = buf.slice(nl + 1)
      if (msg.id !== undefined) replies.get(msg.id)?.(msg)
    }
  })
  await createGatewayServer(deps).connect(new StreamTransport(toServer, fromServer))

  let id = 0
  const send = (method: string, params: unknown) => new Promise<any>(res => {
    const mine = ++id
    replies.set(mine, res)
    toServer.write(JSON.stringify({ jsonrpc: '2.0', id: mine, method, params }) + '\n')
  })

  await send('initialize', {
    protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' },
  })
  toServer.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
  await new Promise(r => setImmediate(r))
  return { send }
}

it('tools/list maps the catalog onto MCP tools and never filters by permission', async () => {
  const listTools = vi.fn().mockResolvedValue([TOOL('pikaos.core.storage_status')])
  const c = await client({ listTools, callTool: vi.fn(), consent: vi.fn() })
  const { result } = await c.send('tools/list', {})
  expect(result.tools).toEqual([{
    name: 'pikaos.core.storage_status', description: 'd',
    inputSchema: { type: 'object', properties: {} },
  }])
})

it('tools/call passes the tool through the consent gate and forwards the arguments', async () => {
  const consent = vi.fn().mockResolvedValue(true)
  const callTool = vi.fn().mockResolvedValue({ status: 200, result: { ok: true } })
  const c = await client({ listTools: async () => [TOOL('t', 'side_effect')], callTool, consent })
  const { result } = await c.send('tools/call', { name: 't', arguments: { a: 1 } })
  expect(consent).toHaveBeenCalledWith(expect.objectContaining({ name: 't', effect: 'side_effect' }))
  expect(callTool).toHaveBeenCalledWith('t', { a: 1 })
  expect(result.isError).toBe(false)
})

it('a declined consent returns a tool error and never reaches the backend', async () => {
  const callTool = vi.fn()
  const c = await client({
    listTools: async () => [TOOL('t', 'side_effect')], callTool, consent: async () => false,
  })
  const { result } = await c.send('tools/call', { name: 't', arguments: {} })
  expect(result.isError).toBe(true)
  expect(callTool).not.toHaveBeenCalled()
})

it('an unknown tool is an error, and a 4xx from the backend is surfaced as a tool error', async () => {
  const c = await client({
    listTools: async () => [TOOL('t')],
    callTool: async () => ({ status: 403, result: { detail: 'forbidden' } }),
    consent: async () => true,
  })
  expect((await c.send('tools/call', { name: 'nope', arguments: {} })).result.isError).toBe(true)
  expect((await c.send('tools/call', { name: 't', arguments: {} })).result.isError).toBe(true)
})

it('a rejected callTool is surfaced as a generic tool error, not the thrown fault text', async () => {
  const callTool = vi.fn().mockRejectedValue(new Error('mcp/call 500'))
  const c = await client({ listTools: async () => [TOOL('t')], callTool, consent: async () => true })
  const { result } = await c.send('tools/call', { name: 't', arguments: {} })
  expect(result.isError).toBe(true)
  expect(result.content[0].text).not.toContain('mcp/call')
  expect(result.content[0].text).not.toContain('500')
})

it('a rejected consent is surfaced as a generic tool error, not the thrown fault text', async () => {
  // makeConsent (src/main/consent/gate.ts) does an unguarded writeFileSync after an approval; if that
  // throws (disk full, permission denied, path gone) the message contains the real approvals-file path.
  const consent = vi.fn().mockRejectedValue(
    new Error("EACCES: permission denied, open 'C:\\Users\\pika\\AppData\\Roaming\\PiKaOs\\mcp-approvals.json'")
  )
  const c = await client({ listTools: async () => [TOOL('t', 'side_effect')], callTool: vi.fn(), consent })
  const { result } = await c.send('tools/call', { name: 't', arguments: {} })
  expect(result.isError).toBe(true)
  expect(result.content[0].text).not.toContain('mcp-approvals.json')
  expect(result.content[0].text).not.toContain('AppData')
  expect(result.content[0].text).not.toContain('EACCES')
})

it('a rejected inner listTools during tools/call is surfaced as a generic tool error', async () => {
  const listTools = vi.fn().mockRejectedValue(new Error('mcp/tools 500'))
  const c = await client({ listTools, callTool: vi.fn(), consent: vi.fn() })
  const { result } = await c.send('tools/call', { name: 't', arguments: {} })
  expect(result.isError).toBe(true)
  expect(result.content[0].text).not.toContain('mcp/tools')
  expect(result.content[0].text).not.toContain('500')
})

it('a rejected listTools during tools/list surfaces a sanitized protocol error', async () => {
  const listTools = vi.fn().mockRejectedValue(new Error('mcp/tools 500'))
  const c = await client({ listTools, callTool: vi.fn(), consent: vi.fn() })
  const response = await c.send('tools/list', {})
  expect(response.error).toBeDefined()
  expect(response.error.message).not.toContain('mcp/tools')
  expect(response.error.message).not.toContain('500')
})
