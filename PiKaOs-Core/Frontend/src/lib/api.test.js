import { it, expect, vi, beforeEach } from 'vitest';

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

it('falls back to the setToken() bootstrap token when the desktop provider has none', async () => {
  // Desktop kernel-only bootstrap: the setup-code flow stores its token via setToken(), but the
  // SessionBroker-backed provider has no session yet (no login). The request must still carry the
  // bootstrap token — otherwise GET /api/setup/status comes back bootstrapAuthorized:false and the
  // FirstRun screen never advances to the KernelOnlyShell.
  const api = await import('./api.js');
  const get = vi.fn().mockResolvedValue(null);   // provider empty: no logged-in session
  api.configureTransport({ apiBase: 'https://be.example', tokenProvider: { get, refresh: vi.fn() } });
  api.setToken('BOOTSTRAP_1');

  const fetchMock = vi.fn().mockResolvedValue({ status: 200, ok: true, text: async () => '{"needsSetup":true,"bootstrapAuthorized":true}' });
  vi.stubGlobal('fetch', fetchMock);

  await api.setupStatus();
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe('Bearer BOOTSTRAP_1');
});
