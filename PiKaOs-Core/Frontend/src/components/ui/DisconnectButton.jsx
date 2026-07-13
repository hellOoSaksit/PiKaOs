/* PiKaOs — desktop-only "disconnect from server" control, shared by every pre-app auth screen
   (FirstRun today, the auth-plugin login once it exists) so the disconnect behaviour never drifts
   between them. It drops the current server: sets the force-connect flag AppBoot reads on the next
   boot, then reloads so the boot gate falls through to the Connect-Server screen (AppBoot.jsx §
   FORCE_CONNECT_KEY). Web builds have no server to disconnect from, so it renders nothing there. */
import React from 'react';
import { Icon } from './icons.jsx';
import { FORCE_CONNECT_KEY } from '../../AppBoot.jsx';

export function DisconnectButton({ t, className = 'btn btn-ghost', style }) {
  // guard typeof window like App.jsx does — the desktop bridge only exists in the Electron renderer
  if (typeof window === 'undefined' || !window.pikaosDesktop?.isDesktop) return null;
  const disconnect = () => {
    try { sessionStorage.setItem(FORCE_CONNECT_KEY, '1'); } catch (e) { /* ignore */ }
    window.location.reload();
  };
  return (
    <button type="button" className={className} onClick={disconnect}
      style={{ display: 'inline-flex', alignItems: 'center', gap: 8, ...style }}>
      <Icon name="logout" size={16} />
      {t('connect.disconnect')}
    </button>
  );
}
