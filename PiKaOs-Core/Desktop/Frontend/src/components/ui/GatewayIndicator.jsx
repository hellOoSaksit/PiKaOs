import React, { useEffect, useState } from 'react';
import Tooltip from './Tooltip.jsx';
import { indicatorState } from './GatewayIndicator.logic.js';

/* The always-visible light for the external-AI gateway. Lives in the title bar, which App.jsx's
   withChrome() wraps around EVERY shell mode — including the pre-login/bootstrap screens, where
   restore() has already opened the pipe. Self-subscribes to the same gateway:status push
   McpGatewayPanel listens to, so App.jsx only supplies navigation — no status plumbing.

   `onClick` is optional and its absence is meaningful: on a pre-login screen there is no AI Access
   route to send the operator to, so the light renders as a plain labelled dot instead of a button
   that would silently do nothing when pressed. */
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
  const tip = t('titlebar.gateway.tip', { state: t(state.key, state.params) });
  const label = t('titlebar.gateway');
  const dot = <span className="tb-gateway-dot" />;
  return (
    <Tooltip label={tip} focusable={!onClick}>
      {onClick
        ? <button type="button" className="tb-gateway-light" aria-label={label}
            data-live={state.live} onClick={onClick}>{dot}</button>
        : <span className="tb-gateway-light" role="img" aria-label={label}
            data-live={state.live}>{dot}</span>}
    </Tooltip>
  );
}
