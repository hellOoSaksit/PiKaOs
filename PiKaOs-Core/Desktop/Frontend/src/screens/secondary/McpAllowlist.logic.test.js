/* Pure logic for the MCP allowlist tab. Pinned: owner grouping (core first), deterministic
   sort, grant diffing, and — the one that matters — toEntries PRESERVES existing entry
   objects, so a future per-entry effect override survives an unrelated toggle+save. */
import { describe, it, expect } from 'vitest';
import { ownerOf, groupByOwner, diffGrants, toEntries } from './McpAllowlist.logic.js';

const T = (method, path, extra = {}) => ({
  name: `${method.toLowerCase()}_${path.replace(/^\/api\//, '').replace(/[/{}]+/g, '_')}`,
  description: '', effect: 'read', permission: 'x.view', method, path, granted: false, ...extra,
});

describe('ownerOf', () => {
  it('names the plugin from the segment after /api', () => {
    expect(ownerOf('/api/knowledge/docs/{doc_id}', new Set(['knowledge']))).toBe('knowledge');
  });
  it('a segment that is not an active plugin id answers to core', () => {
    expect(ownerOf('/api/audit', new Set(['knowledge']))).toBe('core');
    expect(ownerOf('/api/knowledge/search', new Set(['knowledge']))).toBe('knowledge');
  });
});

describe('groupByOwner', () => {
  const tools = [
    T('GET', '/api/knowledge/search'), T('POST', '/api/knowledge/answer'),
    T('GET', '/api/audit'), T('GET', '/api/storage/status'),
  ];
  it('groups with core first, then plugins alphabetically', () => {
    const groups = groupByOwner(tools, new Set(['knowledge']));
    expect(groups.map(g => g.owner)).toEqual(['core', 'knowledge']);
  });
  it('core owns audit and storage', () => {
    const core = groupByOwner(tools, new Set(['knowledge'])).find(g => g.owner === 'core');
    expect(core.tools.map(t => t.path).sort()).toEqual(['/api/audit', '/api/storage/status']);
  });
  it('tools inside a group sort by path then method', () => {
    const kb = groupByOwner(tools, new Set(['knowledge'])).find(g => g.owner === 'knowledge');
    expect(kb.tools.map(t => t.path)).toEqual(['/api/knowledge/answer', '/api/knowledge/search']);
  });
});

describe('diffGrants', () => {
  it('reports adds, removes, and the SaveBar count', () => {
    const d = diffGrants(['a', 'b'], ['b', 'c']);
    expect(d).toEqual({ added: ['c'], removed: ['a'], count: 2 });
  });
  it('no changes -> count 0 (SaveBar hidden)', () => {
    expect(diffGrants(['a'], ['a']).count).toBe(0);
  });
});

describe('toEntries', () => {
  it('keeps the existing entry object for surviving names (effect overrides survive)', () => {
    const initial = { keep: { effect: 'read' }, drop: {} };
    expect(toEntries(['keep', 'add'], initial)).toEqual({ keep: { effect: 'read' }, add: {} });
  });
});
