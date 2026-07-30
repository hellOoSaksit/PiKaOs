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
  const stateText = t(state.key, state.params);
  // Both strings carry the state, and both lead with the feature name — the state alone
  // ("2 connected") doesn't say what it's about. The tooltip gets the short name because the bubble
  // is small and its reader can see the dot; the accessible name gets the full one and is the ONLY
  // place a screen-reader user learns either. Separators are translator-controlled text in the pack,
  // never a JSX-side hardcode.
  const tip = t('titlebar.gateway.tip', { state: stateText });
  const label = t('titlebar.gateway', { state: stateText });
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
