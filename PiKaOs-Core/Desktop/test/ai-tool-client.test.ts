import { it, expect, vi, beforeEach } from 'vitest'
import { ToolClient } from '../src/main/ai/toolClient'

const fetchMock = vi.fn()
beforeEach(() => { fetchMock.mockReset(); vi.stubGlobal('fetch', fetchMock) })
const BASE = () => 'http://127.0.0.1:8000/api'

it('list(): GETs /mcp/tools with Bearer when a token exists', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ tools: [{ name: 't', description: '', input_schema: {}, effect: 'read' }] }), { status: 200 }))
  const c = new ToolClient(async () => 'tok123', BASE)
  expect(await c.list()).toHaveLength(1)
  const [url, init] = fetchMock.mock.calls[0]
  expect(String(url)).toBe('http://127.0.0.1:8000/api/mcp/tools')
  expect(init.headers.authorization).toBe('Bearer tok123')
})

it('list(): open mode (null token) sends NO Authorization header at all', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ tools: [] }), { status: 200 }))
  await new ToolClient(async () => null, BASE).list()
  expect(fetchMock.mock.calls[0][1].headers.authorization).toBeUndefined()
})

it('call(): 403 is returned as data, not thrown (loop feeds it back to the model)', async () => {
  fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: 'forbidden' }), { status: 403 }))
  const r = await new ToolClient(async () => 'tok', BASE).call('pikaos.x', { a: 1 })
  expect(r.status).toBe(403)
  expect(r.result).toEqual({ detail: 'forbidden' })
  const [url, init] = fetchMock.mock.calls[0]
  expect(String(url)).toBe('http://127.0.0.1:8000/api/mcp/call')
  expect(JSON.parse(init.body)).toEqual({ name: 'pikaos.x', arguments: { a: 1 } })
})

it('call(): 5xx throws (server fault is not model feedback)', async () => {
  fetchMock.mockResolvedValue(new Response('boom', { status: 500 }))
  await expect(new ToolClient(async () => null, BASE).call('t', {})).rejects.toThrow(/500/)
})
