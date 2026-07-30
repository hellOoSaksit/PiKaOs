import { it, expect, vi } from 'vitest'
import { PassThrough } from 'node:stream'
import { Server } from '@modelcontextprotocol/sdk/server/index.js'
import { ListToolsRequestSchema, CallToolRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import { createGatewayServer, type GatewayDeps } from '../src/main/gateway/server'
import { GATEWAY_SERVER_INFO, GATEWAY_CAPABILITIES, PAIRED_METHODS } from '../src/main/gateway/protocol'
import { StreamTransport } from '../src/main/mcp/transport'
import type { CatalogTool } from '../src/main/ai/toolClient'

const TOOL = (name: string, effect: CatalogTool['effect'] = 'read'): CatalogTool =>
  ({ name, description: 'd', input_schema: { type: 'object', properties: {} }, effect })

// Drive the gateway the way a real client does — over a transport, completing the handshake first.
// Reaching into the SDK's private handler map would test the same behaviour, but a rename inside
// the SDK would then break these tests in a way that says nothing about our code.
//
// requirePaired defaults to an already-resolved gate: pairing itself is pipe.ts's job (see
// gateway-pipe.test.ts), so most tests here should behave exactly as if pairing had already
// succeeded. Tests that care about the gate pass their own controllable requirePaired.
async function client(deps: Partial<GatewayDeps>) {
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
  const full: GatewayDeps = {
    listTools: deps.listTools ?? (async () => []),
    callTool: deps.callTool ?? vi.fn(),
    consent: deps.consent ?? vi.fn(),
    requirePaired: deps.requirePaired ?? (async () => {}),
  }
  await createGatewayServer(full).connect(new StreamTransport(toServer, fromServer))

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

// E2b final-review Fix 1: pairing must gate every request, not just be a side effect of the
// initialized notification. These two tests pin that requirePaired() is awaited BEFORE deps is
// touched at all — the end-to-end "no data leaks while pairing is pending" proof lives at the pipe
// level (gateway-pipe.test.ts), since only pipe.ts owns the real socket to assert nothing was
// written to.
it('tools/list waits for requirePaired before touching the catalog', async () => {
  const listTools = vi.fn().mockResolvedValue([])
  let releasePaired!: () => void
  const requirePaired = () => new Promise<void>(res => { releasePaired = res })
  const c = await client({ listTools, requirePaired })
  const pending = c.send('tools/list', {})
  await new Promise(r => setImmediate(r))
  expect(listTools).not.toHaveBeenCalled()
  releasePaired()
  const { result } = await pending
  expect(result.tools).toEqual([])
  expect(listTools).toHaveBeenCalledTimes(1)
})

it('tools/call waits for requirePaired before touching the catalog or the backend', async () => {
  const listTools = vi.fn().mockResolvedValue([TOOL('t')])
  const callTool = vi.fn().mockResolvedValue({ status: 200, result: {} })
  let releasePaired!: () => void
  const requirePaired = () => new Promise<void>(res => { releasePaired = res })
  const c = await client({ listTools, callTool, consent: async () => true, requirePaired })
  const pending = c.send('tools/call', { name: 't', arguments: {} })
  await new Promise(r => setImmediate(r))
  expect(listTools).not.toHaveBeenCalled()
  expect(callTool).not.toHaveBeenCalled()
  releasePaired()
  await pending
  expect(callTool).toHaveBeenCalledTimes(1)
})

// The methods this file registers are, verbatim, the shim's proof rule (PAIRED_METHODS in
// gateway/protocol.ts): only an answer to a method behind requirePaired() may reset the shim's retry
// backoff. Nothing makes the two move together, so pin them. Registering a THIRD gated handler
// without adding it to the set drifts fail-SLOW — a working link judged unproven, so its client
// reconnects once a minute instead of at once — which is exactly the kind of defect no other test
// would notice.
//
// Read off setRequestHandler's own argument (public API — unlike the SDK's private handler map, which
// a rename would break for reasons that say nothing about our code) and diffed against what a bare
// Server registers for itself: Protocol's constructor installs `ping` and Server's installs
// `initialize`, neither of them ours and neither of them gated.
const methodsRegisteredBy = (make: () => Server): string[] => {
  const spy = vi.spyOn(Server.prototype, 'setRequestHandler')
  try {
    make()
    return spy.mock.calls.map(([schema]) => (schema as any).shape.method.value as string)
  } finally { spy.mockRestore() }
}

it('the handlers behind the pairing gate are exactly the methods the shim accepts as proof', () => {
  const sdkOwn = methodsRegisteredBy(
    () => new Server(GATEWAY_SERVER_INFO, { capabilities: GATEWAY_CAPABILITIES }),
  )
  const ours = methodsRegisteredBy(() => createGatewayServer({
    listTools: async () => [], callTool: vi.fn(), consent: vi.fn(), requirePaired: async () => {},
  })).filter(m => !sdkOwn.includes(m))
  // Spelled from the SDK's schemas rather than as bare strings, so a typo on either side shows up.
  expect(new Set(ours)).toEqual(new Set([
    ListToolsRequestSchema.shape.method.value, CallToolRequestSchema.shape.method.value,
  ]))
  expect(PAIRED_METHODS).toEqual(new Set(ours))
})
