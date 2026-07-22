/* Per-server detail page for Local MCP. Rendered by LocalMcp.jsx when a row is opened, with:
     { Sys, def, status, lastError, tools, busy, err, onBack, onStart, onStop, onDelete,
       onEditSave, onCallTool }
   where onCallTool(name, args) -> Promise<result>, onEditSave(def, secretKey, secretValue) -> Promise<void>,
   onDelete() -> Promise<void> (LocalMcp owns the confirm dialog and the stop-before-remove).

   This file makes NO bridge calls of its own — every effect on the system goes through the callbacks
   above, so the stateful shell stays in LocalMcp.jsx and this page stays testable as plain functions.

   Keep it free of top-level `window` access and of the `components/ui` barrel: the sibling component
   tests run in vitest's node environment and import LocalMcp.jsx, which imports this file. */
import React from 'react';
const { useState } = React;
import Button from '../../components/ui/Button.jsx';
import HelpNote from '../../components/ui/HelpNote.jsx';
import PageHead from '../../components/ui/PageHead.jsx';
import Panel from '../../components/ui/Panel.jsx';
import { filterTools, errorKey, statusMeta, isRunning, showToolSearch } from './LocalMcp.logic.js';
import { McpServerForm } from './McpServerForm.jsx';
import { ToolRow } from './ToolRow.jsx';

/* Status badge + one plain-language line saying what that status means for the user. The badge
   always carries text, so the state never depends on colour alone. */
export function StatusLine({ t, status, lastError }) {
  const s = statusMeta(status);
  const failed = status === 'error';
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 14 }}>
      <span className={`badge ${s.cls}`} style={{ alignSelf: 'flex-start' }} data-no-lex>{t(s.key)}</span>
      <div style={{ fontSize: 12.5, lineHeight: 1.6 }}>
        {failed ? t(errorKey(lastError)) : t(s.hint)}
        {failed && lastError === 'node-missing' && (
          <> <a href="https://nodejs.org/" target="_blank" rel="noreferrer">{t('mcp.err.node-missing.link')}</a></>
        )}
      </div>
      {failed && <div className="faint" style={{ fontSize: 12, lineHeight: 1.6 }}>{t(s.hint)}</div>}
    </div>
  );
}

/* The command line, folded away. Native <details> so it is keyboard-operable for free.
   Secret KEYS are shown (they are just env-var names); a secret VALUE never leaves the
   main-process vault, so there is nothing here to leak. */
export function TechnicalDetails({ t, d }) {
  const rows = [
    [t('mcp.detail.id'), d.id],
    [t('mcp.detail.cmd'), d.command],
    [t('mcp.detail.args'), (d.args || []).join(' ')],
  ];
  if (d.secretKeys?.length) rows.push([t('mcp.detail.secrets'), d.secretKeys.join(', ')]);
  return (
    <details open={false} style={{ marginBottom: 14 }}>
      <summary style={{ cursor: 'pointer', fontSize: 12.5 }}>{t('mcp.detail.tech')}</summary>
      <div style={{ marginTop: 8, display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '4px 10px' }}>
        {rows.map(([label, value]) => (
          <React.Fragment key={label}>
            <span className="faint" style={{ fontSize: 11.5 }}>{label}</span>
            <span className="mono" style={{ fontSize: 11.5, wordBreak: 'break-all' }}>{value}</span>
          </React.Fragment>
        ))}
      </div>
    </details>
  );
}

/* The edit form's submit, as a factory so its close rule is testable without a renderer.
   The parent catches its own errors into the banner and always RESOLVES, so awaiting it says
   nothing about success — it reports that by returning false. Closing on a failed save would
   throw away the command the user just typed, right when they need it to fix the error. */
export const makeSaveEdit = (onEditSave, setEditing) => async ({ secretKey, secretValue, ...next }) => {
  const ok = await onEditSave(next, secretKey, secretValue);
  if (ok !== false) setEditing(false);
  return ok;
};

export function LocalMcpDetail({ Sys, def, status, lastError, tools, busy, err,
  onBack, onStart, onStop, onDelete, onEditSave, onCallTool }) {
  const t = (Sys && typeof Sys.t === 'function') ? Sys.t : ((k) => k);
  const [q, setQ] = useState('');
  const [openTool, setOpenTool] = useState(null);   // one tool open at a time — the page stays readable
  const [editing, setEditing] = useState(false);
  const all = tools || [];
  const visible = filterTools(all, q);
  const ready = status === 'ready';

  const saveEdit = makeSaveEdit(onEditSave, setEditing);

  return (
    <div className="content-pad fade-in" data-no-lex>
      <div className="row" style={{ marginBottom: 10 }}>
        <Button kind="ghost" size="sm" icon="chevron-left" onClick={onBack}>{t('mcp.detail.back')}</Button>
      </div>

      <PageHead
        kicker={t('mcp.title')} title={def.label || def.id}
        actions={<>
          {isRunning(status)
            ? <Button kind="ghost" size="sm" disabled={busy} onClick={onStop}>{busy ? '…' : t('mcp.row.stop')}</Button>
            : <Button kind="gold" size="sm" disabled={busy} onClick={onStart}>{busy ? '…' : t('mcp.row.start')}</Button>}
          <Button kind="ghost" size="sm" icon="edit" disabled={busy} onClick={() => setEditing(v => !v)}>{t('mcp.detail.edit')}</Button>
          <Button kind="danger" size="sm" icon="delete" disabled={busy} onClick={onDelete}>{t('mcp.detail.delete')}</Button>
        </>} />

      {err && <HelpNote>{t('mcp.err.prefix')}{err}</HelpNote>}

      <StatusLine t={t} status={status} lastError={lastError} />
      <TechnicalDetails t={t} d={def} />

      {/* Editing is remove+add in the parent, and restarts a running server (re-asking consent). */}
      {editing && <McpServerForm t={t} busy={busy} initial={def} onSubmit={saveEdit} />}

      <Panel title={t('mcp.tools.title')} icon="tools">
        {/* Its own copy, not the status hint again: the status line above already said what the
            server is doing; here the question is why there is no tool list yet. */}
        {!ready && <div className="faint" style={{ fontSize: 12.5, lineHeight: 1.6 }}>{t('mcp.tools.notready')}</div>}

        {ready && all.length === 0 && <div className="faint" style={{ fontSize: 12.5 }}>{t('mcp.tools.none')}</div>}

        {ready && showToolSearch(all.length) && (
          <input className="bf-input" style={{ width: '100%', marginBottom: 8 }} value={q}
            placeholder={t('mcp.detail.search.ph')} aria-label={t('mcp.detail.search.ph')}
            onChange={e => setQ(e.target.value)} />
        )}

        {ready && all.length > 0 && (
          visible.length === 0
            ? <div className="faint" style={{ fontSize: 12.5 }}>{t('mcp.detail.search.none')}</div>
            : <div className="tool-list">
                {visible.map(tool => (
                  <ToolRow key={tool.name} t={t} tool={tool} open={openTool === tool.name}
                    onToggle={() => setOpenTool(cur => (cur === tool.name ? null : tool.name))}
                    onCall={(args) => onCallTool(tool.name, args)} />
                ))}
              </div>
        )}
      </Panel>
    </div>
  );
}
