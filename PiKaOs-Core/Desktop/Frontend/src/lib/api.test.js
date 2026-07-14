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

it('desktop logout clears the in-memory bootstrap token so it cannot resurface as a fallback', async () => {
  // Regression: token mode used to `return` before setToken(null), so the setup-code bootstrap
  // token lingered — after logout, raw()'s provider-null fallback re-sent it as `Bearer <bootstrap>`.
  const api = await import('./api.js');
  const authLogout = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal('window', { pikaosDesktop: { auth: { logout: authLogout } } });
  api.configureTransport({ apiBase: 'https://be.example', tokenProvider: { get: vi.fn().mockResolvedValue(null), refresh: vi.fn() } });
  api.setToken('BOOTSTRAP_1');

  await api.logout();
  expect(authLogout).toHaveBeenCalledOnce();
  expect(api.getToken()).toBe(null);

  // a follow-up authed request (provider still empty) must NOT carry the stale bootstrap token
  const fetchMock = vi.fn().mockResolvedValue({ status: 200, ok: true, text: async () => '{}' });
  vi.stubGlobal('fetch', fetchMock);
  await api.setupStatus();
  expect(fetchMock.mock.calls[0][1].headers.Authorization).toBeUndefined();
});

it('desktop login drops any leftover bootstrap token (the provider becomes the only source)', async () => {
  const api = await import('./api.js');
  const authLogin = vi.fn().mockResolvedValue({ user: { id: 'u1' } });
  vi.stubGlobal('window', { pikaosDesktop: { auth: { login: authLogin } } });
  api.configureTransport({ apiBase: 'https://be.example', tokenProvider: { get: vi.fn().mockResolvedValue(null), refresh: vi.fn() } });
  api.setToken('BOOTSTRAP_1');

  const user = await api.login('someone', 'pw');
  expect(user).toEqual({ id: 'u1' });
  expect(api.getToken()).toBe(null);
});
