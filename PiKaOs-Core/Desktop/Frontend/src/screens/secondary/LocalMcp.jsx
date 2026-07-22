/* PiKaOs — Local MCP panel (desktop-only). Drives the main-process MCP runtime via the
   `window.pikaosDesktop` bridge (Desktop/src/preload): register a server, start/stop it, watch
   its status live, and — once `ready` — list its tools and test-call one. Rendered as a
   desktop-only secondary screen; renders nothing on web (no bridge there).

   Status semantics (Desktop/src/main/mcp/manager.ts FSM): `running` = the OS process is up,
   `ready` = the MCP handshake (initialize + tools/list) actually succeeded.

   A server's secret VALUE (if any) is written only to `secrets.setForServer` (main-process vault,
   namespaced `mcp.<id>.<key>`) — never sent to `mcp.add`, never logged. Starting a server may pop
   a native consent dialog the first time (or after command/args change) — that flow lives in the
   main process (mcp/manager.ts) and isn't reproduced here. */
import React from 'react';
const { useEffect, useState } = React;
import { Button, Empty, HelpNote, PageHead, Panel } from '../../components/ui';

const STATUS_BADGE = {
  ready:    { cls: 'on',   key: 'mcp.status.ready' },
  running:  { cls: 'info', key: 'mcp.status.running' },   // process up, handshake not confirmed yet
  starting: { cls: 'info', key: 'mcp.status.starting' },
  stopped:  { cls: 'idle', key: 'mcp.status.stopped' },
  error:    { cls: 'warn', key: 'mcp.status.error' },
};

// space- or comma-separated → array (matches how the sibling git-install form takes a tag string).
function parseArgs(raw) {
  return raw.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
}

function AddServerForm({ t, busy, onSubmit }) {
  const [id, setId] = useState('');
  const [label, setLabel] = useState('');
  const [command, setCommand] = useState('');
  const [args, setArgs] = useState('');
  const [secretKey, setSecretKey] = useState('');
  const [secretValue, setSecretValue] = useState('');

  const ok = id.trim().length > 0 && command.trim().length > 0;
  const submit = async () => {
    if (!ok) return;
    await onSubmit({
      id: id.trim(), label: label.trim() || id.trim(), command: command.trim(),
      args: parseArgs(args), secretKey: secretKey.trim(), secretValue,
    });
    setId(''); setLabel(''); setCommand(''); setArgs(''); setSecretKey(''); setSecretValue('');
  };

  return (
    <Panel>
      <div className="faint" style={{ fontSize: 12, marginBottom: 6 }}>{t('mcp.add.help')}</div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <input className="bf-input" style={{ flex: 1, minWidth: 140 }} placeholder={t('mcp.add.id.ph')}
          value={id} onChange={e => setId(e.target.value)} />
        <input className="bf-input" style={{ flex: 1, minWidth: 140 }} placeholder={t('mcp.add.label.ph')}
          value={label} onChange={e => setLabel(e.target.value)} />
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <input className="bf-input mono" style={{ flex: 1, minWidth: 120, fontSize: 12.5 }} placeholder={t('mcp.add.cmd.ph')}
          value={command} onChange={e => setCommand(e.target.value)} />
        <input className="bf-input mono" style={{ flex: 2, minWidth: 220, fontSize: 12.5 }} placeholder={t('mcp.add.args.ph')}
          value={args} onChange={e => setArgs(e.target.value)} />
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <input className="bf-input" style={{ flex: 1, minWidth: 140 }} placeholder={t('mcp.add.secretkey.ph')}
          value={secretKey} onChange={e => setSecretKey(e.target.value)} />
        <input className="bf-input" type="password" style={{ flex: 1, minWidth: 160 }} placeholder={t('mcp.add.secretval.ph')}
          value={secretValue} onChange={e => setSecretValue(e.target.value)} autoComplete="new-password" />
        <Button kind="gold" size="sm" disabled={!ok || busy} onClick={submit}>{busy ? '…' : t('mcp.add.submit')}</Button>
      </div>
    </Panel>
  );
}

