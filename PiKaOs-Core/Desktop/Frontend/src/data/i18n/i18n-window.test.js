import { it, expect } from 'vitest';
import en from './en-formal.json';
import th from './th-formal.json';
import ja from './ja-formal.json';

const PACKS = [['en', en], ['th', th], ['ja', ja]];

it('every pack defines the titlebar toolbar labels', () => {
  const TB = ['titlebar.sidebar', 'titlebar.search', 'titlebar.back', 'titlebar.forward'];
  for (const [name, pack] of PACKS)
    for (const k of TB) expect(pack.translations[k], `${name} missing ${k}`).toBeTruthy();
});

// The OS draws min/max/close (Window Controls Overlay) — the renderer labels left with the
// custom buttons and must not creep back in.
it('no pack carries the dead window-control labels', () => {
  const DEAD = ['window.minimize', 'window.maximize', 'window.restore', 'window.close', 'titlebar.menu'];
  for (const [name, pack] of PACKS)
    for (const k of DEAD) expect(pack.translations[k], `${name} still has ${k}`).toBeUndefined();
});

// The create-first-admin screen moved to the auth plugin (zero-core: no identity, no such screen), and
// its strings went with it — PiKaOs-Plugin-Auth/frontend/i18n/*, guarded by that plugin's own
// firstadmin.test.js. A Base pack carrying them again would mean the screen crept back into Core.
it('no pack carries the first-admin strings — they ship with the auth plugin', () => {
  for (const [name, pack] of PACKS) {
    const strays = Object.keys(pack.translations).filter((k) => k.startsWith('firstadmin.'));
    expect(strays, `${name} still has ${strays.join(', ')}`).toEqual([]);
  }
});
