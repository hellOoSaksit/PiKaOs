/* Pure merge logic for the admin-editable sidebar nav — NO React, NO window, no imports of
   NAV/plugins. data-nav.jsx wires this against the real default tree (defaultNav()); tests
   exercise it directly against hand-built trees, which sidesteps data-nav.jsx's import chain
   (it pulls plugins/index.jsx's eager glob, which reaches a plugin screen that touches `window`
   at module scope and dies in Vitest's node environment). Mirrors the LocalMcp.logic.js split. */

function collectIds(items, set = new Set()) {
  for (const it of items || []) { set.add(it.id); collectIds(it.children, set); }
  return set;
}

/* Merge a saved config against `def` (the current default arrangement — an array of
   { group, items } as produced by defaultNav()). Keeps the saved order/nesting/hidden/label,
   refreshes code-owned metadata (icon/perm/tag), drops routes whose id no longer exists in
   `def`, and inserts new default routes at the position implied by their default siblings
   rather than appending them to the end of the group.

   Position-aware insert: for a default item missing from the saved group, walk backward
   through its default siblings (in `def` order) for the nearest one already present in the
   merged group, and splice in right after it; if none of the preceding siblings are present,
   splice in at the front. A pure end-of-group append would silently relocate a rearranged item
   (e.g. mcpskill, designed to sit between install and settings) to the bottom of its group on
   any install with a pre-existing saved arrangement — exactly the outcome the NAV_KEY bump was
   meant to prevent, reached through the server-persisted copy instead of localStorage. */
export function mergeConfigs(def, saved) {
  if (!Array.isArray(saved) || !saved.length) return def;

  const defIndex = {};
  (function idx(items) { for (const it of items || []) { defIndex[it.id] = it; idx(it.children); } })(def.flatMap(g => g.items));

  const prune = (items) => (items || [])
    .filter(it => defIndex[it.id])           // drop removed routes
    .map(it => {
      const d = defIndex[it.id];
      const out = { id: it.id, icon: d.icon };
      if (d.perm) out.perm = d.perm;
      if (d.tag) out.tag = d.tag;
      if (d.desktopOnly) out.desktopOnly = true;
      if (it.customLabel) out.customLabel = it.customLabel;   // the only label the user owns (rename)
      if (it.hidden) out.hidden = true;
      if (it.children) out.children = prune(it.children);
      return out;
    });

  const merged = saved.map(g => ({ group: g.group, items: prune(g.items) }));
  const present = collectIds(merged.flatMap(g => g.items));

  for (const g of def) {
    let mg = merged.find(m => m.group === g.group);
    if (!mg) { merged.push({ group: g.group, items: [...g.items] }); continue; }  // fresh group: default order

    for (let i = 0; i < g.items.length; i++) {
      const it = g.items[i];
      if (present.has(it.id)) continue;

      let insertAt = 0;
      for (let j = i - 1; j >= 0; j--) {
        const prevIdx = mg.items.findIndex(m => m.id === g.items[j].id);
        if (prevIdx !== -1) { insertAt = prevIdx + 1; break; }
      }
      mg.items.splice(insertAt, 0, it);
      present.add(it.id);
    }
  }
  return merged;
}
