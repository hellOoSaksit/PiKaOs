/* Modules / Plugins — the install screen (P2b frontend). Lists every discovered plugin with its registry
   state and lets an operator install / enable / disable / uninstall. Installing resolves the
   dependency-request via GET /plugins/{id}/install-plan: if a feature pulls in dependencies that aren't
   installed yet (e.g. RAG → AI) it confirms them in a modal; deps already installed are reused (no
   duplicate install). Effect is restart-to-apply — a mutation records desired state and the row shows a
   "restart" hint when the registry now differs from what this process mounted (plugin-lifecycle-ui §7). */
import React, { useEffect, useState } from 'react';

import { Btn } from '../components/components.jsx';
import { Empty, HelpNote, PageHead, Panel, Segmented } from '../components/ui/index.js';
import { LocalMcp } from './secondary/LocalMcp.jsx';
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
            {updateInfo?.tagMoved && <span className="badge warn" title={T('the installed tag was moved to a different commit after install', 'แท็กที่ติดตั้งถูกย้ายไปคอมมิตอื่นหลังติดตั้ง')}>⚠ {T('tag moved', 'แท็กถูกย้าย')}</span>}
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

function GitCredentialsPanel({ T, t, busy, onSave }) {
  const [host, setHost] = useState('');
  const [token, setToken] = useState('');
  const submit = async () => {
    if (!host.trim() || !token.trim()) return;
    await onSave(host.trim(), token.trim());
    setHost(''); setToken('');
  };
  return (
    <Panel title={t('pkg.cred.title')} en="CREDENTIALS">
      <div className="faint" style={{ fontSize: 12, marginBottom: 6 }}>
        {T('One token per host, stored encrypted, never shown again.',
           'หนึ่งโทเคนต่อโฮสต์ เก็บแบบเข้ารหัส ไม่แสดงซ้ำ')}
      </div>
      <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
        <input className="bf-input" style={{ flex: 1, minWidth: 160 }} placeholder={T('Host (e.g. github.com)', 'โฮสต์ (เช่น github.com)')}
          value={host} onChange={e => setHost(e.target.value)} />
        <input className="bf-input" type="password" style={{ flex: 2, minWidth: 200 }} placeholder={T('Access token', 'โทเคน')}
          value={token} onChange={e => setToken(e.target.value)} />
        <Btn kind="ghost" sm disabled={busy === 'git-cred'} onClick={submit}>
          {busy === 'git-cred' ? '…' : T('Save credential', 'บันทึกโทเคน')}
        </Btn>
      </div>
    </Panel>
  );
}