// JSON-args → callTool → result. Only shown for a `ready` server; each tool is one collapsible row.
function ToolCaller({ t, serverId, tools }) {
  const [openTool, setOpenTool] = useState(null);
  const [argsText, setArgsText] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const call = async (name) => {
    setBusy(true); setError(null); setResult(null);
    let args;
    try { args = argsText.trim() ? JSON.parse(argsText) : {}; }
    catch { setError(t('mcp.tool.badjson')); setBusy(false); return; }
    try {
      const r = await window.pikaosDesktop.mcp.callTool(serverId, name, args);
      setResult(JSON.stringify(r, null, 2));
    } catch (e) { setError(e.message || 'call failed'); }
    finally { setBusy(false); }
  };

  if (!tools.length) return <div className="faint" style={{ fontSize: 12, padding: '6px 0' }}>{t('mcp.tools.none')}</div>;
  return (
    <div style={{ marginTop: 8 }}>
      <div className="faint" style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 4 }}>{t('mcp.tools.title')}</div>
      {tools.map(tool => (
        <div key={tool.name} style={{ borderTop: '1px solid var(--line-soft)', padding: '6px 0' }}>
          <button type="button" className="mono" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink)', fontSize: 12.5 }}
            onClick={() => { setOpenTool(openTool === tool.name ? null : tool.name); setResult(null); setError(null); setArgsText(''); }}>
            {tool.name}
          </button>
          {tool.description && <span className="faint" style={{ fontSize: 11, marginLeft: 8 }}>{tool.description}</span>}
          {openTool === tool.name && (
            <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <textarea className="bf-input mono" rows={2} style={{ fontSize: 12 }} placeholder={t('mcp.tool.args.ph')}
                value={argsText} onChange={e => setArgsText(e.target.value)} data-no-lex />
              <div><Button kind="gold" size="sm" disabled={busy} onClick={() => call(tool.name)}>{busy ? '…' : t('mcp.tool.call')}</Button></div>
              {error && <div className="badge warn" data-no-lex>{error}</div>}
              {result != null && <pre className="mono" style={{ fontSize: 11.5, whiteSpace: 'pre-wrap', background: 'var(--bg-3)', padding: 8, borderRadius: 6 }} data-no-lex>{result}</pre>}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function McpRow({ d, status, t, busy, tools, onStart, onStop }) {
  const sb = STATUS_BADGE[status] || STATUS_BADGE.stopped;
  const running = status === 'running' || status === 'starting' || status === 'ready';
  return (
    <div className="tool-row" style={{ flexWrap: 'wrap' }}>
      <span className="tool-ic">🔌</span>
      <div className="tool-bd" style={{ minWidth: 0 }}>
        <div className="tool-name">{d.label || d.id} <span className={`badge ${sb.cls}`} data-no-lex>{t(sb.key)}</span></div>
        <div className="mono faint" style={{ fontSize: 11, marginTop: 3 }}>{d.id} · {d.command} {(d.args || []).join(' ')}</div>
        {status === 'ready' && <ToolCaller t={t} serverId={d.id} tools={tools} />}
      </div>
      {running
        ? <Button kind="ghost" size="sm" disabled={busy} onClick={onStop}>{busy ? '…' : t('mcp.row.stop')}</Button>
        : <Button kind="gold" size="sm" disabled={busy} onClick={onStart}>{busy ? '…' : t('mcp.row.start')}</Button>}
    </div>
  );
}

export function LocalMcp({ Sys }) {
  const isDesktop = !!window.pikaosDesktop?.isDesktop;
  const t = (Sys && typeof Sys.t === 'function') ? Sys.t : ((k) => k);
  const [servers, setServers] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [toolsById, setToolsById] = useState({});   // id → Tool[], fetched when a server is ready
  const [busy, setBusy] = useState(null);            // 'add' | server id | null
  const [err, setErr] = useState(null);

  const load = async () => {
    setErr(null);
    try {
      const [list, st] = await Promise.all([window.pikaosDesktop.mcp.list(), window.pikaosDesktop.mcp.statuses()]);
      setServers(list || []);
      setStatuses(st || {});
    } catch (e) { setErr(e.message || 'load failed'); }
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
    window.pikaosDesktop.mcp.onStatus((id, s) => {
      setStatuses(prev => ({ ...prev, [id]: s }));
      if (s === 'ready') fetchTools(id);                       // pull the tool list the moment it's usable
      else if (s === 'stopped' || s === 'error') setToolsById(prev => ({ ...prev, [id]: [] }));
    });
  }, [isDesktop]);

  const addServer = async ({ id, label, command, args, secretKey, secretValue }) => {
    setBusy('add'); setErr(null);
    try {
      // Secret VALUE goes to the vault only — never into the server def (mcp.add), never logged.
      if (secretKey && secretValue) await window.pikaosDesktop.secrets.setForServer(id, secretKey, secretValue);
      await window.pikaosDesktop.mcp.add({ id, label, command, args, secretKeys: secretKey ? [secretKey] : [] });
      await load();
    } catch (e) { setErr(e.message || 'add failed'); }
    finally { setBusy(null); }
  };

  const start = async (id) => {
    setBusy(id); setErr(null);
    try { await window.pikaosDesktop.mcp.start(id); }
    catch (e) { setErr(e.message || 'start failed'); }
    finally { setBusy(null); }
  };
  const stop = async (id) => {
    setBusy(id); setErr(null);
    try { await window.pikaosDesktop.mcp.stop(id); }
    catch (e) { setErr(e.message || 'stop failed'); }
    finally { setBusy(null); }
  };

  if (!isDesktop) return null;   // desktop-only screen — nothing to render on web

  return (
    <div className="content-pad fade-in" data-no-lex>
      <PageHead
        kicker={t('mcp.kicker')} title={t('mcp.title')} desc={t('mcp.desc')}
        actions={<Button kind="ghost" size="sm" icon="refresh" onClick={load}>{t('mcp.refresh')}</Button>} />

      {err && <HelpNote>{t('mcp.err.prefix')}{err}</HelpNote>}

      <AddServerForm t={t} busy={busy === 'add'} onSubmit={addServer} />

      {servers.length === 0
        ? <Empty icon="🔌" title={t('mcp.empty.title')} sub={t('mcp.empty.sub')} />
        : <div className="tool-list" style={{ marginTop: 12 }}>
            {servers.map(d => (
              <McpRow key={d.id} d={d} status={statuses[d.id]} t={t} busy={busy === d.id}
                tools={toolsById[d.id] || []} onStart={() => start(d.id)} onStop={() => stop(d.id)} />
            ))}
          </div>}
    </div>
  );
}

Object.assign(window, { LocalMcp });
