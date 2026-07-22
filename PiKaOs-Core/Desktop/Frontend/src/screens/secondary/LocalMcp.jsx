/* PiKaOs — Local MCP list view (desktop-only). Drives the main-process MCP runtime via the
   `window.pikaosDesktop` bridge (Desktop/src/preload): install a ready-made server or register a
   custom one, start/stop it, and watch its status live. Opening a row switches to the per-server
   detail page (LocalMcpDetail.jsx). Pure helpers live in LocalMcp.logic.js, the catalog in
   ../../data/mcpPresets.js, the raw command form in McpServerForm.jsx (the detail page reuses it).
   Renders nothing on web (no bridge there).

   Status semantics (Desktop/src/main/mcp/manager.ts FSM): `running` = the OS process is up,
   `ready` = the MCP handshake (initialize + tools/list) actually succeeded. A status is delivered
   as { status, lastError } — lastError is a token (see errorKey) or null.

   A server's secret VALUE (if any) is written only to `secrets.setForServer` (main-process vault,
   namespaced `mcp.<id>.<key>`) — never sent to `mcp.add`, never logged, never rendered back.
   Starting a server may pop a native consent dialog the first time (or after command/args change);
   that flow lives in the main process and isn't reproduced here.

   Primitives are imported per-file rather than from the `components/ui` barrel on purpose: the
   barrel re-exports TitleBar -> AppBoot -> lib/i18n, which touches `window` at module scope and so
   cannot be imported by the node-environment component tests (LocalMcp.view.test.js). */
import React from 'react';
const { useEffect, useState } = React;
import Button from '../../components/ui/Button.jsx';
import Empty from '../../components/ui/Empty.jsx';
import PageHead from '../../components/ui/PageHead.jsx';
import Panel from '../../components/ui/Panel.jsx';
import { MCP_PRESETS } from '../../data/mcpPresets.js';
import { presetToDef, errorKey, statusMeta, isRunning, replaceTarget, isConsentDenied } from './LocalMcp.logic.js';
import { ActionErrorNote, LocalMcpDetail } from './LocalMcpDetail.jsx';
import { McpServerForm } from './McpServerForm.jsx';

// Gallery-only pseudo-preset: the escape hatch to the raw command form. Its copy already lives
// under the same mcp.preset.<id>.* keys, so it renders through PresetCard unchanged.
const CUSTOM = { id: 'custom', icon: '⚙️', params: [], secret: null };

const EXPLAINER_KEY = 'mcp.explainer.collapsed';
// Injected storage keeps this testable without a DOM; anything but the set flag means "show it".
export const explainerCollapsed = (storage) => storage.getItem(EXPLAINER_KEY) === '1';

export function PresetCard({ t, preset, installed, onPick, onOpen }) {
  // An installed card is the way back to that server's page — otherwise the only way in is to hunt
  // for its row further down. Same open affordance as ServerRow, keyboard included; an installed
  // card has no nested control, so no click-swallowing is needed.
  const open = installed && onOpen
    ? {
        role: 'button', tabIndex: 0, onClick: onOpen,
        onKeyDown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } },
      }
    : {};
  return (
    <div {...open} style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: 10, borderRadius: 10,
      border: '1px solid var(--line-soft)', background: 'var(--bg-3)', cursor: open.onClick ? 'pointer' : undefined }}>
      <div className="row" style={{ gap: 8 }}>
        <span style={{ fontSize: 18 }}>{preset.icon}</span>
        <span style={{ fontWeight: 600, fontSize: 13.5 }}>{t(`mcp.preset.${preset.id}.name`)}</span>
      </div>
      <div className="faint" style={{ fontSize: 12, lineHeight: 1.5, flex: 1 }}>{t(`mcp.preset.${preset.id}.desc`)}</div>
      {installed
        ? <div className="row" style={{ gap: 8 }}>
            <span className="badge on" data-no-lex>{t('mcp.preset.installed')}</span>
            <span className="faint" style={{ fontSize: 11.5 }}>{t('mcp.list.open')} ›</span>
          </div>
        : <div><Button kind="gold" size="sm" onClick={onPick}>{t('mcp.preset.install')}</Button></div>}
    </div>
  );
}

