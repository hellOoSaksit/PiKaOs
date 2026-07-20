import React, { useState } from 'react';
import { UtilityBarButton } from './UtilityBarButton.jsx';
import { PopoverPanel } from './PopoverPanel.jsx';
import { Icon } from './icons.jsx';
import Tooltip from './Tooltip.jsx';
import { AiConsole } from './AiConsole.jsx';
import { unreadCount } from '../../lib/notifications.js';

// The bar's buttons size their own glyph (no CSS slot owns it), so `size` is explicit here.
const ICONS = {
  nav: <Icon name="menu" size={23} />,
  home: <Icon name="home" size={23} />,
  search: <Icon name="search" size={23} />,
  notifications: <Icon name="notifications" size={23} />,
  add: <Icon name="add" size={23} />,
  ai: <Icon name="ai" size={23} />,
};

/**
 * Global floating utility bar — nav/home/search/notifications/add/ai, plus the account control
 * when a plugin owns identity (`profile`; kernel-only Core passes null and the slot disappears).
 * Separate from the nested content-nav (data-nav.jsx/Sidebar in App.jsx),
 * which stays its own component per the shell/nav design (they're
 * fundamentally different shapes: flat bar vs 3-level tree).
 */
export function BottomUtilityBar({
  t, route, onHome, onToggleNav, profile = null,
  notifications = [], onSearch, onAdd, showLabels = false,
  onNotificationsOpened,
}) {
  const [active, setActive] = useState(route === 'me' ? 'home' : null);
  const [openPop, setOpenPop] = useState(null);
  const [query, setQuery] = useState('');

  const go = (tab, fn) => { setActive(tab); setOpenPop(null); fn && fn(); };
  const togglePop = (tab) => {
    setOpenPop((p) => {
      const next = p === tab ? null : tab;
      if (tab === 'notifications' && next) onNotificationsOpened?.();
      return next;
    });
    setActive(tab);
  };
  const closePop = () => setOpenPop(null);

  const notifCount = unreadCount(notifications);

  const submitSearch = (e) => {
    if (e.key !== 'Enter') return;
    onSearch && onSearch(query);
  };

  return (
    <>
      {openPop && <div className="utility-bar-overlay" onClick={closePop} />}
      <div className="utility-bar">
        {/* the sidebar's other control: narrows/widens it on desktop, opens the drawer on mobile */}
        <Tooltip label={t('utilitybar.nav')}>
          <UtilityBarButton
            icon={ICONS.nav} title={t('utilitybar.nav')} label={t('utilitybar.nav')}
            showLabel={showLabels}
            onClick={() => { setOpenPop(null); onToggleNav && onToggleNav(); }}
          />
        </Tooltip>

        <Tooltip label={t('utilitybar.home')}>
          <UtilityBarButton
            icon={ICONS.home} title={t('utilitybar.home')} label={t('utilitybar.home')}
            showLabel={showLabels} active={active === 'home'}
            onClick={() => go('home', onHome)}
          />
        </Tooltip>

        <div style={{ position: 'relative' }}>
          <Tooltip label={t('utilitybar.search')}>
            <UtilityBarButton
              icon={ICONS.search} title={t('utilitybar.search')} label={t('utilitybar.search')}
              showLabel={showLabels} active={active === 'search'}
              onClick={() => togglePop('search')}
            />
          </Tooltip>
          <PopoverPanel open={openPop === 'search'} onClose={closePop} anchor="left" width={300}>
            <div className="pop-search-field">
              <input
                type="text" autoFocus value={query}
                placeholder={t('utilitybar.search.placeholder')}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={submitSearch}
              />
            </div>
          </PopoverPanel>
        </div>

        <div style={{ position: 'relative' }}>
          <Tooltip label={t('utilitybar.notifications')}>
            <UtilityBarButton
              icon={ICONS.notifications} title={t('utilitybar.notifications')} label={t('utilitybar.notifications')}
              showLabel={showLabels} active={active === 'notifications'} badge={notifCount}
              onClick={() => togglePop('notifications')}
            />
          </Tooltip>
          <PopoverPanel open={openPop === 'notifications'} onClose={closePop} anchor="center" width={320}>
            <div className="pop-head">
              <span className="pop-title">{t('utilitybar.notifications.title')}</span>
              <button type="button" className="pop-action">{t('utilitybar.notifications.readAll')}</button>
            </div>
            {notifications.length === 0
              ? <div className="pop-empty">{t('utilitybar.notifications.empty')}</div>
              : <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                  {notifications.map((n) => (
                    <div key={n.id} className="pop-head" style={{ borderBottom: '1px solid var(--line-soft)' }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{n.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{n.time}</div>
                    </div>
                  ))}
                </div>}
            <button type="button" className="pop-foot">{t('utilitybar.notifications.viewAll')}</button>
          </PopoverPanel>
        </div>

        <Tooltip label={t('utilitybar.add.title')}>
          <UtilityBarButton
            icon={ICONS.add} title={t('utilitybar.add.title')} label={t('utilitybar.add')}
            showLabel={showLabels} active={active === 'add'}
            onClick={() => go('add', onAdd)}
          />
        </Tooltip>

        {/* AI console — desktop only: the loop and the key vault live in Electron main */}
        {window.pikaosDesktop?.isDesktop && (
          <div style={{ position: 'relative' }}>
            <Tooltip label={t('utilitybar.ai')}>
              <UtilityBarButton
                icon={ICONS.ai} title={t('utilitybar.ai')} label={t('utilitybar.ai')}
                showLabel={showLabels} active={active === 'ai'}
                onClick={() => togglePop('ai')}
              />
            </Tooltip>
            <PopoverPanel open={openPop === 'ai'} onClose={closePop} anchor="right" width={360}>
              <AiConsole t={t} open={openPop === 'ai'} onClose={closePop} />
            </PopoverPanel>
          </div>
        )}

        {/* identity is a plugin's to own: no auth plugin, no account control (and no divider) */}
        {profile && <>
          <div className="ub-divider" />
          {profile}
        </>}
      </div>
    </>
  );
}
