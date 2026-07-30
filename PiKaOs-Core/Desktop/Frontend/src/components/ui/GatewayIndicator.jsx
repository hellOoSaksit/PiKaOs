import React, { useEffect, useState } from 'react';
import Tooltip from './Tooltip.jsx';
import { indicatorState } from './GatewayIndicator.logic.js';

/* The always-visible light for the external-AI gateway. Self-subscribes to the same gateway:status
   push McpGatewayPanel listens to, so App.jsx only supplies navigation — no status plumbing. */
export function GatewayIndicator({ t, onClick }) {
  const api = window.pikaosDesktop?.gateway;
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!api) return undefined;
    api.status().then(setStatus).catch(() => setStatus(null));
    return api.onStatus(setStatus);
  }, [api]);

  const state = indicatorState(status);
  if (!state) return null;
  // Lead the tooltip with the feature name (MCP) — the state alone ("2 connected") doesn't say what
  // it's about, and the name that would answer that lives only in aria-label, which sighted users
  // never see. The separator is translator-controlled text in the pack, not a JSX-side hardcode.
  return (
    <Tooltip label={t('utilitybar.gateway.tip', { state: t(state.key, state.params) })}>
      <button type="button" className="ub-gateway-light" aria-label={t('utilitybar.gateway')}
        data-live={state.live} onClick={onClick}>
        <span className="ub-gateway-dot" />
      </button>
    </Tooltip>
  );
}