export function ServerRow({ t, d, status, lastError, toolCount, busy, onOpen, onStart, onStop }) {
  const sb = statusMeta(status);
  // The row itself is the "open" affordance, so the Start/Stop control has to swallow its click.
  const keepInRow = (e) => e.stopPropagation();
  return (
    <div className="tool-row" role="button" tabIndex={0} style={{ flexWrap: 'wrap', cursor: 'pointer' }}
      onClick={onOpen}
      onKeyDown={(e) => {
        // keydown bubbles: without the target check, Enter on the focused Start/Stop button would
        // fire that button AND open the row.
        if (e.target !== e.currentTarget) return;
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); }
      }}>
      <span className="tool-ic">🔌</span>
      <div className="tool-bd" style={{ minWidth: 0 }}>
        <div className="tool-name">
          {d.label || d.id} <span className={`badge ${sb.cls}`} data-no-lex>{t(sb.key)}</span>
        </div>
        <div className="mono faint" style={{ fontSize: 11, marginTop: 3 }}>
          {d.id}{toolCount ? ` · ${t('mcp.list.tools', { n: toolCount })}` : ''}
        </div>
        {status === 'error' && (
          <div style={{ fontSize: 11.5, marginTop: 3, lineHeight: 1.5 }}>
            {t(errorKey(lastError))}{' '}
            {lastError === 'node-missing' && (
              <a href="https://nodejs.org/" target="_blank" rel="noreferrer" onClick={keepInRow}>
                {t('mcp.err.node-missing.link')}
              </a>
            )}
          </div>
        )}
      </div>
      <span onClick={keepInRow}>
        {isRunning(status)
          ? <Button kind="ghost" size="sm" disabled={busy} onClick={onStop}>{busy ? '…' : t('mcp.row.stop')}</Button>
          : <Button kind="gold" size="sm" disabled={busy} onClick={onStart}>{busy ? '…' : t('mcp.row.start')}</Button>}
      </span>
      <span className="faint" style={{ fontSize: 11.5 }}>{t('mcp.list.open')} ›</span>
    </div>
  );
}

// One question per preset param, in plain language — no command line anywhere.
function PresetInstallPanel({ t, preset, busy, onInstall, onCancel }) {
  const [values, setValues] = useState({});
  const [secretValue, setSecretValue] = useState('');
  // A preset that declares a secret is unusable without it: the install would skip the vault write and
  // the server would fail at start with nothing to explain it. So gate submit on the token too.
  const filled = preset.params.every(p => (values[p.name] || '').trim().length > 0)
    && (!preset.secret || secretValue.trim().length > 0);
  const secretId = `mcp-secret-${preset.id}`;

  return (
    <Panel title={t(`mcp.preset.${preset.id}.name`)}>
      <div className="faint" style={{ fontSize: 12.5, marginBottom: 8, lineHeight: 1.5 }}>{t(`mcp.preset.${preset.id}.desc`)}</div>
      {preset.params.map(p => (
        <div key={p.name} style={{ marginBottom: 8 }}>
          <label htmlFor={`mcp-param-${preset.id}-${p.name}`} style={{ display: 'block', fontSize: 12.5, marginBottom: 4 }}>
            {t(`mcp.preset.${preset.id}.param.${p.name}`)}
          </label>
          <input id={`mcp-param-${preset.id}-${p.name}`} className="bf-input" style={{ width: '100%' }}
            value={values[p.name] || ''} onChange={e => setValues(v => ({ ...v, [p.name]: e.target.value }))} />
        </div>
      ))}
      {preset.secret && (
        <div style={{ marginBottom: 8 }}>
          {/* A visible label, not just the placeholder — a placeholder disappears on focus and is not
              reliably announced by screen readers. */}
          <label htmlFor={secretId} style={{ display: 'block', fontSize: 12.5, marginBottom: 4 }}>
            {t('mcp.preset.secret.label')}
          </label>
          <input id={secretId} className="bf-input" type="password" style={{ width: '100%' }} autoComplete="new-password"
            placeholder={t('mcp.preset.secret.ph')} value={secretValue} onChange={e => setSecretValue(e.target.value)} />
        </div>
      )}
      <div className="row" style={{ gap: 8 }}>
        <Button kind="gold" size="sm" disabled={!filled || busy} onClick={() => onInstall(values, secretValue)}>
          {busy ? '…' : t('mcp.preset.installStart')}
        </Button>
        <Button kind="ghost" size="sm" disabled={busy} onClick={onCancel}>{t('mcp.preset.cancel')}</Button>
      </div>
    </Panel>
  );
}

