/* PiKaOs — the raw MCP command form: id / label / command / args (+ an optional secret).
   For people who know what they are registering; the guided path is the preset panel in LocalMcp.jsx.

   It lives in its own module so the per-server detail page can reuse it for editing without importing
   LocalMcp.jsx — that would close an ESM cycle (LocalMcp -> LocalMcpDetail -> LocalMcp), which has
   already produced a real runtime bug in this codebase.

   Primitives are imported per-file rather than from the `components/ui` barrel, for the same reason
   documented in LocalMcp.jsx: the barrel touches `window` at module scope. */
import React from 'react';
const { useState } = React;
import Button from '../../components/ui/Button.jsx';
import Panel from '../../components/ui/Panel.jsx';

// space- or comma-separated → array (matches how the sibling git-install form takes a tag string).
function parseArgs(raw) {
  return raw.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
}

/* `initial` prefills an existing def for editing: { id, label, command, args }. A secret VALUE is
   write-only (vault-side), so it is never prefilled — an empty box means "leave the stored one". */
export function McpServerForm({ t, busy, initial, onSubmit }) {
  const editing = !!initial;
  const [id, setId] = useState(initial?.id || '');
  const [label, setLabel] = useState(initial?.label || '');
  const [command, setCommand] = useState(initial?.command || '');
  const [args, setArgs] = useState((initial?.args || []).join(' '));
  const [secretKey, setSecretKey] = useState(initial?.secretKeys?.[0] || '');
  const [secretValue, setSecretValue] = useState('');

  const ok = id.trim().length > 0 && command.trim().length > 0;
  const submit = async () => {
    if (!ok) return;
    const saved = await onSubmit({
      id: id.trim(), label: label.trim() || id.trim(), command: command.trim(),
      args: parseArgs(args), secretKey: secretKey.trim(), secretValue,
    });
    // The caller reports a rejected save by returning false (it shows the error itself and resolves
    // either way). Keep everything typed so the user can correct it instead of retyping the command.
    if (saved === false) return;
    if (editing) { setSecretValue(''); return; }   // an edit keeps the fields; a fresh add clears them
    setId(''); setLabel(''); setCommand(''); setArgs(''); setSecretKey(''); setSecretValue('');
  };

  return (
    <Panel title={t('mcp.preset.custom.name')} icon="tools">
      <div className="faint" style={{ fontSize: 12, marginBottom: 6 }}>{t('mcp.add.help')}</div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <input className="bf-input" style={{ flex: 1, minWidth: 140 }} placeholder={t('mcp.add.id.ph')}
          aria-label={t('mcp.add.id.ph')} value={id} onChange={e => setId(e.target.value)} />
        <input className="bf-input" style={{ flex: 1, minWidth: 140 }} placeholder={t('mcp.add.label.ph')}
          aria-label={t('mcp.add.label.ph')} value={label} onChange={e => setLabel(e.target.value)} />
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <input className="bf-input mono" style={{ flex: 1, minWidth: 120, fontSize: 12.5 }} placeholder={t('mcp.add.cmd.ph')}
          aria-label={t('mcp.add.cmd.ph')} value={command} onChange={e => setCommand(e.target.value)} />
        <input className="bf-input mono" style={{ flex: 2, minWidth: 220, fontSize: 12.5 }} placeholder={t('mcp.add.args.ph')}
          aria-label={t('mcp.add.args.ph')} value={args} onChange={e => setArgs(e.target.value)} />
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <input className="bf-input" style={{ flex: 1, minWidth: 140 }} placeholder={t('mcp.add.secretkey.ph')}
          aria-label={t('mcp.add.secretkey.ph')} value={secretKey} onChange={e => setSecretKey(e.target.value)} />
        <input className="bf-input" type="password" style={{ flex: 1, minWidth: 160 }} placeholder={t('mcp.add.secretval.ph')}
          aria-label={t('mcp.add.secretval.ph')} value={secretValue} onChange={e => setSecretValue(e.target.value)}
          autoComplete="new-password" />
        <Button kind="gold" size="sm" disabled={!ok || busy} onClick={submit}>
          {busy ? '…' : t(editing ? 'mcp.add.save' : 'mcp.add.submit')}
        </Button>
      </div>
    </Panel>
  );
}
