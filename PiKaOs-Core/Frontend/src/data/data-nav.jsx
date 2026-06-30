/* PiKaOs — editable sidebar navigation config (global, admin-set, shared by everyone).

   The static NAV in data.jsx is the source of truth for which items exist (their route id,
   icon, perm). This module layers an editable arrangement on top: order, nesting (up to
   MAX_DEPTH levels: Main -> Sub -> Sub), hidden, and a custom label. It is one global config
   (a single localStorage key, NOT keyed per user) so an admin's arrangement is what every user
   sees — same intent as the other admin config in this prototype. */
import { NAV } from './data.jsx';
import { PLUGIN_NAV } from '../plugins/index.jsx';

const NAV_KEY = "guildos-nav-v1";
export const MAX_DEPTH = 3;                 // Main(0) -> Sub(1) -> Sub(2)

/* ---- default config: a deep clone of the static NAV (route metadata lives in code) ----
   Labels are NOT cloned — the sidebar shows the i18n string `nav.<id>` (language-aware). A rename
   only sets `customLabel`, which then wins over i18n. So a default item has no label field at all. */
function cloneItems(items) {
  return (items || []).map(it => ({
    id: it.id, icon: it.icon,
    ...(it.perm ? { perm: it.perm } : {}),
    ...(it.tag ? { tag: it.tag } : {}),
    ...(it.hidden ? { hidden: true } : {}),
    ...(it.children ? { children: cloneItems(it.children) } : {}),
  }));
}
function defaultNav() {
  const base = NAV.map(g => ({ group: g.group, items: cloneItems(g.items) }));
  // Phase 6 seam: each enabled frontend plugin contributes its own sidebar group/items — merged into a
  // matching Base group (by name) or appended — so Core's NAV never hardcodes a feature's nav entry.
  for (const pg of PLUGIN_NAV) {
    const items = cloneItems(pg.items);
    const g = base.find(b => b.group === pg.group);
    if (g) g.items.push(...items);
    else base.push({ group: pg.group, items });
  }
  return base;
}

/* ---- helpers ---- */
function _clone(cfg) { return JSON.parse(JSON.stringify(cfg)); }
function collectIds(items, set = new Set()) {
  for (const it of items || []) { set.add(it.id); collectIds(it.children, set); }
  return set;
}
function _height(node) {                     // 1 for a leaf; +1 per nested level
  if (!node.children || !node.children.length) return 1;
  return 1 + Math.max(...node.children.map(_height));
}

/* find a node anywhere in a group's item tree (track its list, index, depth, parent node) */
function _locate(items, id, depth = 0, parent = null) {
  for (let i = 0; i < items.length; i++) {
    if (items[i].id === id) return { list: items, index: i, node: items[i], depth, parent };
    if (items[i].children) {
      const r = _locate(items[i].children, id, depth + 1, items[i]);
      if (r) return r;
    }
  }
  return null;
}
function _locateInCfg(cfg, id) {
  for (const g of cfg) { const r = _locate(g.items, id); if (r) return { ...r, group: g }; }
  return null;
}

/* ---- merge a saved config with the current default ----
   keep the user's order/nesting/hidden/label; refresh code-owned metadata (icon/perm/tag);
   drop nodes whose route was removed; append new default routes so they stay reachable. */
function mergeWithDefault(saved) {
  const def = defaultNav();
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
      if (it.customLabel) out.customLabel = it.customLabel;   // the only label the user owns (rename)
      if (it.hidden) out.hidden = true;
      if (it.children) out.children = prune(it.children);
      return out;
    });

  const merged = saved.map(g => ({ group: g.group, items: prune(g.items) }));
  const present = collectIds(merged.flatMap(g => g.items));
  for (const g of def) {
    let mg = merged.find(m => m.group === g.group);
    if (!mg) { mg = { group: g.group, items: [] }; merged.push(mg); }
    for (const it of g.items) if (!present.has(it.id)) { mg.items.push(it); present.add(it.id); }
  }
  return merged;
}

