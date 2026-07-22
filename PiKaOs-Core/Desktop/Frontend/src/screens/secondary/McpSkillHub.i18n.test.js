/* The hub used to live inside Marketplace and spoke Marketplace's mkt.* keys. Now that they are two
   screens, sharing a namespace means the next person editing Marketplace copy edits the MCP screen
   without knowing it. This pins the hub to its own namespace and to full pack parity. */
import { readFileSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import en from '../../data/i18n/en-formal.json';
import th from '../../data/i18n/th-formal.json';
import ja from '../../data/i18n/ja-formal.json';

const PACKS = [['en', en], ['th', th], ['ja', ja]];
const SRC = readFileSync(new URL('./McpSkillHub.jsx', import.meta.url), 'utf8');
// Both call shapes the file uses: t('literal') and t('prefix' + expr).
const USED = [...SRC.matchAll(/\bt\(\s*'([^']+)'/g)].map((m) => m[1]);

describe('McpSkillHub i18n', () => {
  it('the scan works', () => {
    expect(USED).toContain('mcpskill.title');
    expect(USED.length).toBeGreaterThan(5);
  });

  it('uses only keys in its own namespace — no borrowing from Marketplace', () => {
    const foreign = [...new Set(USED)].filter((k) => !k.startsWith('mcpskill.'));
    expect(foreign, `McpSkillHub uses foreign keys: ${foreign.join(', ')}`).toEqual([]);
  });

  it('every pack carries the same mcpskill.* key set', () => {
    const keys = (p) => Object.keys(p.translations ?? p).filter((k) => k.startsWith('mcpskill.')).sort();
    const base = keys(en);
    expect(base.length).toBeGreaterThan(8);
    for (const [name, pack] of PACKS) expect(keys(pack), `${name} pack drift`).toEqual(base);
  });

  it('no mkt.tab.* / mkt.tabdesc.* keys survive — they moved to mcpskill.*', () => {
    for (const [name, pack] of PACKS) {
      const stale = Object.keys(pack.translations ?? pack)
        .filter((k) => k.startsWith('mkt.tab'));
      expect(stale, `${name} still carries ${stale.join(', ')}`).toEqual([]);
    }
  });
});
