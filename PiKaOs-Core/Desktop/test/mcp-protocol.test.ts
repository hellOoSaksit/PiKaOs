import { it, expect, vi } from 'vitest'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { McpManager } from '../src/main/mcp/manager'
import { McpRegistry } from '../src/main/mcp/registry'

// A real MCP server on real pipes: answers initialize / tools/list / tools/call over
// newline-delimited JSON-RPC on stdio. Notifications (no id) get no reply, per spec.
const FAKE_SERVER = `
const rl = require('node:readline').createInterface({ input: process.stdin });
const reply = (id, result) => process.stdout.write(JSON.stringify({ jsonrpc: '2.0', id, result }) + '\\n');
rl.on('line', (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);
  if (msg.id === undefined) return;
  if (msg.method === 'initialize') reply(msg.id, {
    protocolVersion: msg.params.protocolVersion,
    capabilities: { tools: {} },
    serverInfo: { name: 'fake-mcp', version: '1.0.0' },
  });
  else if (msg.method === 'tools/list') reply(msg.id, {
    tools: [{ name: 'echo', description: 'Echoes text back',
              inputSchema: { type: 'object', properties: { text: { type: 'string' } }, required: ['text'] } }],
  });
  else if (msg.method === 'tools/call') reply(msg.id, {
    content: [{ type: 'text', text: 'echo:' + msg.params.arguments.text }],
  });
});
`

const mkManager = () => {
  const dir = mkdtempSync(join(tmpdir(), 'mcp-proto-'))
  const reg = new McpRegistry(join(dir, 'mcp.json'))
  reg.add({ id: 'fake', label: 'Fake', command: process.execPath, args: ['-e', FAKE_SERVER] })
  const vault = { get: () => null, set: vi.fn(), delete: vi.fn(), isAvailable: () => true } as any
  return new McpManager(reg, vault, vi.fn().mockResolvedValue(true), join(dir, 'approvals.json'))
}

const untilStatus = (mgr: McpManager, id: string, want: string, ms = 8000) =>
  new Promise<void>((resolve, reject) => {
    if (mgr.status(id) === want) return resolve()
    const t = setTimeout(() => reject(new Error(`never reached ${want}, at ${mgr.status(id)}`)), ms)
    mgr.on('status', (sid: string, s: string) => { if (sid === id && s === want) { clearTimeout(t); resolve() } })
  })

it('handshakes a real server: ready means initialize + tools/list answered', async () => {
  const mgr = mkManager()
  await mgr.start('fake')
  await untilStatus(mgr, 'fake', 'ready')
  expect(mgr.tools('fake')).toMatchObject([{ name: 'echo' }])
  await mgr.stop('fake')
}, 15000)

it('calls a tool over the wire and returns its result', async () => {
  const mgr = mkManager()
  await mgr.start('fake')
  await untilStatus(mgr, 'fake', 'ready')
  const res: any = await mgr.callTool('fake', 'echo', { text: 'hi' })
  expect(res.content).toEqual([{ type: 'text', text: 'echo:hi' }])
  await mgr.stop('fake')
}, 15000)

it('stop() is graceful: cache cleared, status stopped', async () => {
  const mgr = mkManager()
  await mgr.start('fake')
  await untilStatus(mgr, 'fake', 'ready')
  await mgr.stop('fake')
  expect(mgr.status('fake')).toBe('stopped')
  expect(mgr.tools('fake')).toEqual([])
}, 15000)
