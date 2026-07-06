import { describe, it, expect, vi } from 'vitest'
import { SessionBroker } from '../src/main/session-broker'

const vaultDouble = () => { const m = new Map<string,string>(); return { isAvailable:()=>true, get:(k:string)=>m.get(k)??null, set:(k:string,v:string)=>{m.set(k,v)}, delete:(k:string)=>{m.delete(k)} } as any }

it('login stores refresh in vault and caches access in memory', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: { accessToken: 'A1', expiresIn: 900 }, user: { id: 'u1' }, refreshToken: 'R1' }) })
  vi.stubGlobal('fetch', fetchMock)
  const vault = vaultDouble()
  const b = new SessionBroker(vault, () => 'https://be')
  const { user } = await b.login('me', 'pw')
  expect(user).toEqual({ id: 'u1' })
  expect(vault.get('auth.refresh')).toBe('R1')
  expect(fetchMock.mock.calls[0][1].headers['X-Client-Mode']).toBe('token')
  expect(await b.getAccessToken()).toBe('A1')      // served from memory, no extra fetch
  expect(fetchMock).toHaveBeenCalledOnce()
})

it('getAccessToken refreshes with the stored refresh token when expired', async () => {
  const vault = vaultDouble(); vault.set('auth.refresh', 'R1')
  const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ token: { accessToken: 'A2', expiresIn: 900 }, user: {}, refreshToken: 'R2' }) })
  vi.stubGlobal('fetch', fetchMock)
  const b = new SessionBroker(vault, () => 'https://be')
  const tok = await b.getAccessToken()
  expect(tok).toBe('A2')
  expect(fetchMock.mock.calls[0][0]).toBe('https://be/auth/refresh')
  expect(fetchMock.mock.calls[0][1].headers['X-Refresh-Token']).toBe('R1')
  expect(vault.get('auth.refresh')).toBe('R2')      // rotated
})

it('refresh failure deletes the vault key and returns null', async () => {
  const vault = vaultDouble(); vault.set('auth.refresh', 'R1')
  const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) })
  vi.stubGlobal('fetch', fetchMock)
  const b = new SessionBroker(vault, () => 'https://be')
  expect(await b.getAccessToken()).toBeNull()
  expect(vault.get('auth.refresh')).toBeNull()        // vault key deleted, no stale access
  expect(await b.getAccessToken()).toBeNull()          // no refresh token left, no extra fetch
  expect(fetchMock).toHaveBeenCalledOnce()
})
