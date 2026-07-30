/* AI Access — the operator's allowlist for /api/mcp. Reads the CANDIDATE view (/mcp/catalog:
   every ai_safe tool + granted flag), toggles locally, and batch-PUTs the whole allowlist via
   SaveBar — the PUT is wholesale anyway, and one audit row per decision beats ten.
   Per-file imports on purpose (see McpSkillHub.jsx's header note). */
import React from 'react';
const { useEffect, useMemo, useRef, useState, useCallback } = React;
import Badge from '../../components/ui/Badge.jsx';
import Empty from '../../components/ui/Empty.jsx';
import Panel from '../../components/ui/Panel.jsx';
import SaveBar from '../../components/ui/SaveBar.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import Switch from '../../components/ui/Switch.jsx';
import Table from '../../components/ui/Table.jsx';
import McpGatewayPanel from './McpGatewayPanel.jsx';
import { raw } from '../../lib/api.js';
import { groupByOwner, diffGrants, toEntries, describeChanges } from './McpAllowlist.logic.js';

/* One labelled group inside the SaveBar's expandable details region — renders only when it has
   entries, so an all-additions or all-removals batch doesn't show empty headings. Each entry is a
   jump button (onJump) rather than static text — the operator reviewing a pending batch can hop
   straight to the row it refers to. */
function DetailGroup({ heading, items, t, onJump }) {
  if (!items.length) return null;
  return (
    <div className="pk-savebar-details-group">
      <p className="pk-savebar-details-heading">{heading}</p>
      {items.map(item => (
        <button key={item.name} type="button" className="pk-savebar-jump" onClick={() => onJump(item.name)} aria-label={t('mcpacl.details.jump', { tool: item.label })}>
          {item.label}
        </button>
      ))}
    </div>
  );
}

/* How long the flash ring stays on a jumped-to row — kept in one place so the CSS animation
   duration (ui-kit.css `.utable-tr.flash`) and this cleanup timer never drift apart. */
const FLASH_MS = 1200;

const EFFECT_VARIANT = { read: 'st-done', idempotent_write: 'st-active', side_effect: 'pr-high' };

