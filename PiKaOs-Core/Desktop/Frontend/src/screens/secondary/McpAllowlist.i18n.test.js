import { describe, it, expect } from 'vitest';
import en from '../../data/i18n/en-formal.json';
import th from '../../data/i18n/th-formal.json';
import ja from '../../data/i18n/ja-formal.json';

const keys = (p) => Object.keys(p.translations ?? p)
  .filter(k => k.startsWith('mcpacl.') || k === 'mcpskill.tab.allowlist' || k === 'mcpskill.tabdesc.allowlist')
  .sort();

describe('mcpacl.* i18n parity', () => {
  it('all three packs carry the same non-empty key set', () => {
    const base = keys(en);
    expect(base.length).toBeGreaterThan(10);
    expect(keys(th)).toEqual(base);
    expect(keys(ja)).toEqual(base);
  });
});
