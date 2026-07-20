import { it, expect, vi } from 'vitest';
import { consumeRecoveryHash, RECOVERY_HASH } from './recovery-hash.js';

it('consumes #recovery: returns true and clears the hash from the address bar', () => {
  const hist = { replaceState: vi.fn() };
  const loc = { hash: RECOVERY_HASH, pathname: '/index.html', search: '' };
  expect(consumeRecoveryHash(loc, hist)).toBe(true);
  expect(hist.replaceState).toHaveBeenCalledWith(null, '', '/index.html');
});

it('keeps the query string when clearing', () => {
  const hist = { replaceState: vi.fn() };
  const loc = { hash: RECOVERY_HASH, pathname: '/index.html', search: '?x=1' };
  consumeRecoveryHash(loc, hist);
  expect(hist.replaceState).toHaveBeenCalledWith(null, '', '/index.html?x=1');
});

it('no hash / a different hash → false, URL untouched', () => {
  const hist = { replaceState: vi.fn() };
  expect(consumeRecoveryHash({ hash: '', pathname: '/', search: '' }, hist)).toBe(false);
  expect(consumeRecoveryHash({ hash: '#settings', pathname: '/', search: '' }, hist)).toBe(false);
  expect(hist.replaceState).not.toHaveBeenCalled();
});
