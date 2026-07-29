/* Pure helpers for McpGatewayPanel — kept out of the component so they can be unit-tested without a
   DOM, the same split McpAllowlist.logic.js established on this screen. */

/**
 * Maps a pending action to the i18n key + params its confirmation should read.
 *
 * The wording matters more than the mechanism here: every one of these takes effect immediately and
 * cannot be undone, so the message has to say what actually happens (a door opens, live connections
 * drop, this client is disconnected now) rather than a generic "are you sure?".
 *
 * Returns null when nothing is pending, so the caller can drive the bar's open state off it.
 */
export function confirmText(pending) {
  if (!pending) return null;
  switch (pending.kind) {
    case 'enable': return { key: 'mcpgw.confirm.enable', params: {} };
    case 'disable': return { key: 'mcpgw.confirm.disable', params: {} };
    case 'revoke': return { key: 'mcpgw.confirm.revoke', params: { name: pending.name } };
    default: return null;
  }
}

/**
 * What the switch should ask to confirm, given the gateway's REAL current state.
 *
 * Derived from `enabled` rather than from the checkbox event, so the pending action can never
 * disagree with the state the panel is showing — the switch keeps rendering reality while the
 * confirmation is open, and a cancel therefore needs no rollback at all.
 */
export function toggleIntent(enabled) {
  return { kind: enabled ? 'disable' : 'enable' };
}
