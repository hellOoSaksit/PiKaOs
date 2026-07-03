/* Modules / Plugins — the install screen (P2b frontend). Lists every discovered plugin with its registry
   state and lets an operator install / enable / disable / uninstall. Installing resolves the
   dependency-request via GET /plugins/{id}/install-plan: if a feature pulls in dependencies that aren't
   installed yet (e.g. RAG → AI) it confirms them in a modal; deps already installed are reused (no
   duplicate install). Effect is restart-to-apply — a mutation records desired state and the row shows a
   "restart" hint when the registry now differs from what this process mounted (plugin-lifecycle-ui §7). */
import React, { useEffect, useState } from 'react';

import { Btn, Empty, HelpNote, PageHead, Panel } from '../components/components.jsx';
import * as api from '../lib/api.js';

const STATE_BADGE = {
  enabled:       { cls: 'on',   en: 'Enabled',       th: 'เปิดใช้งาน' },
  disabled:      { cls: 'idle', en: 'Disabled',      th: 'ปิดอยู่' },
  installed:     { cls: 'info', en: 'Installed',     th: 'ติดตั้งแล้ว' },
  available:     { cls: '',     en: 'Available',     th: 'ยังไม่ติดตั้ง' },
  pending_purge: { cls: 'warn', en: 'Pending purge', th: 'รอล้างข้อมูล' },
};

