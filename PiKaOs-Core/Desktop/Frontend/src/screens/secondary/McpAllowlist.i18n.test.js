import { describe, it, expect } from 'vitest';
import en from '../../data/i18n/en-formal.json';
import th from '../../data/i18n/th-formal.json';
import ja from '../../data/i18n/ja-formal.json';

const keys = (p) => Object.keys(p.translations ?? p)
  .filter(k => k.startsWith('mcpacl.') || k.startsWith('mcpgw.')
    || k === 'mcpskill.tab.allowlist' || k === 'mcpskill.tabdesc.allowlist')
  .sort();

describe('mcpacl.* i18n parity', () => {
  it('all three packs carry the same non-empty key set', () => {
    const base = keys(en);
    expect(base.length).toBeGreaterThan(10);
    expect(keys(th)).toEqual(base);
    expect(keys(ja)).toEqual(base);
  });

  it('the gateway panel keys exist in every pack', () => {
    const need = ['mcpgw.title', 'mcpgw.enable', 'mcpgw.status.off', 'mcpgw.status.waiting',
      'mcpgw.status.connected', 'mcpgw.config.title', 'mcpgw.config.copy', 'mcpgw.config.copied',
      'mcpgw.clients.title', 'mcpgw.clients.empty', 'mcpgw.clients.revoke', 'mcpgw.unverified',
      'mcpgw.error', 'mcpgw.confirm.enable', 'mcpgw.confirm.disable', 'mcpgw.confirm.revoke',
      'mcpgw.confirm.ok', 'mcpgw.confirm.cancel'];
    for (const pack of [en, th, ja]) {
      const table = pack.translations ?? pack;
      for (const k of need) expect(table[k], `${k} missing`).toBeTruthy();
    }
  });
});
