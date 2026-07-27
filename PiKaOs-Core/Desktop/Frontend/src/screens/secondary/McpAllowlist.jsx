/* AI Access — the operator's allowlist for /api/mcp. Reads the CANDIDATE view (/mcp/catalog:
   every ai_safe tool + granted flag), toggles locally, and batch-PUTs the whole allowlist via
   SaveBar — the PUT is wholesale anyway, and one audit row per decision beats ten.
   Per-file imports on purpose (see McpSkillHub.jsx's header note). */
import React from 'react';
const { useEffect, useMemo, useState, useCallback } = React;
import Badge from '../../components/ui/Badge.jsx';
import Empty from '../../components/ui/Empty.jsx';
import Panel from '../../components/ui/Panel.jsx';
import SaveBar from '../../components/ui/SaveBar.jsx';
import Spinner from '../../components/ui/Spinner.jsx';
import Switch from '../../components/ui/Switch.jsx';
import Table from '../../components/ui/Table.jsx';
import { raw } from '../../lib/api.js';
import { groupByOwner, diffGrants, toEntries } from './McpAllowlist.logic.js';

const EFFECT_VARIANT = { read: 'st-done', idempotent_write: 'st-active', side_effect: 'pr-high' };

export function McpAllowlist({ Sys, activePlugins }) {
  const { t } = Sys;
  const [state, setState] = useState({ loading: true, error: false, tools: [], orphans: [] });
  const [initialGranted, setInitialGranted] = useState([]);
  const [granted, setGranted] = useState(new Set());
  const [entries, setEntries] = useState({});
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

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
      setState({ loading: true /* keep skeleton */, error: true, tools: [], orphans: [] });
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const pluginIds = useMemo(() => new Set(activePlugins || []), [activePlugins]);
  const groups = useMemo(() => groupByOwner(state.tools, pluginIds), [state.tools, pluginIds]);
  const diff = useMemo(() => diffGrants(initialGranted, [...granted]), [initialGranted, granted]);

  const toggle = (name, on) => setGranted(prev => {
    const next = new Set(prev);
    if (on) next.add(name); else next.delete(name);
    return next;
  });

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

  if (state.error) return (
    <div className="content-pad">
      <Empty icon="refresh" title={t('mcpacl.error')} sub={
        <button type="button" className="pop-action" onClick={load}>{t('mcpacl.retry')}</button>} />
    </div>
  );
  if (state.loading) return <div className="content-pad"><Spinner /></div>;
  if (!state.tools.length && !state.orphans.length) return (
    <div className="content-pad"><Empty icon="lock" title={t('mcpacl.empty')} /></div>
  );

  const columns = [
    { key: 'tool', header: t('mcpacl.col.tool'), render: (r) => (
        <span><strong>{r.method} {r.path}</strong>
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
      {groups.map(g => (
        <Panel key={g.owner} title={g.owner === 'core' ? t('mcpacl.group.core') : g.owner}>
          <Table columns={columns} rows={g.tools.map(x => ({ ...x, id: x.name }))} />
        </Panel>
      ))}
      {state.orphans.length > 0 && (
        <Panel title={t('mcpacl.orphan')}>
          <Table columns={columns}
            rows={state.orphans.map(n => ({ id: n, name: n, method: '', path: n, orphan: true }))} />
        </Panel>
      )}
      <SaveBar count={diff.count}
        label={saveFailed ? t('mcpacl.savefail') : (diff.count + ' · ' + t('mcpacl.unsaved'))}
        saveLabel={saving ? '…' : t('mcpacl.save')} cancelLabel={t('mcpacl.cancel')}
        onSave={saving ? undefined : save}
        onCancel={() => setGranted(new Set(initialGranted))} />
    </div>
  );
}
