/* Frontend plugin registry — the seam that lets a feature contribute its screens, route metadata and
   sidebar entries WITHOUT Core editing App.jsx or data.jsx (plugin-architecture.md §2.4 + §6, the
   frontend half of Phase 6). The backend gates features by ENABLED_MODULES / manifests; the frontend
   ships the parallel list below — a plugin's UI appears only when it is enabled here.

   A plugin module default-exports a descriptor:
     { id, routes: [ { id, meta:{icon,title,en}, render(ctx) } ], nav: [ { group, items:[{id,icon,perm?}] } ],
       profile?: (ctx) => JSX, bootstrapScreens?: { [stage]: (ctx) => JSX } }
   `render(ctx)` receives the Core seams it asked for (t · can · language · …); the plugin owns the wiring
   so Core never needs to know each screen's prop shape. `bootstrapScreens` is the same idea one step
   earlier — a screen for the pre-login/pre-app install window (App.jsx's shell-mode stages), keyed by
   stage id (e.g. 'db-choice', R2's first user).

   DISCOVERY (P1): plugins are found by globbing `./<id>/index.jsx` — Core does not name them. Drop a
   folder in (or symlink one from PiKaOs-App/plugins/, P2) and it ships; delete it and a Base-only build
   carries none of it. So this file never changes per plugin, and Core builds with 0..N plugins present.
   Load order is dependency-aware: a plugin listing `dependencies:[...]` loads after them (topo sort),
   which is what lets a feature rely on a foundational plugin like `ai` (plugin-architecture.md §2.4 §6). */
import { isPluginUiActive } from '../lib/plugin-gate.js';

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
const _owners = {};
for (const p of PLUGINS) for (const r of p.routes || []) { _routes[r.id] = r; _owners[r.id] = p.id; }

/* RUNTIME GATE (plugin-ui-runtime-gate): folder presence ≠ installed. Every accessor below that can
   put plugin UI on screen also takes `active` — the Set of plugin ids the server's /health reports
   as running (null until known). A bundled-but-inactive plugin renders nothing, so a Zero/kernel-only
   server shows a Zero UI even though the desktop build carries every plugin's frontend. Predicate
   lives in lib/plugin-gate.js (deny-by-default: unknown → hidden). */

/** route id -> owning plugin id, for consumers that gate outside the barrel (e.g. the sidebar nav). */
export const PLUGIN_ROUTE_OWNERS = _owners;

/** Render an ACTIVE plugin's route, or null when no active plugin owns it (Core falls back to its
 *  default). `active` = Set of running plugin ids from /health (null = unknown → nothing renders). */
export function renderPluginRoute(routeId, ctx, active) {
  const r = _routes[routeId];
  if (!r || !isPluginUiActive(_owners[routeId], active)) return null;
  return r.render(ctx);
}

/* `bootstrapScreens` is the same seam as `routes`, one step earlier: it lets a plugin own a screen
   shown DURING the pre-login/pre-app install window (App.jsx's `resolveShellMode()` stages — e.g.
   'db-choice'), not just the signed-in app's routes. Generic on purpose: any plugin may claim any
   stage id; Core never hardcodes which plugin or which stage (postgres/db-choice is just the first
   user, R2). First plugin (discovery order) whose map has the stage wins, same "first claim wins"
   rule renderPluginProfile below already uses. */
const _bootstrap = {};
for (const p of PLUGINS) for (const [stage, render] of Object.entries(p.bootstrapScreens || {})) {
  if (!(stage in _bootstrap)) _bootstrap[stage] = render;
}

/** Render an enabled plugin's bootstrap-window screen, or null when no plugin owns that stage
 *  (Core falls back to its own default shell for that stage).
 *
 *  DELIBERATELY NOT gated on the running-plugin set, unlike every accessor above: a bootstrap stage is
 *  by definition pre-auth, and in production /capabilities hides the plugin list from anonymous
 *  login-mode callers (backend `test_production_login_mode_hides_plugins_from_anonymous`) — exactly the
 *  state the 'first-admin' window runs in. Gating here would render nothing and brick onboarding on the
 *  one deployment that matters. It costs nothing: a stage only activates on a server signal that already
 *  implies its owner (`needsFirstAdmin` = a live code in login mode, i.e. an identity plugin is enabled;
 *  `needsDbConfig` = the postgres plugin's own route answering), so the signal IS the gate. */
export function renderPluginBootstrap(stage, ctx) {
  const render = _bootstrap[stage];
  return render ? render(ctx) : null;
}

/** Topbar metadata ({icon,title,en}) for every plugin route — merged into Core's ROUTE_META. */
export const PLUGIN_ROUTE_META = Object.fromEntries(
  Object.values(_routes).filter(r => r.meta).map(r => [r.id, r.meta]),
);

/** Sidebar groups/items each plugin contributes — merged into the nav default (data-nav.js). */
export const PLUGIN_NAV = PLUGINS.flatMap(p => p.nav || []);

/** The utility bar's account control, if any ACTIVE plugin owns identity. Kernel-only Core has no
 *  notion of a signed-in person, so it renders no profile button at all rather than a decorative one —
 *  the auth plugin brings the whole control with it. First active plugin to claim the slot wins
 *  (identity is singular). */
export function renderPluginProfile(ctx, active) {
  const owner = PLUGINS.find(p => typeof p.profile === 'function' && isPluginUiActive(p.id, active));
  return owner ? owner.profile(ctx) : null;
}

/** RBAC permission descriptors ({key,group,th,en}) each plugin OWNS — merged onto the Core/kernel catalog
 *  so the RBAC screen + admin grant show exactly the perms of the installed plugins (plugin-architecture
 *  §0, dynamic permissions). A Base-only build carries none of them (the fix for the plugin-perm residue). */
export const PLUGIN_PERMISSIONS = PLUGINS.flatMap(p => p.permissions || []);
