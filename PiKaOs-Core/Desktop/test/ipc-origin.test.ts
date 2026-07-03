import { it, expect, vi, beforeEach, afterEach } from 'vitest'

// ipc.ts imports ipcMain at module top-level (for registerIpc's handle() calls), but okOrigin
// itself never touches it — a no-op stub is enough to import the module and exercise the guard
// in isolation, without pulling in the full Electron runtime.
vi.mock('electron', () => ({ ipcMain: { handle: vi.fn() } }))

const origDevUrl = process.env.VITE_DEV_SERVER_URL

beforeEach(() => { delete process.env.VITE_DEV_SERVER_URL })
afterEach(() => { if (origDevUrl) process.env.VITE_DEV_SERVER_URL = origDevUrl; else delete process.env.VITE_DEV_SERVER_URL })

const fakeEvent = (url: string) => ({ senderFrame: { url } } as any)

it('passes the exact app://pikaos origin', async () => {
  const { okOrigin } = await import('../src/main/ipc')
  expect(okOrigin(fakeEvent('app://pikaos/index.html'))).toBe(true)
})

it('rejects a lookalike host (app://pikaosevil) — startsWith would wrongly pass this (F5)', async () => {
  const { okOrigin } = await import('../src/main/ipc')
  expect(okOrigin(fakeEvent('app://pikaosevil/index.html'))).toBe(false)
})

it('rejects an unrelated origin', async () => {
  const { okOrigin } = await import('../src/main/ipc')
  expect(okOrigin(fakeEvent('http://evil.com/'))).toBe(false)
})

it('passes the dev server origin only when VITE_DEV_SERVER_URL is set to match', async () => {
  process.env.VITE_DEV_SERVER_URL = 'http://localhost:5173'
  const { okOrigin } = await import('../src/main/ipc')
  expect(okOrigin(fakeEvent('http://localhost:5173/'))).toBe(true)
  expect(okOrigin(fakeEvent('http://localhost:9999/'))).toBe(false)
})
