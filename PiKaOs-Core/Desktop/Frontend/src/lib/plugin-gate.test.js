import { it, expect } from 'vitest';
import { activePluginIds, isPluginUiActive, filterPluginNav } from './plugin-gate.js';

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

it('isPluginUiActive denies while states are unknown (null) — deny-by-default', () => {
  expect(isPluginUiActive('auth', null)).toBe(false);
  expect(isPluginUiActive('auth', new Set())).toBe(false);
  expect(isPluginUiActive('auth', new Set(['auth']))).toBe(true);
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

it('filterPluginNav filters children recursively; core items always show even while states are unknown', () => {
  const nav = [{ group: 'g', items: [
    { id: 'settings', icon: 'gear', children: [
      { id: 'permissions', icon: 'security' },
      { id: 'lang', icon: 'globe' },
    ] },
  ] }];
  const out = filterPluginNav(nav, OWNERS, null);   // states unknown → plugin items hidden, core kept
  expect(out).toEqual([{ group: 'g', items: [
    { id: 'settings', icon: 'gear', children: [{ id: 'lang', icon: 'globe' }] },
  ] }]);
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
