/* Frontend plugin registry — the seam that lets a feature contribute its screens, route metadata and
   sidebar entries WITHOUT Core editing App.jsx or data.jsx (plugin-architecture.md §2.4 + §6, the
   frontend half of Phase 6). The backend gates features by ENABLED_MODULES / manifests; the frontend
   ships the parallel list below — a plugin's UI appears only when it is enabled here.

   A plugin module default-exports a descriptor:
     { id, routes: [ { id, meta:{icon,title,en}, render(ctx) } ], nav: [ { group, items:[{id,icon,perm?}] } ] }
   `render(ctx)` receives the Core seams it asked for (t · can · language · …); the plugin owns the wiring
   so Core never needs to know each screen's prop shape. */
import knowledge from './knowledge/index.jsx';
import world from './world/index.jsx';

// The frontend plugins this build ships (mirror of the backend ENABLED_MODULES set).
const PLUGINS = [knowledge, world];

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
