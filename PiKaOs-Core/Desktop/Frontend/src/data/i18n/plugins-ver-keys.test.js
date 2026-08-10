import { describe, it, expect } from 'vitest';
import en from './en-formal.json';
import th from './th-formal.json';
import ja from './ja-formal.json';

// Every plugins.ver.* key must exist in every pack — a missed key renders as a raw key string in the
// version picker, and the picker is the only place an operator can roll a plugin back.
const verKeys = (pack) => Object.keys(pack.translations ?? pack).filter((k) => k.startsWith('plugins.ver.')).sort();
const at = (pack, k) => (pack.translations ?? pack)[k];

describe('plugins.ver.* i18n parity', () => {
  it('th and ja carry exactly the en key set', () => {
    const base = verKeys(en);
    expect(base.length).toBe(10);
    expect(verKeys(th)).toEqual(base);
    expect(verKeys(ja)).toEqual(base);
  });

  // A translation that drops its placeholder still renders — as a button reading "Switch to" with no
  // version on it, or a title naming no plugin. Key parity alone never catches that.
  it('every pack keeps the placeholders its key promises', () => {
    const NEEDS = { 'plugins.ver.title': '{name}', 'plugins.ver.switch': '{tag}', 'plugins.ver.back': '{tag}' };
    for (const [name, pack] of [['en', en], ['th', th], ['ja', ja]])
      for (const [k, token] of Object.entries(NEEDS))
        expect(at(pack, k), `${name}/${k} lost ${token}`).toContain(token);
  });
});
