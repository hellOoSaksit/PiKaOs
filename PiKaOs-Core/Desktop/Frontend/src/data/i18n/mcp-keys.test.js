import { describe, it, expect } from 'vitest';
import en from './en-formal.json';
import th from './th-formal.json';
import ja from './ja-formal.json';

// Every mcp.* key must exist in every pack — a missed key renders as a raw key string in the UI.
const mcpKeys = (pack) => Object.keys(pack.translations ?? pack).filter((k) => k.startsWith('mcp.')).sort();

describe('mcp.* i18n parity', () => {
  it('th and ja carry exactly the en key set', () => {
    const base = mcpKeys(en);
    expect(base.length).toBeGreaterThan(40);   // sanity: the redesign added keys
    expect(mcpKeys(th)).toEqual(base);
    expect(mcpKeys(ja)).toEqual(base);
  });
});
