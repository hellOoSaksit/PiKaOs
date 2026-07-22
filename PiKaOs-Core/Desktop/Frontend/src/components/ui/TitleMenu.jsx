import React from 'react';
import { renderIcon } from './icons.jsx';
import Button from './Button.jsx';
import Modal from './Modal.jsx';
import { FORCE_CONNECT_KEY } from '../../AppBoot.jsx';

const { useState, useEffect, useCallback } = React;
const desk = () => (typeof window !== 'undefined' ? window.pikaosDesktop : undefined);

/** ☰ application menu — File / View / Help with fly-out submenus, collapsed into the title bar (the
 *  native OS menu bar was removed for a custom-chrome look). Desktop-only; each action calls the
 *  window bridge (quit/zoom/fullscreen/devtools) or a renderer helper (reload/disconnect/settings/
 *  sidebar/about). A full-screen scrim + Escape close it; hover or click opens a group's submenu. */
export default function TitleMenu({ t, onSettings, onToggleSidebar, version }) {
  const api = desk();
  const w = api?.window;
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(null);   // id of the group whose submenu is showing
  const [about, setAbout] = useState(false);
  const [reloading, setReloading] = useState(false);
  const isDev = !!(import.meta && import.meta.env && import.meta.env.DEV);

  const close = useCallback(() => { setOpen(false); setActive(null); }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, close]);

  const run = (fn) => () => { close(); fn && fn(); };
  // Same "drop the current server" behaviour as DisconnectButton — force the boot gate back to Connect.
  const disconnect = () => { try { sessionStorage.setItem(FORCE_CONNECT_KEY, '1'); } catch (e) { /* ignore */ } window.location.reload(); };
  // Manual reload with a beat of visible feedback: spin the icon, then reload. window.location.reload()
  // wipes the DOM instantly, so without the short hold the click never looks acknowledged (keepOpen keeps
  // the submenu on screen so the spin is actually seen).
  const reload = () => { if (reloading) return; setReloading(true); window.setTimeout(() => window.location.reload(), 500); };

  const groups = [
    { id: 'file', label: t('menu.file'), items: [
      { label: t('menu.settings'), on: onSettings },
      ...(api?.isDesktop ? [{ label: t('menu.disconnect'), on: disconnect }] : []),
      { sep: true },
      ...(w?.quit ? [{ label: t('menu.exit'), on: () => w.quit() }] : []),
    ] },
    { id: 'view', label: t('menu.view'), items: [
      { label: t('menu.reload'), icon: 'refresh', spin: reloading, keepOpen: true, on: reload },
      { label: t('menu.zoomIn'), on: () => w?.zoom('in') },
      { label: t('menu.zoomOut'), on: () => w?.zoom('out') },
      { label: t('menu.zoomReset'), on: () => w?.zoom('reset') },
      { sep: true },
      { label: t('menu.fullscreen'), on: () => w?.toggleFullscreen() },
      { label: t('menu.toggleSidebar'), on: onToggleSidebar },
    ] },
    { id: 'help', label: t('menu.help'), items: [
      ...(isDev && w?.toggleDevTools ? [{ label: t('menu.devtools'), on: () => w.toggleDevTools() }] : []),
      { label: t('menu.about'), on: () => setAbout(true) },
    ] },
  ];

  return (
    <div className="tb-menu">
      {/* Through the Button primitive, not a raw <button>: every title-bar rule is scoped to
          `.btn.tb-btn`, so a hand-rolled button matched NONE of them — it rendered at 16×6px with the
          browser's default chrome and a collapsed icon (icons.jsx emits a viewBox-only svg that takes
          its size from the `.btn` slot). Button also supplies the tooltip and aria-label. */}
      <Button className="tb-btn" icon="menu" label={t('menu.app')}
        aria-haspopup="menu" aria-expanded={open}
        onClick={() => (open ? close() : setOpen(true))} />

      {open && (
        <>
          <div className="tb-menu-scrim" onMouseDown={close} />
          <div className="tb-menu-pop" role="menu">
            {groups.map((g) => (
              <div key={g.id} className="tb-menu-group" onMouseEnter={() => setActive(g.id)}>
                <button type="button" role="menuitem" aria-haspopup="menu" aria-expanded={active === g.id}
                  className={'tb-menu-top' + (active === g.id ? ' is-active' : '')}
                  onClick={() => setActive(active === g.id ? null : g.id)}>
                  <span>{g.label}</span>
                  <span className="tb-menu-caret">{renderIcon('chevron-right')}</span>
                </button>
                {active === g.id && (
                  <div className="tb-submenu" role="menu">
                    {g.items.map((it, i) => it.sep
                      ? <div key={i} className="tb-menu-sep" />
                      : <button key={i} type="button" role="menuitem" className="tb-menu-item"
                          onClick={it.keepOpen ? it.on : run(it.on)}>
                          {it.icon && <span className={'tb-menu-ico' + (it.spin ? ' is-spin' : '')}>{renderIcon(it.icon, { size: 15 })}</span>}
                          <span>{it.label}</span>
                        </button>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}

      <Modal open={about} onClose={() => setAbout(false)} title={t('menu.about')}
        footer={<button type="button" className="btn btn-ghost btn-sm" onClick={() => setAbout(false)}>{t('menu.close')}</button>}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--ink)' }}>PiKaOs</div>
          <div className="mono" style={{ color: 'var(--ink-3)' }}>{t('home.version')} {version || '—'}</div>
        </div>
      </Modal>
    </div>
  );
}
