/* Pure logic for the MCP allowlist tab. Imports NOTHING (no React, no window) so the
   node-environment test can load it — same escape hatch as CommandPalette.logic.js. */

/* Owner = the path segment after /api IF it names an active plugin; everything else is core.
   The descriptor carries no owner field, and guessing from the path alone would misfile every
   Core router (/api/audit is not an "audit plugin"). */
export function ownerOf(path, pluginIds) {
  const seg = String(path || '').replace(/^\/api\//, '').split('/')[0];
  return pluginIds && pluginIds.has(seg) ? seg : 'core';
}

/* core first, then plugins alphabetically; inside a group: path, then method — a stable order
   so the table never reshuffles under the operator's cursor. */
export function groupByOwner(tools, pluginIds) {
  const by = new Map();
  for (const t of tools || []) {
    const owner = ownerOf(t.path, pluginIds);
    if (!by.has(owner)) by.set(owner, []);
    by.get(owner).push(t);
  }
  const owners = [...by.keys()].sort((a, b) =>
    (a === 'core' ? -1 : b === 'core' ? 1 : a.localeCompare(b)));
  return owners.map(owner => ({
    owner,
    tools: by.get(owner).sort((a, b) =>
      a.path.localeCompare(b.path) || a.method.localeCompare(b.method)),
  }));
}

export function diffGrants(initial, edited) {
  const before = new Set(initial), after = new Set(edited);
  const added = [...after].filter(n => !before.has(n)).sort();
  const removed = [...before].filter(n => !after.has(n)).sort();
  return { added, removed, count: added.length + removed.length };
}

/* The PUT replaces the allowlist wholesale, so the payload must carry every surviving entry —
   with its EXISTING object, not a fresh {}: a per-entry effect override set by hand (or a
   future UI) must survive an unrelated toggle+save. */
export function toEntries(edited, initialEntries) {
  const out = {};
  for (const name of edited) out[name] = (initialEntries || {})[name] || {};
  return out;
}

/* The pending change set, resolved to something displayable: each granted/revoked name paired with
   the "METHOD /path" the operator recognises from the table (falling back to the raw name when the
   tool has left the catalog). Pure so the bar's contents are testable without rendering anything. */
export function describeChanges(diff, orphans, tools) {
  const byName = new Map((tools || []).map(t => [t.name, t]));
  const label = (name) => {
    const t = byName.get(name);
    return t ? `${t.method} ${t.path}` : name;
  };
  const describe = (names) => (names || []).map(name => ({ name, label: label(name) }));
  const added = describe(diff && diff.added);
  const removed = describe(diff && diff.removed);
  const orphansOut = describe(orphans);
  return { added, removed, orphans: orphansOut, total: added.length + removed.length + orphansOut.length };
}
