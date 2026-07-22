/* The palette's guarantees, pinned:
   1. It mirrors the sidebar — what the sidebar hides is unfindable (perm/hidden/desktopOnly,
      and an invisible parent prunes its whole subtree).
   2. No language is named in code — matching runs over whatever packs exist, so adding a
      synthetic fourth language makes its labels searchable with NO code change. That is the
      requirement most likely to be quietly broken later, so it gets its own case.
   3. Ranking is deterministic: display-label prefix > any-term prefix > label contains >
      term contains; ties keep sidebar order. */
import { describe, it, expect } from 'vitest';
import { isNavVisible, buildIndex, searchIndex } from './CommandPalette.logic.js';
import en from '../../data/i18n/en-formal.json';
import th from '../../data/i18n/th-formal.json';
import ja from '../../data/i18n/ja-formal.json';

const NAVFIX = [
  { group: 'ผู้ดูแลระบบ', items: [
    { id: 'toolsmgr', icon: 'tools', perm: 'options.manage' },
    { id: 'install', icon: 'download', perm: 'plugins.manage', children: [
      { id: 'marketplace', icon: 'cart', perm: 'plugins.manage' },
      { id: 'secretpage', icon: 'lock', perm: 'top.secret', children: [
        { id: 'secretgrandchild', icon: 'view' },
      ] },
    ] },
    { id: 'mcpskill', icon: 'link', perm: 'mcp.manage', desktopOnly: true },
    { id: 'settings', icon: 'settings' },
    { id: 'ghost', icon: 'view', hidden: true, children: [{ id: 'ghostchild', icon: 'view' }] },
  ] },
];
const PACKS = {
  en: { formal: { 'nav.toolsmgr': 'Manage Tools', 'nav.install': 'Install', 'nav.marketplace': 'Marketplace', 'nav.secretpage': 'Secret', 'nav.mcpskill': 'MCP & Skills', 'nav.settings': 'Settings' } },
  th: { formal: { 'nav.toolsmgr': 'จัดการเครื่องมือ', 'nav.install': 'ติดตั้ง', 'nav.marketplace': 'มาร์เก็ตเพลส', 'nav.secretpage': 'ลับ', 'nav.mcpskill': 'MCP และทักษะ', 'nav.settings': 'ตั้งค่าระบบ' } },
};
// "current UI language" = Thai, like the real app
const label = (it) => it.customLabel || PACKS.th.formal['nav.' + it.id] || it.id;
const canAll = () => true;
const canMost = (p) => p !== 'top.secret';
const build = (over = {}) => buildIndex(NAVFIX, { packs: PACKS, label, can: canMost, isDesktop: true, ...over });

describe('isNavVisible — the one sidebar rule', () => {
  it('drops hidden, perm-denied, and desktop-only-off items; passes the rest', () => {
    expect(isNavVisible({ id: 'a' }, canAll, false)).toBe(true);
    expect(isNavVisible({ id: 'a', hidden: true }, canAll, true)).toBe(false);
    expect(isNavVisible({ id: 'a', perm: 'x' }, () => false, true)).toBe(false);
    expect(isNavVisible({ id: 'a', perm: 'x' }, null, true)).toBe(false);   // no can() at all = denied, not allowed
    expect(isNavVisible({ id: 'a', desktopOnly: true }, canAll, false)).toBe(false);
    expect(isNavVisible({ id: 'a', desktopOnly: true }, canAll, true)).toBe(true);
  });
});

