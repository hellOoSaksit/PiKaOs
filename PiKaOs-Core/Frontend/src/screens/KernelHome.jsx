/* PiKaOs — kernel-only Home. The landing for a Core build with no feature plugins: shows the
   connected server's identity (from /api/capabilities) + the installed-module inventory + a shortcut
   to Install. Replaces the game-era MyDashboard as the default landing and guard fallback. */
import React from 'react';
import { Panel, Btn, PageHead } from '../components/components.jsx';

export function KernelHome({ Sys, caps, go }) {
  const t = Sys.t;
  const c = caps || {};
  const plugins = Array.isArray(c.plugins) ? c.plugins : [];
  const mode = c.authMode === 'open' ? t('home.modeOpen') : t('home.modeLogin');
  return (
    <div className="content-pad fade-in">
      <PageHead title={t('home.title')} desc={t('home.subtitle')} />
      <div className="grid cols-2" style={{ gap: 16, marginTop: 16 }}>
        <Panel title={t('home.serverGroup')}>
          <div className="kv-row"><span className="kv-k">{t('home.version')}</span><span className="kv-v mono">{c.version || '—'}</span></div>
          <div className="kv-row"><span className="kv-k">{t('home.mode')}</span><span className="kv-v">{mode}</span></div>
          <div className="kv-row"><span className="kv-k">{t('home.instance')}</span><span className="kv-v mono">{(c.instanceId || '—').slice(0, 8)}</span></div>
        </Panel>
        <Panel title={t('home.modulesGroup')} right={<Btn kind="ghost" sm onClick={() => go('install')}>{t('home.goInstall')}</Btn>}>
          {plugins.length === 0
            ? <div className="muted" style={{ fontSize: 13 }}>{t('home.modulesNone')}</div>
            : <div className="list-rows">{plugins.map(p => (
                <div key={p.id} className="list-row"><span className="mono">{p.id}</span><span className="muted">{p.version}</span></div>
              ))}</div>}
        </Panel>
      </div>
    </div>
  );
}
