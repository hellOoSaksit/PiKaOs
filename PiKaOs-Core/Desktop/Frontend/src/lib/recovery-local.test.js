import { it, expect } from 'vitest';
import { BOOT_PREFIX, countLocalItems, clearBootCache, clearUiState } from './recovery-local.js';

// Minimal Web-Storage fake: enough surface for the helpers (length/key/removeItem/clear).
function fakeStorage(obj) {
  const m = new Map(Object.entries(obj));
  return {
    get length() { return m.size; },
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => m.delete(k),
    clear: () => m.clear(),
    has: (k) => m.has(k),
  };
}

it('counts boot-cache keys separately from ui keys', () => {
  const s = fakeStorage({ [BOOT_PREFIX + 'srv-a']: 'h1', 'guild-theme': 'pro', 'guild-lex': 'en' });
  expect(countLocalItems(s)).toEqual({ boot: 1, ui: 2 });
});

it('clearBootCache removes only boot keys', () => {
  const s = fakeStorage({ [BOOT_PREFIX + 'srv-a']: 'h1', 'guild-theme': 'pro' });
  clearBootCache(s);
  expect(s.has(BOOT_PREFIX + 'srv-a')).toBe(false);
  expect(s.has('guild-theme')).toBe(true);
});

it('clearUiState removes everything except boot keys and clears sessionStorage', () => {
  const local = fakeStorage({ [BOOT_PREFIX + 'srv-a']: 'h1', 'guild-theme': 'pro', 'guild-lex': 'en' });
  const session = fakeStorage({ 'pikaos.forceConnect': '1' });
  clearUiState(local, session);
  expect(local.has(BOOT_PREFIX + 'srv-a')).toBe(true);   // boot cache is its own item
  expect(local.length).toBe(1);
  expect(session.length).toBe(0);
});
