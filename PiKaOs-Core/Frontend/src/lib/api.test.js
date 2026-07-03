import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => { vi.resetModules(); });

it('uses the injected token provider for Authorization + refresh', async () => {
  const api = await import('./api.js');
  const get = vi.fn().mockResolvedValue('ACCESS_1');
  const refresh = vi.fn().mockResolvedValue(true);
  api.configureTransport({ apiBase: 'https://be.example', tokenProvider: { get, refresh } });

  const fetchMock = vi.fn()
    .mockResolvedValueOnce({ status: 401, ok: false, text: async () => '' })   // first: expired
    .mockResolvedValueOnce({ status: 200, ok: true, text: async () => '{"ok":true}' });
  vi.stubGlobal('fetch', fetchMock);

  const data = await api.me();
  expect(refresh).toHaveBeenCalledOnce();
  expect(fetchMock.mock.calls[0][0]).toBe('https://be.example/auth/me');
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer ACCESS_1');
  expect(fetchMock.mock.calls[0][1].credentials).toBeUndefined();   // no cookies in token mode
  expect(data).toEqual({ ok: true });
});
