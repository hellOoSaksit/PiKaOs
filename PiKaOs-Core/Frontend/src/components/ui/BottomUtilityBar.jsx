import React, { useState } from 'react';
import { UtilityBarButton } from './UtilityBarButton.jsx';
import { PopoverPanel } from './PopoverPanel.jsx';

const isAvImg = (a) => typeof a === 'string' && (a.startsWith('data:') || a.startsWith('http'));

const ICONS = {
  home: <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11.5 12 4.5l8 7"/><path d="M6 9.8V19.5h12V9.8"/><path d="M10 19.5V14h4v5.5"/></svg>,
  search: <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="6.2"/><path d="m20 20-3.8-3.8"/></svg>,
  notifications: <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M18 9.5a6 6 0 1 0-12 0c0 4.8-2 6.3-2 6.3h16s-2-1.5-2-6.3z"/><path d="M10.2 19.2a2 2 0 0 0 3.6 0"/></svg>,
  add: <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>,
  chat: <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6.5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2.5V20l4-3.5H18a2 2 0 0 0 2-2v-8z"/></svg>,
};

/**
 * Global floating utility bar — home/search/notifications/add/chat/profile.
 * Separate from the nested content-nav (data-nav.jsx/Sidebar in App.jsx),
 * which stays its own component per the shell/nav design (they're
 * fundamentally different shapes: flat 6-slot bar vs 3-level tree).
 */
export function BottomUtilityBar({
  t, route, onHome, me, theme, onToggleTheme, onSignOut,
  notifications = [], chatThreads = [], onSearch, onAdd, showLabels = false,
}) {
  const [active, setActive] = useState(route === 'me' ? 'home' : null);
  const [openPop, setOpenPop] = useState(null);
  const [query, setQuery] = useState('');
  const [clearedNotif, setClearedNotif] = useState(false);
  const [clearedChat, setClearedChat] = useState(false);

  const go = (tab, fn) => { setActive(tab); setOpenPop(null); fn && fn(); };
  const togglePop = (tab) => {
    setOpenPop((p) => (p === tab ? null : tab));
    setActive(tab);
    if (tab === 'notifications') setClearedNotif(true);
    if (tab === 'chat') setClearedChat(true);
  };
  const closePop = () => setOpenPop(null);

  const notifCount = clearedNotif ? 0 : notifications.length;
  const chatCount = clearedChat ? 0 : chatThreads.length;

  const submitSearch = (e) => {
    if (e.key !== 'Enter') return;
    onSearch && onSearch(query);
  };

  return (
    <>
      {openPop && <div className="utility-bar-overlay" onClick={closePop} />}
      <div className="utility-bar">
        <UtilityBarButton
          icon={ICONS.home} title={t('utilitybar.home')} label={t('utilitybar.home')}
          showLabel={showLabels} active={active === 'home'}
          onClick={() => go('home', onHome)}
        />

        <div style={{ position: 'relative' }}>
          <UtilityBarButton
            icon={ICONS.search} title={t('utilitybar.search')} label={t('utilitybar.search')}
            showLabel={showLabels} active={active === 'search'}
            onClick={() => togglePop('search')}
          />
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
          <UtilityBarButton
            icon={ICONS.notifications} title={t('utilitybar.notifications')} label={t('utilitybar.notifications')}
            showLabel={showLabels} active={active === 'notifications'} badge={notifCount}
            onClick={() => togglePop('notifications')}
          />
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

        <UtilityBarButton
          icon={ICONS.add} title={t('utilitybar.add.title')} label={t('utilitybar.add')}
          showLabel={showLabels} active={active === 'add'}
          onClick={() => go('add', onAdd)}
        />

        <div style={{ position: 'relative' }}>
          <UtilityBarButton
            icon={ICONS.chat} title={t('utilitybar.chat')} label={t('utilitybar.chat')}
            showLabel={showLabels} active={active === 'chat'} badge={chatCount}
            onClick={() => togglePop('chat')}
          />
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

        <div className="ub-divider" />

        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className={'ub-profile-btn' + (openPop === 'profile' ? ' open' : '')}
            title={t('utilitybar.profile')}
            onClick={() => togglePop('profile')}
          >
            <span className="ub-avatar-wrap">
              {isAvImg(me.avatar) ? <img src={me.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: 11, objectFit: 'cover' }} /> : <span>{me.avatar || '🧙'}</span>}
            </span>
          </button>
          <PopoverPanel open={openPop === 'profile'} onClose={closePop} anchor="right" width={276}>
            <div className="pop-head" style={{ background: 'var(--raised-grad)' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 15 }}>{me.display}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>@{me.username}</div>
              </div>
            </div>
            <div style={{ padding: 8 }}>
              <button type="button" className="pop-foot" style={{ borderTop: 'none', textAlign: 'left' }} onClick={closePop}>
                {t('utilitybar.profile.viewProfile')}
              </button>
              <button type="button" className="pop-foot" style={{ borderTop: 'none', textAlign: 'left' }} onClick={closePop}>
                {t('utilitybar.profile.settings')}
              </button>
              <button type="button" className="pop-foot" style={{ borderTop: 'none', textAlign: 'left' }} onClick={onToggleTheme}>
                {theme === 'pro' ? t('theme.night') : t('theme.day')}
              </button>
              <button type="button" className="pop-foot" style={{ borderTop: 'none', textAlign: 'left', color: 'var(--crimson)' }} onClick={() => { closePop(); onSignOut && onSignOut(); }}>
                {t('profile.signOut')}
              </button>
            </div>
          </PopoverPanel>
        </div>
      </div>
    </>
  );
}
