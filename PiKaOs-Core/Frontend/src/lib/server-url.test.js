import { it, expect, vi } from 'vitest';
import { normalizeServerInput, probeServer } from './server-url.js';

it('bare private IP gets http + the /api base', () => {
  expect(normalizeServerInput(' 192.168.1.50:8000 ')).toEqual({ url: 'http://192.168.1.50:8000/api', plainHttp: true });
});

it('bare public hostname gets https + the /api base', () => {
  expect(normalizeServerInput('pikaos.example.com')).toEqual({ url: 'https://pikaos.example.com/api', plainHttp: false });
});

it('keeps an explicit /api and strips trailing slashes', () => {
  expect(normalizeServerInput('https://x.example/api/').url).toBe('https://x.example/api');
  expect(normalizeServerInput('https://x.example/pikaos').url).toBe('https://x.example/pikaos/api');
});

it('loopback http carries no plain-http warning', () => {
  expect(normalizeServerInput('127.0.0.1:8000').plainHttp).toBe(false);
  expect(normalizeServerInput('localhost:8000').plainHttp).toBe(false);
});

it('VPN-overlay range (Tailscale 100.64.0.0/10) rides http, with the warning', () => {
  expect(normalizeServerInput('100.101.1.2:8000')).toEqual({ url: 'http://100.101.1.2:8000/api', plainHttp: true });
});

it('explicit http on a public host is rejected', () => {
  expect(() => normalizeServerInput('http://evil.com')).toThrow('http_not_allowed');
});

it('a lookalike host never gets http by default (exact-host parse)', () => {
  expect(normalizeServerInput('127.0.0.1.evil.com').url).toBe('https://127.0.0.1.evil.com/api');
});

it('empty and garbage inputs throw their error keys', () => {
  expect(() => normalizeServerInput('   ')).toThrow('empty');
  expect(() => normalizeServerInput('http://')).toThrow('invalid');
});

it('probeServer: true on 200 JSON (kernel "degraded" counts), false on error', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ status: 'degraded' }) }));
  expect(await probeServer('http://127.0.0.1:8000/api')).toBe(true);
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, json: async () => ({}) }));
  expect(await probeServer('http://127.0.0.1:8000/api')).toBe(false);
  vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('refused')));
  expect(await probeServer('http://127.0.0.1:8000/api')).toBe(false);
});
