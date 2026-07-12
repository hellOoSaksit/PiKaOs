import { it, expect } from 'vitest';
import en from './en-formal.json';
import th from './th-formal.json';
import ja from './ja-formal.json';

const KEYS = ['window.minimize', 'window.maximize', 'window.restore', 'window.close'];

it('every pack defines the window-control labels', () => {
  for (const [name, pack] of [['en', en], ['th', th], ['ja', ja]])
    for (const k of KEYS)
      expect(pack.translations[k], `${name} missing ${k}`).toBeTruthy();
});

it('every pack defines the titlebar toolbar labels', () => {
  const TB = ['titlebar.menu','titlebar.sidebar','titlebar.search','titlebar.back','titlebar.forward'];
  for (const [name, pack] of [['en', en], ['th', th], ['ja', ja]])
    for (const k of TB) expect(pack.translations[k], `${name} missing ${k}`).toBeTruthy();
});
