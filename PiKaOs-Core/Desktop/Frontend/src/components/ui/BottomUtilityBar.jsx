import React, { useState } from 'react';
import { UtilityBarButton } from './UtilityBarButton.jsx';
import { PopoverPanel } from './PopoverPanel.jsx';
import { Icon } from './icons.jsx';
import Tooltip from './Tooltip.jsx';
import { unreadCount } from '../../lib/notifications.js';

// The bar's buttons size their own glyph (no CSS slot owns it), so `size` is explicit here.
const ICONS = {
  nav: <Icon name="menu" size={23} />,
  home: <Icon name="home" size={23} />,
  search: <Icon name="search" size={23} />,
  notifications: <Icon name="notifications" size={23} />,
  add: <Icon name="add" size={23} />,
  chat: <Icon name="chat" size={23} />,
};

/**
 * Global floating utility bar — nav/home/search/notifications/add/chat, plus the account control
 * when a plugin owns identity (`profile`; kernel-only Core passes null and the slot disappears).
 * Separate from the nested content-nav (data-nav.jsx/Sidebar in App.jsx),
 * which stays its own component per the shell/nav design (they're
 * fundamentally different shapes: flat bar vs 3-level tree).
 */
export function BottomUtilityBar({
  t, route, onHome, onToggleNav, profile = null,
  notifications = [], chatThreads = [], onSearch, onAdd, showLabels = false,
  onNotificationsOpened,
}) {
  const [active, setActive] = useState(route === 'me' ? 'home' : null);
  const [openPop, setOpenPop] = useState(null);
  const [query, setQuery] = useState('');
  // No `clearedNotif` twin for chat's latch: notifications now carry a server-side `read` flag, so
  // opening the bell marks them read and the refetched rows report unread = 0 on their own. A local
  // latch would only ever disagree with the server — and the one that used to live here latched `true`
  // on first open and never reset, pinning the badge to 0 for the rest of the session. Chat keeps its
  // latch because chat threads have no read state to ask about yet.
  const [clearedChat, setClearedChat] = useState(false);

  const go = (tab, fn) => { setActive(tab); setOpenPop(null); fn && fn(); };
  const togglePop = (tab) => {
    setOpenPop((p) => {
      const next = p === tab ? null : tab;
      if (tab === 'notifications' && next) onNotificationsOpened?.();
      return next;
    });
    setActive(tab);
    if (tab === 'chat') setClearedChat(true);
  };
  const closePop = () => setOpenPop(null);

  const notifCount = unreadCount(notifications);
  const chatCount = clearedChat ? 0 : chatThreads.length;

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

        <div style={{ position: 'relative' }}>
          <Tooltip label={t('utilitybar.chat')}>
            <UtilityBarButton
              icon={ICONS.chat} title={t('utilitybar.chat')} label={t('utilitybar.chat')}
              showLabel={showLabels} active={active === 'chat'} badge={chatCount}
              onClick={() => togglePop('chat')}
            />
          </Tooltip>
          <PopoverPanel open={openPop === 'chat'} onClose={closePop} anchor="right" width={320}>
            <div className="pop-head">
              <span className="pop-title">{t('utilitybar.chat.title')}</span>
              <button type="button" className="pop-action">{t('utilitybar.chat.compose')}</button>
            </div>
            {chatThreads.length === 0
              ? <div className="pop-empty">{t('utilitybar.chat.empty')}</div>
              : <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                  {chatThreads.map((c) => (
                    <div key={c.id} className="pop-head" style={{ borderBottom: '1px solid var(--line-soft)' }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{c.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{c.time}</div>
                    </div>
                  ))}
                </div>}
            <button type="button" className="pop-foot">{t('utilitybar.chat.open')}</button>
          </PopoverPanel>
        </div>

        {/* identity is a plugin's to own: no auth plugin, no account control (and no divider) */}
        {profile && <>
          <div className="ub-divider" />
          {profile}
        </>}
      </div>
    </>
  );
}
