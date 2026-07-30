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
  return (
    <Tooltip label={t(state.key, state.params)}>
      <button type="button" className="ub-gateway-light" aria-label={t('utilitybar.gateway')}
        data-live={state.live} onClick={onClick}>
        <span className="ub-gateway-dot" />
      </button>
    </Tooltip>
  );
}