/* ---- persistence (one global key) ---- */
function loadNav() {
  try { const raw = localStorage.getItem(NAV_KEY); return mergeWithDefault(raw ? JSON.parse(raw) : null); }
  catch { return defaultNav(); }
}
function saveNav(cfg) { try { localStorage.setItem(NAV_KEY, JSON.stringify(cfg)); } catch {} return cfg; }
function resetNav() { try { localStorage.removeItem(NAV_KEY); } catch {} return defaultNav(); }

/* ---- tree edits (each returns a NEW cfg; clone-then-mutate keeps them immutable) ---- */
function moveUp(cfg, id) {
  const c = _clone(cfg); const loc = _locateInCfg(c, id);
  if (loc && loc.index > 0) { const l = loc.list; [l[loc.index - 1], l[loc.index]] = [l[loc.index], l[loc.index - 1]]; }
  return c;
}
function moveDown(cfg, id) {
  const c = _clone(cfg); const loc = _locateInCfg(c, id);
  if (loc && loc.index < loc.list.length - 1) { const l = loc.list; [l[loc.index + 1], l[loc.index]] = [l[loc.index], l[loc.index + 1]]; }
  return c;
}
/* indent: become a child of the preceding sibling (deeper one level), if depth budget allows */
function canIndent(cfg, id) {
  const loc = _locateInCfg(cfg, id);
  if (!loc || loc.index === 0) return false;
  const deepest = (loc.depth + 1) + _height(loc.node) - 1;   // node's lowest level after the move
  return deepest <= MAX_DEPTH - 1;
}
function indent(cfg, id) {
  if (!canIndent(cfg, id)) return cfg;
  const c = _clone(cfg); const loc = _locateInCfg(c, id);
  const prev = loc.list[loc.index - 1];
  loc.list.splice(loc.index, 1);
  prev.children = prev.children || [];
  prev.children.push(loc.node);
  return c;
}
/* outdent: pop out to sit right after the current parent in the grandparent's list */
function canOutdent(cfg, id) { const loc = _locateInCfg(cfg, id); return !!(loc && loc.depth > 0); }
function outdent(cfg, id) {
  const c = _clone(cfg); const loc = _locateInCfg(c, id);
  if (!loc || loc.depth === 0) return c;
  const parent = loc.parent;
  loc.list.splice(loc.index, 1);                       // remove from parent.children
  if (parent.children && !parent.children.length) delete parent.children;
  const ploc = _locateInCfg(c, parent.id);             // where the parent sits
  ploc.list.splice(ploc.index + 1, 0, loc.node);
  return c;
}
function toggleHidden(cfg, id) {
  const c = _clone(cfg); const loc = _locateInCfg(c, id);
  if (loc) { if (loc.node.hidden) delete loc.node.hidden; else loc.node.hidden = true; }
  return c;
}
function rename(cfg, id, customLabel) {
  const c = _clone(cfg); const loc = _locateInCfg(c, id);
  if (loc) {
    const v = (customLabel || "").trim();
    if (v) loc.node.customLabel = v;
    else delete loc.node.customLabel;        // cleared -> revert to the i18n default
  }
  return c;
}
/* drag reorder: move `id` to sit before `targetId`, only when they share a parent list */
function reorderBefore(cfg, id, targetId) {
  if (id === targetId) return cfg;
  const c = _clone(cfg);
  const a = _locateInCfg(c, id), b = _locateInCfg(c, targetId);
  if (!a || !b || a.list !== b.list) return cfg;        // same sibling list only
  const [node] = a.list.splice(a.index, 1);
  const dest = b.index > a.index ? b.index - 1 : b.index;
  a.list.splice(dest, 0, node);
  return c;
}

export {
  defaultNav, loadNav, saveNav, resetNav, mergeWithDefault,
  moveUp, moveDown, indent, outdent, canIndent, canOutdent,
  toggleHidden, rename, reorderBefore,
};