export function LocalMcp({ Sys }) {
  const isDesktop = !!window.pikaosDesktop?.isDesktop;
  const t = (Sys && typeof Sys.t === 'function') ? Sys.t : ((k) => k);
  const [view, setView] = useState('list');          // 'list' | server id
  const [servers, setServers] = useState([]);
  const [statuses, setStatuses] = useState({});      // id → { status, lastError }
  const [toolsById, setToolsById] = useState({});    // id → Tool[], fetched when a server is ready
  const [busy, setBusy] = useState(null);            // 'add' | server id | null
  const [err, setErr] = useState(null);              // { key, detail } — localized sentence + raw text
  const [installPreset, setInstallPreset] = useState(null);
  const [showCustom, setShowCustom] = useState(false);
  const [collapsed, setCollapsed] = useState(() => explainerCollapsed(window.localStorage));

  const load = async () => {
    setErr(null);
    try {
      const [list, st] = await Promise.all([window.pikaosDesktop.mcp.list(), window.pikaosDesktop.mcp.statuses()]);
      setServers(list || []);
      setStatuses(st || {});
      // onStatus only fetches tools on a fresh `ready` transition; a server that's ALREADY ready on
      // (re)mount never fires that, so pull its tools here too — otherwise the list shows empty until restart.
      for (const [id, s] of Object.entries(st || {})) { if (s.status === 'ready') fetchTools(id); }
    } catch (e) { setErr({ key: 'mcp.err.action.load', detail: e?.message || null }); }
  };

  const fetchTools = async (id) => {
    try { const tl = await window.pikaosDesktop.mcp.tools(id); setToolsById(prev => ({ ...prev, [id]: tl || [] })); }
    catch { /* leaf UI — a tool-list fetch failure just leaves the list empty */ }
  };

  // Hooks run unconditionally (react-hooks/rules-of-hooks); the desktop-only gate guards the JSX
  // below, not the hook calls. This effect double-guards so it's a no-op on web.
  useEffect(() => {
    if (!isDesktop) return;
    load();
    window.pikaosDesktop.mcp.onStatus((id, s, lastError) => {
      setStatuses(prev => ({ ...prev, [id]: { status: s, lastError } }));
      if (s === 'ready') fetchTools(id);                       // pull the tool list the moment it's usable
      else if (s === 'stopped' || s === 'error') setToolsById(prev => ({ ...prev, [id]: [] }));
    });
  }, [isDesktop]);

  // A banner belongs to the view that raised it; without this a failure on the list page is still
  // sitting there when the user opens a server (and vice versa).
  useEffect(() => { setErr(null); }, [view]);

  const toggleExplainer = () => {
    const next = !collapsed;
    window.localStorage.setItem(EXPLAINER_KEY, next ? '1' : '0');
    setCollapsed(next);
  };

  /* Add, or replace an existing def: the manager has no update op, so an edit is remove-then-add.
     Returns whether the save landed. Failures are shown as a banner rather than thrown, so the
     forms above cannot tell success from failure by awaiting — they read this flag to decide
     whether to clear or close, and keep the user's input when it says false. */
  const saveServer = async ({ id, label, command, args, secretKey, secretValue }, replaceId) => {
    setBusy('add'); setErr(null);
    // The live processes (McpManager) and the stored defs (registry JSON) are separate stores, so
    // mcp.remove drops the def WITHOUT reaping its child: an edit would otherwise leave the old command
    // still running under a def that says something else. Stop first, then restart the replacement —
    // which also re-triggers consent, since the command/args hash changed.
    // The target is DERIVED, not taken on trust: only the edit path passes replaceId, but the add
    // path can collide with a stored id too (registry.add upserts) — and that is a replace as well.
    const target = replaceTarget(servers, id, replaceId);
    const wasRunning = !!target && isRunning(statuses[target]?.status);
    try {
      if (target) {
        if (wasRunning) await window.pikaosDesktop.mcp.stop(target);
        await window.pikaosDesktop.mcp.remove(target);
      }
      // Secret VALUE goes to the vault only — never into the server def (mcp.add), never logged.
      if (secretKey && secretValue) await window.pikaosDesktop.secrets.setForServer(id, secretKey, secretValue);
      await window.pikaosDesktop.mcp.add({ id, label, command, args, secretKeys: secretKey ? [secretKey] : [] });
      setShowCustom(false);
      await load();
      if (wasRunning) await window.pikaosDesktop.mcp.start(id);
      return true;
    } catch (e) {
      // Only the trailing restart can raise consent denial, and by then the def is already stored —
      // a declined restart still means the save landed, so the form may close.
      if (isConsentDenied(e)) return true;
      setErr({ key: 'mcp.err.action.save', detail: e?.message || null });
      return false;
    }
    finally { setBusy(null); }
  };

  // A preset def goes through mcp.add like any other — presets get no validation bypass.
  const installFromPreset = async (preset, paramValues, secretValue) => {
    setBusy('add'); setErr(null);
    try {
      if (preset.secret && secretValue) await window.pikaosDesktop.secrets.setForServer(preset.id, preset.secret.key, secretValue);
      await window.pikaosDesktop.mcp.add(presetToDef(preset, paramValues, t(`mcp.preset.${preset.id}.name`)));
      setInstallPreset(null);
      await load();                                  // the detail page needs the def before it opens
      setView(preset.id);
      await window.pikaosDesktop.mcp.start(preset.id);   // consent → ready progresses in front of the user
    } catch (e) {
      // Declining consent on the trailing start is not a failed install — the def is stored and the
      // FSM already put the server back to `stopped`, which the detail page shows on its own.
      if (!isConsentDenied(e)) setErr({ key: 'mcp.err.action.install', detail: e?.message || null });
    }
    finally { setBusy(null); }
  };

  const start = async (id) => {
    setBusy(id); setErr(null);
    try { await window.pikaosDesktop.mcp.start(id); }
    catch (e) { if (!isConsentDenied(e)) setErr({ key: 'mcp.err.action.start', detail: e?.message || null }); }
    finally { setBusy(null); }
  };
  const stop = async (id) => {
    setBusy(id); setErr(null);
    try { await window.pikaosDesktop.mcp.stop(id); }
    catch (e) { setErr({ key: 'mcp.err.action.stop', detail: e?.message || null }); }
    finally { setBusy(null); }
  };

  const removeServer = async (id) => {
    const ok = await window.uiConfirm({ title: t('mcp.confirm.delete.title'), message: t('mcp.confirm.delete.msg'), danger: true });
    if (!ok) return;
    setBusy(id); setErr(null);
    try {
      if (isRunning(statuses[id]?.status)) await window.pikaosDesktop.mcp.stop(id);
      await window.pikaosDesktop.mcp.remove(id);
      setView('list');
      await load();
    } catch (e) { setErr({ key: 'mcp.err.action.remove', detail: e?.message || null }); }
    finally { setBusy(null); }
  };

  const pickPreset = (preset) => {
    if (preset.id === CUSTOM.id) { setInstallPreset(null); setShowCustom(true); return; }
    setShowCustom(false); setInstallPreset(preset);
  };

  if (!isDesktop) return null;   // desktop-only screen — nothing to render on web

  const openDef = view === 'list' ? null : servers.find(s => s.id === view);
  if (openDef) {
    return (
      <LocalMcpDetail
        Sys={Sys} def={openDef} status={statuses[openDef.id]?.status} lastError={statuses[openDef.id]?.lastError}
        tools={toolsById[openDef.id] || []} busy={busy === openDef.id || busy === 'add'}
        err={err}
        onBack={() => setView('list')}
        onStart={() => start(openDef.id)} onStop={() => stop(openDef.id)} onDelete={() => removeServer(openDef.id)}
        onEditSave={(def, secretKey, secretValue) => saveServer({ ...def, secretKey, secretValue }, openDef.id)}
        onCallTool={(name, args) => window.pikaosDesktop.mcp.callTool(openDef.id, name, args)} />
    );
  }

  return (
    <div className="content-pad fade-in" data-no-lex>
      <PageHead
        kicker={t('mcp.kicker')} title={t('mcp.title')} desc={t('mcp.desc')}
        actions={<>
          {collapsed && <Button kind="ghost" size="sm" icon="help" onClick={toggleExplainer}>{t('mcp.explain.show')}</Button>}
          <Button kind="ghost" size="sm" icon="refresh" onClick={load}>{t('mcp.refresh')}</Button>
        </>} />

      <ActionErrorNote t={t} err={err} />

      {!collapsed && (
        <Panel title={t('mcp.explain.title')} icon="help"
          right={<Button kind="ghost" size="sm" onClick={toggleExplainer}>{t('mcp.explain.hide')}</Button>}>
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6 }}>{t('mcp.explain.body')}</p>
        </Panel>
      )}

      <Panel title={t('mcp.preset.title')} icon="package">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))', gap: 10 }}>
          {MCP_PRESETS.map(p => (
            <PresetCard key={p.id} t={t} preset={p} installed={servers.some(s => s.id === p.id)}
              onPick={() => pickPreset(p)} onOpen={() => setView(p.id)} />
          ))}
          <PresetCard t={t} preset={CUSTOM} installed={false} onPick={() => pickPreset(CUSTOM)} />
        </div>
      </Panel>

      {installPreset && (
        <PresetInstallPanel key={installPreset.id} t={t} preset={installPreset} busy={busy === 'add'}
          onInstall={(values, secretValue) => installFromPreset(installPreset, values, secretValue)}
          onCancel={() => setInstallPreset(null)} />
      )}

      {showCustom && <McpServerForm t={t} busy={busy === 'add'} onSubmit={saveServer} />}

      {servers.length === 0
        ? <Empty icon="🔌" title={t('mcp.empty.title')} sub={t('mcp.empty.sub')} />
        : <Panel title={t('mcp.list.installed')} icon="components">
            <div className="tool-list">
              {servers.map(d => (
                <ServerRow key={d.id} t={t} d={d} status={statuses[d.id]?.status} lastError={statuses[d.id]?.lastError}
                  toolCount={(toolsById[d.id] || []).length} busy={busy === d.id}
                  onOpen={() => setView(d.id)} onStart={() => start(d.id)} onStop={() => stop(d.id)} />
              ))}
            </div>
          </Panel>}
    </div>
  );
}

// Guarded: the node-environment component tests import this module, where `window` doesn't exist.
if (typeof window !== 'undefined') Object.assign(window, { LocalMcp });
