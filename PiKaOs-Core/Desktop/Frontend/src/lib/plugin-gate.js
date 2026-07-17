/* Runtime gate for plugin-contributed UI. A packaged desktop build bundles EVERY plugin's frontend
   (folder presence can't vary per install), so "the folder exists" must not mean "the feature is
   installed" — a Zero/kernel-only server would still show User Management, Permissions, … The server
   is the source of truth: the /capabilities handshake lists the plugins that are actually running,
   and plugin UI renders only when its owner is on that list. Deny-by-default: while states are
   unknown (handshake pending or failed) plugin UI stays hidden; Core's own UI is never gated here. */

/** Set of running plugin ids from the /capabilities payload. The server already filters the list to
 *  active-only (recon discipline included — production hides it from unauthenticated login-mode
 *  callers, which reads here as "nothing active" until sign-in). Rows carrying an explicit non-active
 *  `state` (the /health shape) are excluded defensively, and malformed/missing payloads read as
 *  "nothing active" — deny-by-default, never a throw. */
export function activePluginIds(caps) {
  const rows = Array.isArray(caps?.plugins) ? caps.plugins : [];
  return new Set(rows.filter((p) => p && p.id && (p.state === undefined || p.state === 'active'))
    .map((p) => p.id));
}

/** Whether a plugin's UI may render. `active` is null until the first /health resolves → deny. */
export function isPluginUiActive(pluginId, active) {
  return active instanceof Set && active.has(pluginId);
}

/** Strip nav items that belong to an inactive plugin's route (recursively), then drop groups left
 *  empty. `owners` maps route id -> owning plugin id (the barrel's PLUGIN_ROUTE_OWNERS); items whose
 *  id has no owner are Core's and always pass. Pure: the nav config is React state, never mutated. */
export function filterPluginNav(groups, owners, active) {
  const keep = (item) => !(item.id in owners) || isPluginUiActive(owners[item.id], active);
  const filterItems = (items) => (items || [])
    .filter(keep)
    .map((it) => (it.children ? { ...it, children: filterItems(it.children) } : it));
  return (groups || [])
    .map((g) => ({ ...g, items: filterItems(g.items) }))
    .filter((g) => g.items.length > 0);
}