describe('buildIndex mirrors the sidebar', () => {
  it('a perm the user lacks removes the entry', () => {
    const ids = build().map(e => e.id);
    expect(ids).not.toContain('secretpage');
    expect(build({ can: canAll }).map(e => e.id)).toContain('secretpage');
  });
  it('hidden prunes the whole subtree — the child of a hidden parent is unfindable', () => {
    const ids = build().map(e => e.id);
    expect(ids).not.toContain('ghost');
    expect(ids).not.toContain('ghostchild');
  });
  it('pruning is not just a root-level rule — a visible parent with an invisible (perm-denied) ' +
     'child still drops that child\'s own children, even though the grandchild is itself visible', () => {
    const ids = build().map(e => e.id);
    expect(ids).toContain('install');              // the top-level parent stays visible
    expect(ids).not.toContain('secretpage');        // perm-denied middle node is pruned
    expect(ids).not.toContain('secretgrandchild');  // its subtree goes with it, one level further down
    // sanity: with the perm granted, the whole chain (including the grandchild) reappears
    expect(build({ can: canAll }).map(e => e.id)).toContain('secretgrandchild');
  });
  it('desktopOnly honours the isDesktop flag', () => {
    expect(build().map(e => e.id)).toContain('mcpskill');
    expect(build({ isDesktop: false }).map(e => e.id)).not.toContain('mcpskill');
  });
  it('a nested entry carries its parent label as the breadcrumb; a top-level one carries none', () => {
    const mk = build().find(e => e.id === 'marketplace');
    expect(mk.crumb).toBe('ติดตั้ง');
    expect(build().find(e => e.id === 'toolsmgr').crumb).toBeNull();
  });
  it('sidebar order is preserved', () => {
    expect(build().map(e => e.id)).toEqual(['toolsmgr', 'install', 'marketplace', 'mcpskill', 'settings']);
  });
});

describe('cross-language matching — no hardcoded language list', () => {
  it('an English query finds the Thai-labelled entry', () => {
    const hits = searchIndex(build(), 'market').map(e => e.id);
    expect(hits).toEqual(['marketplace']);
  });
  it('a route id is a term too', () => {
    expect(searchIndex(build(), 'mcpskill').map(e => e.id)).toEqual(['mcpskill']);
  });
  it('adding a synthetic 4th language makes its labels searchable with no code change', () => {
    const packs4 = { ...PACKS, de: { formal: { 'nav.marketplace': 'Marktplatz' } } };
    const hits = searchIndex(build({ packs: packs4 }), 'marktplatz').map(e => e.id);
    expect(hits).toEqual(['marketplace']);
  });
  it("an admin rename (customLabel) is matchable — the display label is a term", () => {
    const nav3 = [{ group: 'g', items: [{ id: 'toolsmgr', icon: 'tools', customLabel: 'กล่องเครื่องมือ' }] }];
    const idx = buildIndex(nav3, { packs: PACKS, label, can: canAll, isDesktop: true });
    expect(searchIndex(idx, 'กล่องเครื่องมือ').map(e => e.id)).toEqual(['toolsmgr']);
  });
});

describe('ranking', () => {
  it('display-label prefix > other-term prefix > label contains > term contains; ties keep order', () => {
    const nav2 = [{ group: 'g', items: [
      { id: 'contains' }, { id: 'termcontains' }, { id: 'termprefix' }, { id: 'labelprefix' },
    ] }];
    const cur = { 'nav.contains': 'xxABxx', 'nav.termcontains': 'zz', 'nav.termprefix': 'yy', 'nav.labelprefix': 'ABc' };
    const packs2 = { en: { formal: { 'nav.termprefix': 'AByy', 'nav.termcontains': 'qqABqq' } } };
    const idx = buildIndex(nav2, { packs: packs2, label: (it) => cur['nav.' + it.id], can: canAll, isDesktop: true });
    expect(searchIndex(idx, 'ab').map(e => e.id)).toEqual(['labelprefix', 'termprefix', 'contains', 'termcontains']);
  });
  it('empty and whitespace-only queries return everything in sidebar order', () => {
    expect(searchIndex(build(), '').map(e => e.id)).toEqual(build().map(e => e.id));
    expect(searchIndex(build(), '   ').map(e => e.id)).toEqual(build().map(e => e.id));
  });
  it('matching is case-insensitive', () => {
    expect(searchIndex(build(), 'MARKET').map(e => e.id)).toEqual(['marketplace']);
  });
});

describe('palette.* i18n parity', () => {
  const keys = (p) => Object.keys(p.translations ?? p).filter(k => k.startsWith('palette.')).sort();
  it('all three packs carry the same non-empty palette.* key set', () => {
    const base = keys(en);
    expect(base.length).toBeGreaterThan(1);
    expect(keys(th)).toEqual(base);
    expect(keys(ja)).toEqual(base);
  });
});