function InstallPlanModal({ plan, target, T, busy, onConfirm, onCancel }) {
  const deps = (plan.to_install || []).filter(id => id !== plan.target);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }} onClick={onCancel}>
      <div className="panel" style={{ maxWidth: 460, margin: 16 }} onClick={e => e.stopPropagation()}>
        <div style={{ padding: 20 }}>
          <h3 style={{ marginTop: 0 }}>{T('Install', 'ติดตั้ง')} “{plan.target}”</h3>
          {deps.length > 0 && (
            <>
              <p style={{ color: 'var(--ink-2)' }}>{T('This feature also needs these plugins, which aren’t installed yet:', 'ฟีเจอร์นี้ต้องการปลั๊กอินเหล่านี้ที่ยังไม่ได้ติดตั้ง:')}</p>
              <ul style={{ margin: '6px 0' }}>{deps.map(d => <li key={d} className="mono">{d}</li>)}</ul>
            </>
          )}
          {plan.already_installed?.length > 0 && (
            <p className="faint" style={{ fontSize: 12 }}>{T('Already installed (reused, not reinstalled): ', 'ติดตั้งแล้ว (ใช้ซ้ำ ไม่ลงซ้ำ): ')}{plan.already_installed.join(', ')}</p>
          )}
          {target?.permissionInfo?.length > 0 && (
            <>
              <p style={{ color: 'var(--ink-2)', marginTop: 12 }}>{T('This plugin will be granted:', 'ปลั๊กอินนี้จะได้รับสิทธิ์:')}</p>
              <ul style={{ margin: '6px 0' }}>
                {target.permissionInfo.map(pi => (
                  <li key={pi.key}>
                    <span className="mono">{pi.key}</span>
                    {pi.rationale && <span className="faint"> — {pi.rationale}</span>}
                  </li>
                ))}
              </ul>
            </>
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

/* Modules admin — one component, three sibling nav screens under "Tools" (data.jsx: toolsmgr children).
   `view` picks which screen this instance renders:
     'modules' — the installed/discovered plugin list + manage actions
     'market'  — the Marketplace placeholder (no plugin list needed)
     'mine'    — install-from-git + git credentials + the (disabled) Share affordance
     'all'     — mine + modules stacked, for the nav-less bootstrap shell (KernelOnlyShell) */
export function PluginsManager({ Sys, view = 'modules' }) {
  const { T, t, can } = Sys;
  const may = can('plugins.manage');
  const [plugins, setPlugins] = useState(null);   // null = loading
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(null);          // plugin id mid-action
  const [restartHint, setRestartHint] = useState(false);
  const [plan, setPlan] = useState(null);          // dependency-request modal payload
  const [gitUrl, setGitUrl] = useState('');
  const [gitRef, setGitRef] = useState('');
  const [allowHead, setAllowHead] = useState(false);
  const [updates, setUpdates] = useState({});      // { [pluginId]: { latestVersion, hasUpdate, tagMoved } }
  // Marketplace hub tab. Local MCP controls the user's own machine → desktop-shell only, so it's
  // absent on web and the default falls to the first web-visible tab. Hooks run unconditionally
  // (this lives with the others, above the view-based early returns).
  const [mktTab, setMktTab] = useState(window.pikaosDesktop?.isDesktop ? 'localmcp' : 'onlinemcp');

  // Sharing to the market lives in the Auth plugin (kernel is zero-DB — identity can't live in Core);
  // the Share affordance is gated on that plugin being installed + enabled (drafted, not built yet).
  const authReady = (plugins || []).some(p => p.id === 'auth' && p.state === 'enabled');

  const load = async () => {
    setErr(null);
    try { setPlugins(await api.listPlugins()); }
    catch (e) { setErr(e.message || 'load failed'); setPlugins([]); }
  };
  // The Marketplace view is a static placeholder — it needs no plugin list, so skip the fetch there.
  useEffect(() => { if (view !== 'market') load(); }, [view]);

  // After the list loads, poll each git-installed plugin for a newer version (best-effort — a
  // failed check just leaves that row without an update badge, no error surfaced).
  useEffect(() => {
    if (!plugins) return;
    plugins.filter(p => p.installedVia === 'git').forEach(p => {
      api.checkPluginUpdate(p.id).then(r => setUpdates(u => ({ ...u, [p.id]: r }))).catch(() => {});
    });
  }, [plugins]);

  // Every successful mutation funnels through here (install · enable · disable · uninstall · git
  // install), which makes it the one place the shell needs telling that the server just emitted a
  // notification for it — otherwise the bell's badge sits stale until the next sign-in.
  const applyResult = (res) => {
    if (res && res.plugins) { setPlugins(res.plugins); setRestartHint(!!res.restart_required); }
    else load();
    Sys.onAdminMutated?.();
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
      const tgt = plugins.find(x => x.id === id);
      const hasExtraDeps = (p.to_install || []).length > 1;     // deps beyond the target
      const hasPerms = (tgt?.permissionInfo || []).length > 0;  // permissions to confirm
      if (hasExtraDeps || hasPerms) setPlan(p);                 // confirm on deps OR permissions
      else applyResult(await api.installPlugin(id));            // nothing to confirm → install straight away
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
    try {
      applyResult(await api.installFromGit(gitUrl.trim(), { ref: gitRef.trim(), allowHead }));
      setGitUrl(''); setGitRef(''); setAllowHead(false);
    }
    catch (e) { setErr(e.message || 'install failed'); }
    finally { setBusy(null); }
  };

  const saveGitCredential = async (host, token) => {
    setBusy('git-cred'); setErr(null);
    try { await api.setGitCredential(host, token); }
    catch (e) { setErr(e.message || 'save failed'); }
    finally { setBusy(null); }
  };

  // Marketplace — a 3-tab hub (Local MCP · Online MCP · Skills). Local MCP controls the user's own
  // machine, so it's a desktop-shell-only tab (absent on web); the other two are placeholders this
  // round. All copy comes from i18n keys (no hardcoded strings).
  if (view === 'market') {
    const isDesktop = !!window.pikaosDesktop?.isDesktop;
    const tabs = [
      ...(isDesktop ? [{ value: 'localmcp' }] : []),
      { value: 'onlinemcp' },
      { value: 'skills' },
    ];
    const active = tabs.find(x => x.value === mktTab) || tabs[0];
    // Header + tab bar in one content-pad; the tab body renders as a SIBLING so LocalMcp's own
    // content-pad (it brings its own chrome) doesn't nest and double the padding.
    return (
      <div className="fade-in" data-no-lex>
        <div className="content-pad" style={{ paddingBottom: 0 }}>
          <PageHead kicker={t('mkt.kicker')} title={t('mkt.title')} desc={t('mkt.pagedesc')} />
          <Segmented
            options={tabs.map(x => ({ value: x.value, label: t('mkt.tab.' + x.value) }))}
            value={active.value} onChange={setMktTab} />
          <p className="faint" style={{ margin: '10px 2px 4px', fontSize: 13, lineHeight: 1.5 }}>
            {t('mkt.tabdesc.' + active.value)}
          </p>
        </div>
        {active.value === 'localmcp' && <LocalMcp Sys={Sys} />}
        {active.value === 'onlinemcp' && (
          <div className="content-pad"><Empty icon="🌐" title={t('mkt.soon', { name: t('mkt.tab.onlinemcp') })} sub={t('mkt.tabdesc.onlinemcp')} /></div>
        )}
        {active.value === 'skills' && (
          <div className="content-pad"><Empty icon="🧠" title={t('mkt.soon', { name: t('mkt.tab.skills') })} sub={t('mkt.tabdesc.skills')} /></div>
        )}
      </div>
    );
  }

  if (plugins === null) {
    return <div className="content-pad"><Empty icon="🧩" title={T('Loading modules…', 'กำลังโหลดโมดูล…')} /></div>;
  }

  const showMine = view === 'mine' || view === 'all';
  const showModules = view === 'modules' || view === 'all';

  return (
    <div className="content-pad fade-in" data-no-lex>
      {/* Global notices — a restart/error from either section surfaces here. */}
      {restartHint && <HelpNote>{T('Saved. Restart the backend to apply — modules mount at startup (restart-to-apply).',
        'บันทึกแล้ว · รีสตาร์ท backend เพื่อให้มีผล — โมดูลถูกโหลดตอนเริ่มระบบ')}</HelpNote>}
      {err && <HelpNote>{T('Error: ', 'ผิดพลาด: ')}{err}</HelpNote>}

      {showModules && (
        <>
          <PageHead
            kicker={T('Administration · Plugins', 'ผู้ดูแลระบบ · ปลั๊กอิน')}
            title={T('Modules / Plugins', 'โมดูล / ปลั๊กอิน')}
            desc={T('Choose which features this deployment runs. Installing a feature also pulls in anything it depends on (e.g. RAG needs AI); a dependency that is already installed is reused, never installed twice.',
                    'เลือกว่าระบบนี้จะเปิดฟีเจอร์ไหน · การติดตั้งฟีเจอร์จะดึงสิ่งที่มันพึ่งพามาด้วย (เช่น RAG ต้องการ AI) · ตัวที่ติดตั้งแล้วจะถูกใช้ซ้ำ ไม่ลงซ้ำ')}
            actions={<Btn kind="ghost" sm icon="↻" onClick={load}>{T('Refresh', 'รีเฟรช')}</Btn>} />
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
        </>
      )}

      {showMine && (
        <>
          <PageHead
            kicker={T('Administration · My Packages', 'ผู้ดูแลระบบ · แพ็กเกจของฉัน')}
            title={T('My Packages & Share', 'แพ็กเกจของฉัน')}
            desc={T('Install a package straight from a git URL. Sharing your own packages to the Marketplace is coming soon.',
                    'ติดตั้งแพ็กเกจจากลิงก์ git โดยตรง · การแชร์แพ็กเกจของคุณขึ้นมาร์เก็ตเพลสจะมาเร็วๆ นี้')} />
          {may ? (
            <>
              <Panel title={t('pkg.git.title')} en="GIT INSTALL">
                <div className="row" style={{ gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <input className="bf-input" style={{ flex: 2, minWidth: 240 }} placeholder={T('Git URL to install…', 'ลิงก์ Git ที่จะติดตั้ง…')}
                    value={gitUrl} onChange={e => setGitUrl(e.target.value)} disabled={!may} />
                  <input className="bf-input" style={{ flex: 1, minWidth: 120 }} placeholder={T('Tag (optional)', 'แท็ก (ไม่บังคับ)')}
                    value={gitRef} onChange={e => setGitRef(e.target.value)} disabled={!may} />
                  <Btn kind="gold" sm icon="⬇" disabled={!may || busy === 'git-install'} onClick={submitGitInstall}>
                    {busy === 'git-install' ? '…' : T('Install from Git', 'ติดตั้งจาก Git')}
                  </Btn>
                </div>
                <label className="row" style={{ gap: 6, alignItems: 'center', marginTop: 6, fontSize: 12 }}>
                  <input type="checkbox" checked={allowHead} onChange={e => setAllowHead(e.target.checked)} disabled={!may} />
                  <span className="faint">{T('Allow installing an untagged default branch (not recommended — unpinned)',
                    'ยอมให้ติดตั้งจาก branch ที่ไม่มีแท็ก (ไม่แนะนำ — ไม่ตรึงเวอร์ชัน)')}</span>
                </label>
                <HelpNote tag="tip">{T('Leave the tag blank to pin the latest release automatically.',
                  'เว้นแท็กว่างไว้เพื่อตรึงเวอร์ชัน release ล่าสุดโดยอัตโนมัติ')}</HelpNote>
              </Panel>

              <GitCredentialsPanel T={T} t={t} busy={busy} onSave={saveGitCredential} />
            </>
          ) : (
            <HelpNote tag="local">{T('You can view modules, but installing / enabling needs the “plugins.manage” permission.',
              'ดูได้ แต่การติดตั้ง/เปิด-ปิด ต้องมีสิทธิ์ “plugins.manage”')}</HelpNote>
          )}

          {/* Share to the Marketplace — drafted, not built. Gated on the Auth plugin (identity lives there,
              not in the zero-DB kernel). Disabled hint until that plugin is installed + enabled. */}
          <HelpNote tag="tip">{authReady
            ? T('Publishing your packages to the Marketplace is coming soon.',
                'การเผยแพร่แพ็กเกจของคุณขึ้นมาร์เก็ตเพลสจะมาเร็วๆ นี้')
            : T('Sharing to the Marketplace needs the Auth plugin (identity) — install it to enable.',
                'การแชร์ขึ้นมาร์เก็ตเพลสต้องติดตั้ง Auth plugin (ระบบยืนยันตัวตน) ก่อนจึงจะใช้ได้')}</HelpNote>
        </>
      )}

      {plan && <InstallPlanModal plan={plan} target={plugins.find(p => p.id === plan.target)}
        T={T} busy={busy === plan.target} onConfirm={confirmInstall} onCancel={() => setPlan(null)} />}
    </div>
  );
}
