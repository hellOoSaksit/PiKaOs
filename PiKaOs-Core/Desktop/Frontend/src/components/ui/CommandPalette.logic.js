/* Pure logic for the menu command palette. Imports NOTHING — no React, no window — so the
   node-environment test can load it (the ui barrel and data-nav both die there on a
   window-at-module-scope chain; this file is the escape hatch, same pattern as LocalMcp.logic.js). */

/* THE sidebar visibility rule, extracted from App.jsx's two inline copies (NavNode's child filter
   and the group-level top-item filter) so the palette cannot drift from what the sidebar shows.
   `isDesktop` is a parameter, not a window read, for the same node-test reason.
   No can() at all means DENIED for perm-gated items, matching the old inline `can && can(perm)`. */
export function isNavVisible(item, can, isDesktop) {
  if (item.hidden) return false;
  if (item.perm && !(can && can(item.perm))) return false;
  if (item.desktopOnly && !isDesktop) return false;
  return true;
}

/* nav   = [{ group, items }] — the plugin-filtered tree the sidebar renders.
   packs = the full I18N_PACKS registry { lang: { lexicon: translations } }. Every value of
           `nav.<id>` in ANY pack is a matchable term — this is what lets an English query find a
           Thai-labelled menu, with no language named in code.
   label = (item) => the display label in the CURRENT language (caller resolves customLabel/t).
   An invisible item prunes its whole subtree, exactly like the sidebar. */
export function buildIndex(nav, { packs, label, can, isDesktop }) {
  const out = [];
  const packValues = (id) => {
    const vals = [];
    for (const byLex of Object.values(packs || {}))
      for (const translations of Object.values(byLex || {})) {
        const v = translations && translations['nav.' + id];
        if (v) vals.push(v);
      }
    return vals;
  };
  const walk = (items, parent) => {
    for (const it of items || []) {
      if (!isNavVisible(it, can, isDesktop)) continue;
      const disp = label(it);
      const terms = [...new Set(
        [disp, ...packValues(it.id), it.id].map(s => String(s).toLowerCase()),
      )];
      out.push({ id: it.id, icon: it.icon, label: disp, crumb: parent ? label(parent) : null, terms });
      walk(it.children, it);
    }
  };
  for (const g of nav || []) walk(g.items, null);
  return out;
}

/* Substring, not word-prefix — Thai has no word spaces. Rank, best first: the label the user is
   LOOKING AT starts with the query; some hidden term starts with it; the label contains it; some
   term contains it. Ties keep index (= sidebar) order so an unfiltered list reads like the sidebar. */
export function searchIndex(index, query) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return index;
  const rank = (e) => {
    const l = e.label.toLowerCase();
    if (l.startsWith(q)) return 0;
    if (e.terms.some(t => t.startsWith(q))) return 1;
    if (l.includes(q)) return 2;
    if (e.terms.some(t => t.includes(q))) return 3;
    return -1;
  };
  return index
    .map((e, i) => ({ e, i, r: rank(e) }))
    .filter(x => x.r >= 0)
    .sort((a, b) => a.r - b.r || a.i - b.i)
    .map(x => x.e);
}
