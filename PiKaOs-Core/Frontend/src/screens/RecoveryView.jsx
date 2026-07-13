/* PiKaOs — desktop-only recovery view (recovery spec 2026-07-13). Rendered INSIDE ConnectServer
   as its 'recovery' view, before login: health of everything on this device + per-item repair /
   uninstall / clear. Main owns file items over recovery:* IPC; boot-cache/ui-state are web
   storage, cleared right here via recovery-local.js. Repair ≠ uninstall (spec §5): repair keeps
   the module. Status is text + color, never color alone. */
import React from 'react';
const { useState, useEffect, useRef, useCallback } = React;
import { countLocalItems, clearBootCache, clearUiState } from '../lib/recovery-local.js';

const RESET_TOKEN = 'RESET';   // literal in every language (spec §7) — a constant, like a git SHA
const STATUS_COLOR = { ok: 'var(--emerald)', warn: 'var(--gold)', corrupt: 'var(--crimson-deep)', missing: 'var(--ink-4)' };
const fmtBytes = (b) => (b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`);

/* Two-click confirm: first click arms (label flips to recovery.confirm, auto-disarm 3s), second
   fires. Self-contained — no global modal dependency on this pre-login screen. */
function ActionBtn({ t, label, danger, disabled, onRun }) {
  const [armed, setArmed] = useState(false);
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const click = () => {
    if (!armed) { setArmed(true); timer.current = setTimeout(() => setArmed(false), 3000); return; }
    clearTimeout(timer.current); setArmed(false); onRun();
  };
  return (
    <button type="button" className={'btn btn-sm ' + (danger ? 'btn-danger' : 'btn-ghost')}
      disabled={disabled} onClick={click} aria-pressed={armed}>
      {armed ? t('recovery.confirm') : label}
    </button>
  );
}

function Row({ name, desc, statusKey, statusColor, extra, children }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px',
      border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-2)', marginBottom: 8 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--ink)' }}>{name}</span>
          {statusKey && (
            <span className="mono" style={{ fontSize: 10.5, letterSpacing: '.08em', textTransform: 'uppercase',
              color: statusColor, border: `1px solid ${statusColor}`, borderRadius: 'var(--radius-sm)', padding: '1px 6px' }}>
              {statusKey}
            </span>
          )}
          {extra && <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)' }}>{extra}</span>}
        </div>
        <div style={{ fontSize: 12, color: 'var(--ink-3)', marginTop: 3 }}>{desc}</div>
      </div>
      <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>{children}</div>
    </div>
  );
}

export function RecoveryView({ t, onBack }) {
  const [items, setItems] = useState(null);      // main-side DiagnoseItem[] or null while loading
  const [mcp, setMcp] = useState([]);            // [{...def, status}]
  const [local, setLocal] = useState({ boot: 0, ui: 0 });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [arm, setArm] = useState('');            // danger-zone typed token
  const [needsReload, setNeedsReload] = useState(false);

  const load = useCallback(async () => {
    setError('');
    try {
      const [diag, defs, statuses] = await Promise.all([
        window.pikaosDesktop.recovery.diagnose(),
        window.pikaosDesktop.mcp.list(),
        window.pikaosDesktop.mcp.statuses(),
      ]);
      setItems(diag);
      setMcp((Array.isArray(defs) ? defs : []).map((d) => ({ ...d, status: statuses?.[d.id] ?? 'stopped' })));
    } catch (e) { setError(t('recovery.failed')); }
    setLocal(countLocalItems(window.localStorage));
  }, [t]);
  useEffect(() => { load(); }, [load]);

  // run a main-side action; hardReload = identity/servers changed under the app (spec §6)
  const run = async (fn, { hardReload = false } = {}) => {
    if (busy) return;
    setBusy(true); setError('');
    try {
      const r = await fn();
      if (r && r.ok === false) setError(t('recovery.failed'));
      else if (hardReload) { window.location.reload(); return; }
      else setNeedsReload(true);
    } catch (e) { setError(t('recovery.failed')); }
    setBusy(false);
    await load();
  };

  const item = (id) => (items || []).find((i) => i.id === id) || { status: 'missing', count: 0, bytes: 0 };
  const statusBadge = (st) => ({ statusKey: t(`recovery.status.${st}`), statusColor: STATUS_COLOR[st] });
  const registry = item('mcp-registry');
  const armed = arm === RESET_TOKEN;

  const fileRow = (id, { danger = false, hardReload = false } = {}) => {
    const it = item(id);
    return (
      <Row key={id} name={t(`recovery.item.${id}`)} desc={t(`recovery.item.${id}.desc`)}
        {...statusBadge(it.status)} extra={`${t('recovery.count', { count: it.count })} · ${fmtBytes(it.bytes)}`}>
        {it.status === 'corrupt' && (
          <ActionBtn t={t} label={t('recovery.repair')} disabled={busy}
            onRun={() => run(() => window.pikaosDesktop.recovery.repair(id))} />
        )}
        <ActionBtn t={t} label={t('recovery.clear')} danger={danger} disabled={busy || (danger && !armed)}
          onRun={() => run(() => window.pikaosDesktop.recovery.clear(id), { hardReload })} />
      </Row>
    );
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'var(--bg-1)', overflowY: 'auto', padding: 24 }}>
      <div style={{ maxWidth: 560, margin: '0 auto' }}>
        <h1 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 24, margin: '10px 0 6px', color: 'var(--ink)' }}>
          {t('recovery.title')}
        </h1>
        <p style={{ margin: '0 0 18px', color: 'var(--ink-3)', fontSize: 13.5, lineHeight: 1.55 }}>{t('recovery.subtitle')}</p>

        <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy}
            onClick={() => (needsReload ? window.location.reload() : onBack())}>
            {needsReload ? t('recovery.restart') : t('recovery.back')}
          </button>
          <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={load}>
            {busy ? t('recovery.working') : t('recovery.refresh')}
          </button>
        </div>

        {error && <p role="alert" style={{ margin: '0 0 14px', fontSize: 13, color: 'var(--crimson-deep)' }}>{error}</p>}

        {/* MCP servers — per-row repair (keep def) vs uninstall (remove def), spec §5 */}
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.16em',
          textTransform: 'uppercase', color: 'var(--ink-4)', margin: '0 0 8px' }}>{t('recovery.mcp.title')}</div>
        <p style={{ margin: '0 0 10px', fontSize: 12, color: 'var(--ink-3)' }}>{t('recovery.mcp.desc')}</p>
        {registry.status === 'corrupt' ? (
          <Row name={t('recovery.mcp.title')} desc={t('recovery.corruptNote')} {...statusBadge('corrupt')}>
            <ActionBtn t={t} label={t('recovery.repair')} disabled={busy}
              onRun={() => run(() => window.pikaosDesktop.recovery.repair('mcp-registry'))} />
          </Row>
        ) : mcp.length === 0 ? (
          <p style={{ margin: '0 0 8px', fontSize: 12.5, color: 'var(--ink-4)' }}>{t('recovery.mcp.empty')}</p>
        ) : mcp.map((s) => (
          <Row key={s.id} name={s.label || s.id} desc={`${s.command} ${(s.args || []).join(' ')}`}
            {...statusBadge(s.status === 'error' ? 'corrupt' : 'ok')} extra={t('recovery.mcp.state.' + s.status)}>
            <ActionBtn t={t} label={t('recovery.repair')} disabled={busy}
              onRun={() => run(() => window.pikaosDesktop.recovery.repair('mcp-registry', s.id))} />
            <ActionBtn t={t} label={t('recovery.uninstall')} danger disabled={busy}
              onRun={() => run(() => window.pikaosDesktop.mcp.remove(s.id))} />
          </Row>
        ))}

        {/* device caches + files (normal zone) */}
        <div style={{ height: 14 }} />
        {fileRow('mcp-approvals')}
        <Row name={t('recovery.item.boot-cache')} desc={t('recovery.item.boot-cache.desc')}
          {...statusBadge('ok')} extra={t('recovery.count', { count: local.boot })}>
          <ActionBtn t={t} label={t('recovery.clear')} disabled={busy}
            onRun={() => run(async () => { clearBootCache(window.localStorage); return { ok: true }; })} />
        </Row>
        <Row name={t('recovery.item.ui-state')} desc={t('recovery.item.ui-state.desc')}
          {...statusBadge('ok')} extra={t('recovery.count', { count: local.ui })}>
          <ActionBtn t={t} label={t('recovery.clear')} disabled={busy}
            onRun={() => run(async () => { clearUiState(window.localStorage, window.sessionStorage); return { ok: true }; })} />
        </Row>
        <Row name={t('recovery.item.http-cache')} desc={t('recovery.item.http-cache.desc')}
          {...statusBadge('ok')} extra={fmtBytes(item('http-cache').bytes)}>
          <ActionBtn t={t} label={t('recovery.clear')} disabled={busy}
            onRun={() => run(() => window.pikaosDesktop.recovery.clearCache())} />
        </Row>

        {/* Danger Zone — typed RESET arms the buttons (spec §4) */}
        <div style={{ border: '1px solid var(--crimson-deep)', borderRadius: 'var(--radius-sm)', padding: 14, marginTop: 22 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.16em',
            textTransform: 'uppercase', color: 'var(--crimson-deep)', marginBottom: 8 }}>{t('recovery.danger.title')}</div>
          <p style={{ margin: '0 0 10px', fontSize: 12.5, color: 'var(--ink-3)' }}>
            {t('recovery.danger.note', { token: RESET_TOKEN })}
          </p>
          <input className="auth-input mono" type="text" value={arm} spellCheck={false} autoComplete="off"
            aria-label={t('recovery.danger.note', { token: RESET_TOKEN })} placeholder={RESET_TOKEN}
            onChange={(e) => setArm(e.target.value)} style={{ marginBottom: 12 }} />
          {fileRow('secrets', { danger: true, hardReload: true })}
          {fileRow('backend-config', { danger: true, hardReload: true })}
          <Row name={t('recovery.factory')} desc={t('recovery.factory.desc')}>
            <ActionBtn t={t} label={t('recovery.factory')} danger disabled={busy || !armed}
              onRun={() => run(() => window.pikaosDesktop.recovery.clear('factory-reset'), { hardReload: true })} />
          </Row>
        </div>
      </div>
    </div>
  );
}
