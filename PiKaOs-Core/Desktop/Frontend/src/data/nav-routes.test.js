/* Every route id in the default sidebar must have a screen, and every Core route must be reachable
   from the sidebar. `localmcp` drifted for a whole release: it kept a ROUTE_META entry and two i18n
   keys after its route case was deleted, so the topbar carried metadata for a screen that no longer
   existed. This pins both directions so the next id that moves cannot rot the same way.

   App.jsx AND data-nav.jsx are read as source TEXT, not imported: App.jsx's module graph touches
   `window` at module scope, and data-nav.jsx imports plugins/index.jsx, whose eager glob pulls every
   plugin screen — the ai plugin's LlmConfig imports the components/ui barrel, which reaches lib/i18n
   and dies the same way in a node environment. data.jsx is pure data and imports fine. */
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { NAV } from './data.jsx';

const APP = readFileSync(new URL('../App.jsx', import.meta.url), 'utf8');
const DATA_NAV = readFileSync(new URL('./data-nav.jsx', import.meta.url), 'utf8');

const flat = (items) => items.flatMap((it) => [it, ...flat(it.children || [])]);
const navIds = NAV.flatMap((g) => flat(g.items)).map((it) => it.id).sort();

// `case "home": return ...` — the Core route switch. Plugin routes go through the default arm.
const caseIds = [...APP.matchAll(/case\s+"([a-z-]+)":/g)].map((m) => m[1]).sort();
// The literal ROUTE_META object, up to the `...PLUGIN_ROUTE_META` spread.
const metaBlock = APP.slice(APP.indexOf('const ROUTE_META'), APP.indexOf('...PLUGIN_ROUTE_META'));
const metaIds = [...metaBlock.matchAll(/^\s{2}([a-z-]+)\s*:/gm)].map((m) => m[1]).sort();

describe('nav ids and route cases agree', () => {
  it('the scan finds something (guards against a regex that silently matches nothing)', () => {
    expect(navIds.length).toBeGreaterThan(5);
    expect(caseIds.length).toBeGreaterThan(5);
    expect(metaIds.length).toBeGreaterThan(5);
  });

  it('every default nav id has a route case', () => {
    expect(navIds.filter((id) => !caseIds.includes(id))).toEqual([]);
  });

  it('every Core ROUTE_META id is reachable from the sidebar — no orphan metadata', () => {
    expect(metaIds.filter((id) => !navIds.includes(id))).toEqual([]);
  });

  it('mcpskill is a top-level admin item gated on mcp.manage', () => {
    const admin = NAV.find((g) => g.group === 'ผู้ดูแลระบบ');
    const item = admin.items.find((it) => it.id === 'mcpskill');
    expect(item).toBeTruthy();
    expect(item.perm).toBe('mcp.manage');
  });

  it('NAV_KEY was bumped for this rearrangement', () => {
    // mergeWithDefault preserves a saved arrangement, so a changed DEFAULT only reaches users who
    // never touched their menu unless the key changes. Bump this deliberately, with the comment.
    expect(DATA_NAV).toMatch(/NAV_KEY = "guildos-nav-v4"/);
  });
});
