/* mergeConfigs is the pure tree-merge at the heart of data-nav.jsx's mergeWithDefault. It is
   tested directly here (not via data-nav.jsx) because data-nav.jsx imports plugins/index.jsx,
   whose eager glob pulls the ai plugin's LlmConfig.jsx -> components/ui barrel -> lib/i18n,
   which touches `window` at module scope and dies in Vitest's node environment — the same
   failure class nav-routes.test.js's header comment documents for data-nav.jsx/App.jsx. Hand-
   building the `def` tree here (instead of importing defaultNav()) sidesteps that chain entirely
   and lets each case pin an exact, minimal scenario. Mirrors the LocalMcp.logic.js split. */
import { describe, it, expect } from 'vitest';
import { mergeConfigs } from './data-nav.logic.js';

// A minimal two-group default tree standing in for the real NAV: a rearranged item (`mcpskill`)
// sits between two pre-existing siblings, mirroring §3 of the mcp-skill-menu-split design spec
// (install, mcpskill, settings — mcpskill NOT at the end of the group).
const DEF = [
  {
    group: 'ผู้ดูแลระบบ',
    items: [
      { id: 'toolsmgr', icon: 'wrench', perm: 'options.manage' },
      { id: 'install', icon: 'box', perm: 'plugins.manage' },
      { id: 'mcpskill', icon: 'link', perm: 'mcp.manage' },
      { id: 'settings', icon: 'gear' },
    ],
  },
  {
    group: 'อื่นๆ',
    items: [{ id: 'home', icon: 'house' }],
  },
];

describe('mergeConfigs', () => {
  it('inserts a missing default item at its designed position, not the end of the group', () => {
    // Saved layout predates mcpskill entirely (the v3-era shape: no mcpskill anywhere).
    const saved = [
      {
        group: 'ผู้ดูแลระบบ',
        items: [
          { id: 'toolsmgr', icon: 'wrench', perm: 'options.manage' },
          { id: 'install', icon: 'box', perm: 'plugins.manage' },
          { id: 'settings', icon: 'gear' },
        ],
      },
      { group: 'อื่นๆ', items: [{ id: 'home', icon: 'house' }] },
    ];
    const merged = mergeConfigs(DEF, saved);
    const ids = merged.find(g => g.group === 'ผู้ดูแลระบบ').items.map(it => it.id);
    // mcpskill lands right after install (its nearest present default sibling) — between
    // install and settings, exactly as §3 of the design spec designs it, not appended last.
    expect(ids).toEqual(['toolsmgr', 'install', 'mcpskill', 'settings']);
  });

  it('falls to the front of the group when every preceding default sibling is absent', () => {
    // Saved layout only ever had `settings` in this group — none of mcpskill's preceding
    // default siblings (toolsmgr, install) were ever saved.
    const saved = [
      { group: 'ผู้ดูแลระบบ', items: [{ id: 'settings', icon: 'gear' }] },
      { group: 'อื่นๆ', items: [{ id: 'home', icon: 'house' }] },
    ];
    const merged = mergeConfigs(DEF, saved);
    const ids = merged.find(g => g.group === 'ผู้ดูแลระบบ').items.map(it => it.id);
    // toolsmgr, install, and mcpskill are all missing; each in turn finds no preceding sibling
    // already placed, so each is inserted at index 0 — net effect is default order at the front,
    // with the pre-existing `settings` pushed after them.
    expect(ids).toEqual(['toolsmgr', 'install', 'mcpskill', 'settings']);
  });

  it('preserves the user reordering of items that ARE present in the saved layout', () => {
    // User moved install before toolsmgr; that relative ordering must survive the merge
    // untouched. mcpskill's nearest preceding default sibling is `install` (def order:
    // toolsmgr, install, mcpskill, settings), so it keys off install's actual (moved) position
    // in the saved layout — landing right after install, ahead of toolsmgr — not its default
    // index among the original siblings.
    const saved = [
      {
        group: 'ผู้ดูแลระบบ',
        items: [
          { id: 'install', icon: 'box', perm: 'plugins.manage' },
          { id: 'toolsmgr', icon: 'wrench', perm: 'options.manage' },
          { id: 'settings', icon: 'gear' },
        ],
      },
    ];
    const merged = mergeConfigs(DEF, saved);
    const ids = merged.find(g => g.group === 'ผู้ดูแลระบบ').items.map(it => it.id);
    expect(ids).toEqual(['install', 'mcpskill', 'toolsmgr', 'settings']);
  });

  it('drops routes removed from the default and refreshes code-owned metadata (icon/perm/tag)', () => {
    const saved = [
      {
        group: 'ผู้ดูแลระบบ',
        items: [
          { id: 'toolsmgr', icon: 'STALE-ICON', perm: 'STALE-PERM' },   // stale metadata, must refresh
          { id: 'ghost-route', icon: 'x' },                              // no longer in def, must drop
          { id: 'install', icon: 'box', perm: 'plugins.manage', customLabel: 'My Installs' },
          { id: 'settings', icon: 'gear' },
        ],
      },
    ];
    const merged = mergeConfigs(DEF, saved);
    const items = merged.find(g => g.group === 'ผู้ดูแลระบบ').items;
    expect(items.map(it => it.id)).toEqual(['toolsmgr', 'install', 'mcpskill', 'settings']);
    expect(items.find(it => it.id === 'toolsmgr')).toEqual({ id: 'toolsmgr', icon: 'wrench', perm: 'options.manage' });
    expect(items.find(it => it.id === 'install').customLabel).toBe('My Installs');   // user rename survives
  });

  it('creates a fresh group in default order when the saved config never had that group', () => {
    const saved = [{ group: 'อื่นๆ', items: [{ id: 'home', icon: 'house' }] }];
    const merged = mergeConfigs(DEF, saved);
    const admin = merged.find(g => g.group === 'ผู้ดูแลระบบ');
    expect(admin.items.map(it => it.id)).toEqual(['toolsmgr', 'install', 'mcpskill', 'settings']);
  });

  it('returns the default tree untouched when there is no saved config', () => {
    expect(mergeConfigs(DEF, null)).toBe(DEF);
    expect(mergeConfigs(DEF, [])).toBe(DEF);
  });
});
