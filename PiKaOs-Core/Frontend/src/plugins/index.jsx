/* Frontend plugin registry — the seam that lets a feature contribute its screens, route metadata and
   sidebar entries WITHOUT Core editing App.jsx or data.jsx (plugin-architecture.md §2.4 + §6, the
   frontend half of Phase 6). The backend gates features by ENABLED_MODULES / manifests; the frontend
   ships the parallel list below — a plugin's UI appears only when it is enabled here.

   A plugin module default-exports a descriptor:
     { id, routes: [ { id, meta:{icon,title,en}, render(ctx) } ], nav: [ { group, items:[{id,icon,perm?}] } ] }
   `render(ctx)` receives the Core seams it asked for (t · can · language · …); the plugin owns the wiring
   so Core never needs to know each screen's prop shape.

   DISCOVERY (P1): plugins are found by globbing `./<id>/index.jsx` — Core does not name them. Drop a
   folder in (or symlink one from PiKaOs-App/plugins/, P2) and it ships; delete it and a Base-only build
   carries none of it. So this file never changes per plugin, and Core builds with 0..N plugins present.
   Load order is dependency-aware: a plugin listing `dependencies:[...]` loads after them (topo sort),
   which is what lets a feature rely on a foundational plugin like `ai` (plugin-architecture.md §2.4 §6). */
const _mods = import.meta.glob('./*/index.jsx', { eager: true });
const _descriptors = Object.values(_mods).map(m => m && m.default).filter(Boolean);

/* Topo-order by `dependencies` so a plugin loads after the ones it declares (e.g. knowledge after ai).
   Cycles / missing deps degrade gracefully: anything unresolved is appended in discovery order. */
function _orderByDeps(list) {
  const byId = new Map(list.map(p => [p.id, p]));
  const out = [], seen = new Set(), stack = new Set();
  const visit = (p) => {
    if (!p || seen.has(p.id)) return;
    if (stack.has(p.id)) return;                 // cycle — bail, leave for the trailing append
    stack.add(p.id);
    for (const dep of p.dependencies || []) visit(byId.get(dep));
    stack.delete(p.id);
    if (!seen.has(p.id)) { seen.add(p.id); out.push(p); }
  };
  for (const p of list) visit(p);
  for (const p of list) if (!seen.has(p.id)) { seen.add(p.id); out.push(p); }   // safety net
  return out;
}

// The frontend plugins this build ships (mirror of the backend ENABLED_MODULES set).
const PLUGINS = _orderByDeps(_descriptors);

const _routes = {};
for (const p of PLUGINS) for (const r of p.routes || []) _routes[r.id] = r;

/** Render an enabled plugin's route, or null when no plugin owns it (Core falls back to its default). */
export function renderPluginRoute(routeId, ctx) {
  const r = _routes[routeId];
  return r ? r.render(ctx) : null;
}

/** Topbar metadata ({icon,title,en}) for every plugin route — merged into Core's ROUTE_META. */
export const PLUGIN_ROUTE_META = Object.fromEntries(
  Object.values(_routes).filter(r => r.meta).map(r => [r.id, r.meta]),
);

/** Sidebar groups/items each plugin contributes — merged into the nav default (data-nav.js). */
export const PLUGIN_NAV = PLUGINS.flatMap(p => p.nav || []);

/** RBAC permission descriptors ({key,group,th,en}) each plugin OWNS — merged onto the Core/kernel catalog
 *  so the RBAC screen + admin grant show exactly the perms of the installed plugins (plugin-architecture
 *  §0, dynamic permissions). A Base-only build carries none of them (the fix for the plugin-perm residue). */
export const PLUGIN_PERMISSIONS = PLUGINS.flatMap(p => p.permissions || []);
