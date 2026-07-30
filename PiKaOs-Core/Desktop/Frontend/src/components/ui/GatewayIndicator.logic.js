/* Pure helper for GatewayIndicator — kept out of the component so it can be unit-tested without a
   DOM, the same split McpGatewayPanel.logic.js established. */

/**
 * What the utility bar's gateway light should show for a status push.
 *
 * null = render nothing. The light means "listening NOW", not "the feature exists": with the
 * enabled state persisted (gateway-state.json), the pipe can be live without the operator having
 * touched anything this session — this light is the visibility half of that decision. Off must
 * leave no trace on the bar.
 */
export function indicatorState(status) {
  if (!status || !status.enabled) return null;
  return status.connections > 0
    ? { key: 'mcpgw.status.connected', params: { n: status.connections }, live: true }
    : { key: 'mcpgw.status.waiting', params: {}, live: false };
}
