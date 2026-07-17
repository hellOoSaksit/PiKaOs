import { it, expect } from 'vitest';
import { activePluginIds, authoritativePluginIds, isPluginUiActive, filterPluginNav } from './plugin-gate.js';

// route id -> owning plugin id, the shape the plugin barrel exports (PLUGIN_ROUTE_OWNERS)
const OWNERS = { admin: 'auth', permissions: 'auth', roles: 'auth', audit: 'auth', codex: 'knowledge' };

it('activePluginIds reads the /capabilities plugin list (server pre-filters to active)', () => {
  const caps = { v: 1, authMode: 'open', plugins: [
    { id: 'auth', version: '0.1.0', frontend: null }, { id: 'postgres', version: '0.1.0', frontend: null },
  ] };
  expect(activePluginIds(caps)).toEqual(new Set(['auth', 'postgres']));
});

it('activePluginIds defensively drops rows carrying an explicit non-active state (/health shape)', () => {
  const health = { plugins: [
    { id: 'auth', state: 'active' }, { id: 'postgres', state: 'active' },
    { id: 'mock', state: 'disabled' }, { id: 'knowledge', state: 'error' },
  ] };
  expect(activePluginIds(health)).toEqual(new Set(['auth', 'postgres']));
});

it('activePluginIds tolerates a missing/malformed payload as "nothing active"', () => {
  expect(activePluginIds(null)).toEqual(new Set());
  expect(activePluginIds(undefined)).toEqual(new Set());
  expect(activePluginIds({})).toEqual(new Set());
  expect(activePluginIds({ plugins: 'nope' })).toEqual(new Set());
});

/* --- authoritativePluginIds: which payloads may be gated on at all ---
   The server REDACTS the list (to []) for anonymous callers in production login mode — the same
   Fix-SEC-10 recon discipline that exempts bootstrap screens. So in login mode an empty list means
   "nothing runs" OR "not telling you", indistinguishable — and gating on it strips a live session's
   plugin UI, sign-out control included, with no way back. Open mode never redacts, and a non-empty
   list cannot be a redaction, so those two are the trustworthy shapes. */

it('open mode is authoritative even when the list is empty — that is the Zero server', () => {
  expect(authoritativePluginIds({ authMode: 'open', plugins: [] })).toEqual(new Set());
  expect(authoritativePluginIds({ authMode: 'open', plugins: [{ id: 'auth' }] })).toEqual(new Set(['auth']));
});

it('a non-empty list is authoritative in login mode — a redaction is always empty', () => {
  expect(authoritativePluginIds({ authMode: 'login', plugins: [{ id: 'auth' }] })).toEqual(new Set(['auth']));
});

it('an EMPTY list in login mode is not trustworthy — do not gate on it', () => {
  expect(authoritativePluginIds({ authMode: 'login', plugins: [] })).toBeNull();
  // the handshake-failed fallback App.jsx fabricates: a mode to render by, no evidence about plugins
  expect(authoritativePluginIds({ v: 0, authMode: 'login' })).toBeNull();
});

it('no payload at all is not authoritative', () => {
  expect(authoritativePluginIds(null)).toBeNull();
  expect(authoritativePluginIds(undefined)).toBeNull();
});

it('isPluginUiActive gates on an authoritative list and stands aside without one', () => {
  expect(isPluginUiActive('auth', new Set(['auth']))).toBe(true);
  expect(isPluginUiActive('auth', new Set())).toBe(false);       // server says: nothing runs
  // No list ⇒ no claim to enforce. Hiding here would trap a signed-in user in a shell whose only
  // exit (the plugin-owned sign-out control) is the thing being hidden. Never worse than no gate.
  expect(isPluginUiActive('auth', null)).toBe(true);
  expect(isPluginUiActive('auth', undefined)).toBe(true);
});

it('filterPluginNav strips items owned by an inactive plugin, keeps core items', () => {
  const nav = [
    { group: 'ผู้ดูแลระบบ', items: [
      { id: 'toolsmgr', icon: 'wrench' },
      { id: 'admin', icon: 'members', perm: 'user.view.any' },
    ] },
  ];
  const out = filterPluginNav(nav, OWNERS, new Set());
  expect(out).toEqual([{ group: 'ผู้ดูแลระบบ', items: [{ id: 'toolsmgr', icon: 'wrench' }] }]);
});

it('filterPluginNav keeps plugin items whose owner is active', () => {
  const nav = [{ group: 'g', items: [{ id: 'admin', icon: 'members' }] }];
  const out = filterPluginNav(nav, OWNERS, new Set(['auth']));
  expect(out).toEqual(nav);
});

it('filterPluginNav filters children recursively', () => {
  const nav = [{ group: 'g', items: [
    { id: 'settings', icon: 'gear', children: [
      { id: 'permissions', icon: 'security' },
      { id: 'lang', icon: 'globe' },
    ] },
  ] }];
  const out = filterPluginNav(nav, OWNERS, new Set());
  expect(out).toEqual([{ group: 'g', items: [
    { id: 'settings', icon: 'gear', children: [{ id: 'lang', icon: 'globe' }] },
  ] }]);
});

it('filterPluginNav leaves the config alone without an authoritative list', () => {
  const nav = [{ group: 'g', items: [{ id: 'admin' }, { id: 'toolsmgr' }] }];
  expect(filterPluginNav(nav, OWNERS, null)).toEqual(nav);
});

it('filterPluginNav drops a group left with no items', () => {
  const nav = [
    { group: 'auth-only', items: [{ id: 'admin' }, { id: 'audit' }] },
    { group: 'core', items: [{ id: 'home' }] },
  ];
  const out = filterPluginNav(nav, OWNERS, new Set());
  expect(out).toEqual([{ group: 'core', items: [{ id: 'home' }] }]);
});

it('filterPluginNav never mutates the input config (it is React state)', () => {
  const nav = [{ group: 'g', items: [{ id: 'home', children: [{ id: 'admin' }] }] }];
  const snapshot = JSON.parse(JSON.stringify(nav));
  filterPluginNav(nav, OWNERS, new Set());
  expect(nav).toEqual(snapshot);
});
