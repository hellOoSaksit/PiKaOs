/* Runtime gate for plugin-contributed UI. A packaged desktop build bundles EVERY plugin's frontend
   (folder presence can't vary per install), so "the folder exists" must not mean "the feature is
   installed" — a Zero/kernel-only server would still show User Management, Permissions, … The server
   is the source of truth: the /capabilities handshake lists the plugins that are actually running,
   and plugin UI renders only when its owner is on that list. Where the server makes no trustworthy
   claim the gate stands aside rather than hiding (see authoritativePluginIds + isPluginUiActive) —
   the gate may never leave the shell worse off than having no gate. Core's own UI is never gated here. */

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

/** The subset of payloads worth gating on, as a Set — or null when the payload proves nothing.
 *
 *  The server REDACTS the list (to []) for anonymous callers in production login mode — the same
 *  recon discipline that exempts bootstrap screens (backend
 *  `test_production_login_mode_hides_plugins_from_anonymous`). So in login mode an empty list means
 *  "nothing runs" OR "not telling you", and the client cannot tell which. Two shapes are trustworthy:
 *  open mode never redacts (everyone is an admin there), and a non-empty list cannot BE a redaction.
 *  Anything else — a redacted list, the fabricated handshake-failure fallback, a payload fetched with
 *  a just-expired token — yields null, i.e. "no claim", not "nothing runs". */
export function authoritativePluginIds(caps) {
  if (!caps) return null;
  const ids = activePluginIds(caps);
  return (caps.authMode === 'open' || ids.size) ? ids : null;
}

/** Whether a plugin's UI may render. Gates on an authoritative list; without one (null) it stands
 *  aside — the gate is UI honesty, and hiding on no-evidence is strictly worse than not gating: it
 *  would trap a signed-in user in a shell whose only exit, the plugin-owned sign-out control, is the
 *  very thing being hidden. `activePluginIds(caps).size === 0` from a trustworthy payload still
 *  denies — that is the server saying "nothing runs", which is the Zero-server case this exists for. */
export function isPluginUiActive(pluginId, active) {
  if (!(active instanceof Set)) return true;
  return active.has(pluginId);
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
