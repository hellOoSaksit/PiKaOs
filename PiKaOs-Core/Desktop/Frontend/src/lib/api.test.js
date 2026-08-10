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

// The version picker and the plain Update button share ONE endpoint — the difference is entirely
// whether a body is sent. Asserting the body (not just the URL) is what separates them: a helper that
// always sent `{tag: undefined}` would still hit the right path and still look green on a URL check,
// while pinning the update to whatever tag the picker last held.
it('updatePlugin sends the chosen tag, and sends no body at all without one', async () => {
  const api = await import('./api.js');
  api.configureTransport({ apiBase: 'https://be.example', tokenProvider: { get: vi.fn().mockResolvedValue('T'), refresh: vi.fn() } });
  const fetchMock = vi.fn().mockResolvedValue({ status: 200, ok: true, text: async () => '{}' });
  vi.stubGlobal('fetch', fetchMock);

  await api.updatePlugin('crm', 'v1.0.0');
  expect(fetchMock.mock.calls[0][0]).toBe('https://be.example/plugins/crm/update');
  expect(fetchMock.mock.calls[0][1].method).toBe('POST');
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ tag: 'v1.0.0' });

  await api.updatePlugin('crm');
  expect(fetchMock.mock.calls[1][1].body).toBeUndefined();
  // no body ⇒ no JSON content-type either; the route's `body: UpdateIn | None` default is what applies
  expect(fetchMock.mock.calls[1][1].headers['Content-Type']).toBeUndefined();
});

it('listPluginVersions reads the versions route', async () => {
  const api = await import('./api.js');
  api.configureTransport({ apiBase: 'https://be.example', tokenProvider: { get: vi.fn().mockResolvedValue('T'), refresh: vi.fn() } });
  const fetchMock = vi.fn().mockResolvedValue({ status: 200, ok: true, text: async () => '{"versions":[{"tag":"v1.0.0","current":true}]}' });
  vi.stubGlobal('fetch', fetchMock);

  const data = await api.listPluginVersions('crm');
  expect(fetchMock.mock.calls[0][0]).toBe('https://be.example/plugins/crm/versions');
  expect(data.versions[0].tag).toBe('v1.0.0');
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