export function McpAllowlist({ Sys, activePlugins }) {
  const { t } = Sys;
  const [state, setState] = useState({ loading: true, error: false, tools: [], orphans: [] });
  const [initialGranted, setInitialGranted] = useState([]);
  const [granted, setGranted] = useState(new Set());
  const [entries, setEntries] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);
  // name -> pending "remove the flash class" timeout, so unmounting mid-flash (or re-jumping to
  // the same row before its flash finished) never leaves a stray setTimeout writing to a node
  // React has already thrown away.
  const flashTimers = useRef(new Map());
  useEffect(() => () => {
    for (const id of flashTimers.current.values()) clearTimeout(id);
    flashTimers.current.clear();
  }, []);

  const load = useCallback(async () => {
    setState(s => ({ ...s, loading: true, error: false }));
    try {
      const [cat, acl] = await Promise.all([raw('/mcp/catalog'), raw('/mcp/allowlist')]);
      const grantedNames = cat.tools.filter(x => x.granted).map(x => x.name);
      setState({ loading: false, error: false, tools: cat.tools, orphans: cat.orphans });
      setInitialGranted(grantedNames);
      setGranted(new Set(grantedNames));
      setEntries(acl.entries);
      setSaveFailed(false);
    } catch {
      setState({ loading: false, error: true, tools: [], orphans: [] });
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const pluginIds = useMemo(() => new Set(activePlugins || []), [activePlugins]);
  const groups = useMemo(() => groupByOwner(state.tools, pluginIds), [state.tools, pluginIds]);
  const diff = useMemo(() => diffGrants(initialGranted, [...granted]), [initialGranted, granted]);
  const changes = useMemo(() => describeChanges(diff, state.orphans, state.tools), [diff, state.orphans, state.tools]);

  const toggle = (name, on) => {
    setSaveFailed(false);   // a fresh edit supersedes any stale "save failed" banner
    setGranted(prev => {
      const next = new Set(prev);
      if (on) next.add(name); else next.delete(name);
      return next;
    });
  };

  // Jump from a pending-change entry to its table row: scroll it into view, flash it, and hand
  // keyboard focus to its switch. `name` may not have a live row (an orphan the operator already
  // saved away in another tab, say) — querySelector returning null is a silent no-op, not a bug.
  const jumpToRow = useCallback((name) => {
    const row = document.querySelector(`[data-row-id="${CSS.escape(name)}"]`);
    if (!row) return;
    row.scrollIntoView({
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      block: 'center',
    });
    // Re-jumping to a row still mid-flash: cancel the older cleanup first so it can't remove the
    // class the new flash just added out from under it.
    const pending = flashTimers.current.get(name);
    if (pending) clearTimeout(pending);
    row.classList.add('flash');
    flashTimers.current.set(name, setTimeout(() => {
      row.classList.remove('flash');
      flashTimers.current.delete(name);
    }, FLASH_MS));
    row.querySelector('input')?.focus({ preventScroll: true });   // orphan rows have no switch — skip
  }, []);

  const save = async () => {
    setSaving(true); setSaveFailed(false);
    try {
      await raw('/mcp/allowlist', { method: 'PUT', body: { entries: toEntries([...granted], entries) } });
      await load();               // re-fetch → clean state; also drops orphans server-side
    } catch {
      setSaveFailed(true);        // edits retained, no silent revert
    } finally {
      setSaving(false);
    }
  };

  // This panel owns the app's ONLY gateway on/off switch — there is no tray item and no menu entry —
  // and it talks to Electron main alone, never to /mcp/catalog or /mcp/allowlist. So it is built
  // once here and rendered by every branch below, including the two that report a dead backend:
  // restore() brings the pipe up at boot with no backend dependency at all, so a backend that is
  // down must not be able to hide the control that turns a listening gateway off. Before this, the
  // only recourse in that state was hand-deleting gateway-state.json from userData.
  const gatewayPanel = <McpGatewayPanel Sys={Sys} />;

  if (state.error) return (
    <div className="content-pad">
      {gatewayPanel}
      <Empty icon="refresh" title={t('mcpacl.error')} sub={
        <button type="button" className="pop-action" onClick={load}>{t('mcpacl.retry')}</button>} />
    </div>
  );
  if (state.loading) return <div className="content-pad">{gatewayPanel}<Spinner /></div>;
  if (!state.tools.length && !state.orphans.length) return (
    <div className="content-pad">
      {gatewayPanel}
      <Empty icon="lock" title={t('mcpacl.empty')} />
    </div>
  );

  const columns = [
    { key: 'tool', header: t('mcpacl.col.tool'), render: (r) => (
        <span><strong>{[r.method, r.path].filter(Boolean).join(' ')}</strong>
          {r.description ? <span className="faint" style={{ display: 'block', fontSize: 12 }}>{r.description}</span> : null}
          {r.orphan ? <span className="faint" style={{ display: 'block', fontSize: 12 }}>{t('mcpacl.orphan')}</span> : null}
        </span>) },
    { key: 'effect', header: t('mcpacl.col.effect'), render: (r) => r.orphan ? null :
        <Badge variant={EFFECT_VARIANT[r.effect] || 'pr-high'}>{t('mcpacl.effect.' + r.effect)}</Badge> },
    { key: 'permission', header: t('mcpacl.col.perm'), render: (r) => r.orphan ? null : <code>{r.permission}</code> },
    { key: 'granted', header: t('mcpacl.col.granted'), render: (r) => r.orphan ? null :
        <Switch checked={granted.has(r.name)} onChange={(on) => toggle(r.name, on)}
                aria-label={r.method + ' ' + r.path} /> },
  ];

  return (
    <div className="content-pad">
      {gatewayPanel}
      {groups.map(g => (
        <Panel key={g.owner} title={g.owner === 'core' ? t('mcpacl.group.core') : g.owner}>
          <Table columns={columns} rows={g.tools.map(x => ({ ...x, id: x.name }))} />
        </Panel>
      ))}
      {state.orphans.length > 0 && (
        <Panel title={t('mcpacl.orphan.title')}>
          <Table columns={columns}
            rows={state.orphans.map(n => ({ id: n, name: n, method: '', path: n, orphan: true }))} />
        </Panel>
      )}
      {/* Orphans never enter `granted` (there's nothing to grant), so diff.count alone would stay 0
          and hide the SaveBar even though save() drops them server-side on every save — the operator
          would be told about a cleanup ("will be removed on save") the screen never let them trigger.
          Count them toward the bar's visibility/count while diff.count keeps sizing the label itself. */}
      <SaveBar count={diff.count + state.orphans.length}
        label={saveFailed ? t('mcpacl.savefail') : (diff.count + ' · ' + t('mcpacl.unsaved'))}
        saveLabel={saving ? '…' : t('mcpacl.save')} cancelLabel={t('mcpacl.cancel')}
        onSave={saving ? undefined : save}
        onCancel={() => setGranted(new Set(initialGranted))}
        details={changes.total > 0 ? (
          <>
            <DetailGroup heading={t('mcpacl.details.added')} items={changes.added} t={t} onJump={jumpToRow} />
            <DetailGroup heading={t('mcpacl.details.removed')} items={changes.removed} t={t} onJump={jumpToRow} />
            <DetailGroup heading={t('mcpacl.orphan.title')} items={changes.orphans} t={t} onJump={jumpToRow} />
          </>
        ) : null}
        detailsLabel={t('mcpacl.details.show')} detailsHideLabel={t('mcpacl.details.hide')} />
    </div>
  );
}