function PluginRow({ p, T, may, busy, onInstall, onEnable, onDisable, onUninstall, onPurge, onCheckUpdate, updateInfo }) {
  const sb = STATE_BADGE[p.state] || STATE_BADGE.available;
  const lbl = (en, th) => (busy ? '…' : T(en, th));
  return (
    <Panel>
      <div className="row" style={{ justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
        <div>
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            {p.icon && <img src={p.icon} alt="" style={{ width: 20, height: 20, borderRadius: 4 }} />}
            <strong>{p.name}</strong>
            <span className={`badge ${sb.cls}`}>{T(sb.en, sb.th)}</span>
            <span className="mono faint" style={{ fontSize: 11 }}>v{p.version}</span>
            {p.restart_required && <span className="badge" title={T('restart to apply', 'รีสตาร์ทเพื่อให้มีผล')}>↻ {T('restart', 'รีสตาร์ท')}</span>}
            {updateInfo?.hasUpdate && <span className="badge" title={T('update available', 'มีเวอร์ชันใหม่')}>↑ v{updateInfo.latestVersion}</span>}
          </div>
          {p.description && <div className="faint" style={{ fontSize: 12, marginTop: 2 }}>{p.description}</div>}
          <div className="mono faint" style={{ fontSize: 11, marginTop: 3 }}>
            {p.id}
            {p.dependencies?.length ? ' · ' + T('needs', 'ต้องการ') + ': ' + p.dependencies.join(', ') : ''}
            {p.permissions?.length ? ` · ${p.permissions.length} ` + T('perms', 'สิทธิ์') : ''}
          </div>
        </div>
        {may && (
          <div className="row" style={{ gap: 6 }}>
            {p.state === 'pending_purge'
              ? <Btn kind="danger" sm onClick={onPurge}>{lbl('Purge data', 'ล้างข้อมูล')}</Btn>
              : <>
                  {p.state === 'available' && <Btn kind="gold" sm icon="⬇" onClick={onInstall}>{lbl('Install', 'ติดตั้ง')}</Btn>}
                  {p.state === 'enabled' && <Btn kind="ghost" sm onClick={onDisable}>{lbl('Disable', 'ปิด')}</Btn>}
                  {(p.state === 'disabled' || p.state === 'installed') && <Btn kind="gold" sm onClick={onEnable}>{lbl('Enable', 'เปิด')}</Btn>}
                  {p.installedVia === 'git' && updateInfo?.hasUpdate && <Btn kind="gold" sm onClick={onCheckUpdate}>{lbl('Update', 'อัปเดต')}</Btn>}
                  {p.state !== 'available' && <Btn kind="danger" sm icon="🗑" onClick={onUninstall}>{lbl('Uninstall', 'ถอน')}</Btn>}
                </>}
          </div>
        )}
      </div>
    </Panel>
  );
}

function InstallPlanModal({ plan, T, busy, onConfirm, onCancel }) {
  const deps = (plan.to_install || []).filter(id => id !== plan.target);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onCancel}>
      <div className="panel" style={{ maxWidth: 460, margin: 16 }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: 20 }}>
          <h3 style={{ marginTop: 0 }}>{T('Install', 'ติดตั้ง')} “{plan.target}”</h3>
          <p style={{ color: 'var(--ink-2)' }}>{T('This feature also needs these plugins, which aren’t installed yet:', 'ฟีเจอร์นี้ต้องการปลั๊กอินเหล่านี้ที่ยังไม่ได้ติดตั้ง:')}</p>
          <ul style={{ margin: '6px 0' }}>{deps.map(d => <li key={d} className="mono">{d}</li>)}</ul>
          {plan.already_installed?.length > 0 && (
            <p className="faint" style={{ fontSize: 12 }}>{T('Already installed (reused, not reinstalled): ', 'ติดตั้งแล้ว (ใช้ซ้ำ ไม่ลงซ้ำ): ')}{plan.already_installed.join(', ')}</p>
          )}
          <div className="row" style={{ gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
            <Btn kind="ghost" sm onClick={onCancel}>{T('Cancel', 'ยกเลิก')}</Btn>
            <Btn kind="gold" sm icon="⬇" onClick={onConfirm}>{busy ? '…' : T('Install all', 'ติดตั้งทั้งหมด')}</Btn>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PluginsManager({ Sys }) {
  const { T, can } = Sys;
  const may = can('plugins.manage');
  const [plugins, setPlugins] = useState(null);   // null = loading
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);          // plugin id mid-action
  const [restartHint, setRestartHint] = useState(false);
  const [plan, setPlan] = useState(null);          // dependency-request modal payload
  const [gitUrl, setGitUrl] = useState('');
  const [updates, setUpdates] = useState({});      // { [pluginId]: { latestVersion, hasUpdate } }

  const load = async () => {
    setErr(null);
    try { setPlugins(await api.listPlugins()); }
    catch (e) { setErr(e.message || 'load failed'); setPlugins([]); }
  };
  useEffect(() => { load(); }, []);

  // After the list loads, poll each git-installed plugin for a newer version (best-effort — a
  // failed check just leaves that row without an update badge, no error surfaced).
  useEffect(() => {
    if (!plugins) return;
    plugins.filter(p => p.installedVia === 'git').forEach(p => {
      api.checkPluginUpdate(p.id).then(r => setUpdates(u => ({ ...u, [p.id]: r }))).catch(() => {});
    });
  }, [plugins]);

  const applyResult = (res) => {
    if (res && res.plugins) { setPlugins(res.plugins); setRestartHint(!!res.restart_required); }
    else load();
  };
  const act = async (id, fn) => {
    setBusy(id); setErr(null);
    try { applyResult(await fn(id)); }
    catch (e) { setErr(e.message || 'action failed'); }
    finally { setBusy(null); }
  };

  // Install: resolve the dependency-request first; confirm via modal only when it pulls in extra plugins.
  const startInstall = async (id) => {
    setBusy(id); setErr(null);
    try {
      const p = await api.pluginInstallPlan(id);
      if ((p.to_install || []).length > 1) setPlan(p);          // deps beyond the target → confirm
      else applyResult(await api.installPlugin(id));            // nothing extra → install straight away
    } catch (e) { setErr(e.message || 'plan failed'); }
    finally { setBusy(null); }
  };
  const confirmInstall = async () => {
    const id = plan.target;
    setPlan(null);
    await act(id, api.installPlugin);
  };

  const submitGitInstall = async () => {
    if (!gitUrl.trim()) return;
    setBusy('git-install'); setErr(null);
    try { applyResult(await api.installFromGit(gitUrl.trim())); setGitUrl(''); }
    catch (e) { setErr(e.message || 'install failed'); }
    finally { setBusy(null); }
  };

  if (plugins === null) {
    return <div className="content-pad"><Empty icon="🧩" title={T('Loading modules…', 'กำลังโหลดโมดูล…')} /></div>;
  }

  return (
    <div className="content-pad fade-in" data-no-lex>
      <PageHead
        kicker={T('Administration · Plugins', 'ผู้ดูแลระบบ · ปลั๊กอิน')}
        title={T('Modules / Plugins', 'โมดูล / ปลั๊กอิน')}
        desc={T('Choose which features this deployment runs. Installing a feature also pulls in anything it depends on (e.g. RAG needs AI); a dependency that is already installed is reused, never installed twice.',
                'เลือกว่าระบบนี้จะเปิดฟีเจอร์ไหน · การติดตั้งฟีเจอร์จะดึงสิ่งที่มันพึ่งพามาด้วย (เช่น RAG ต้องการ AI) · ตัวที่ติดตั้งแล้วจะถูกใช้ซ้ำ ไม่ลงซ้ำ')}
        actions={<Btn kind="ghost" sm icon="↻" onClick={load}>{T('Refresh', 'รีเฟรช')}</Btn>} />

      {may && (
        <Panel>
          <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <input className="bf-input" style={{ flex: 1, minWidth: 240 }} placeholder={T('Git URL to install…', 'ลิงก์ Git ที่จะติดตั้ง…')}
              value={gitUrl} onChange={e => setGitUrl(e.target.value)} disabled={!may} />
            <Btn kind="gold" sm icon="⬇" disabled={!may || busy === 'git-install'} onClick={submitGitInstall}>
              {busy === 'git-install' ? '…' : T('Install from Git', 'ติดตั้งจาก Git')}
            </Btn>
          </div>
        </Panel>
      )}

      {!may && <HelpNote tag="local">{T('You can view modules, but installing / enabling needs the “plugins.manage” permission.',
        'ดูได้ แต่การติดตั้ง/เปิด-ปิด ต้องมีสิทธิ์ “plugins.manage”')}</HelpNote>}
      {restartHint && <HelpNote>{T('Saved. Restart the backend to apply — modules mount at startup (restart-to-apply).',
        'บันทึกแล้ว · รีสตาร์ท backend เพื่อให้มีผล — โมดูลถูกโหลดตอนเริ่มระบบ')}</HelpNote>}
      {err && <HelpNote>{T('Error: ', 'ผิดพลาด: ')}{err}</HelpNote>}

      {plugins.length === 0
        ? <Empty icon="🧩" title={T('No plugins discovered', 'ไม่พบปลั๊กอิน')} sub={T('This is a Base-only build.', 'บิลด์นี้เป็น Base ล้วน')} />
        : <div style={{ display: 'grid', gap: 12 }}>
            {plugins.map(p => (
              <PluginRow key={p.id} p={p} T={T} may={may} busy={busy === p.id}
                onInstall={() => startInstall(p.id)} onEnable={() => act(p.id, api.enablePlugin)}
                onDisable={() => act(p.id, api.disablePlugin)} onUninstall={() => act(p.id, api.uninstallPlugin)}
                onPurge={() => act(p.id, api.purgePlugin)}
                onCheckUpdate={() => act(p.id, api.updatePlugin)} updateInfo={updates[p.id]} />
            ))}
          </div>}

      {plan && <InstallPlanModal plan={plan} T={T} busy={busy === plan.target} onConfirm={confirmInstall} onCancel={() => setPlan(null)} />}
    </div>
  );
}
