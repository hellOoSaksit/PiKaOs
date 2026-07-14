/* PiKaOs — Local MCP panel (desktop-only, Task 13). Minimal admin surface that drives the
   main-process MCP runtime via the `window.pikaosDesktop` bridge (Desktop/src/preload) — proves
   the runtime end-to-end: register a server, start/stop it, watch its status live.

   Desktop-gated: renders nothing on web (no bridge there). The nav entry that links here is
   gated the same way (data.jsx: toolsmgr.children[].desktopOnly, honored by App.jsx's NavNode
   filter), so a web user never sees this route in the sidebar either.

   A server's secret VALUE (if any) is written only to `secrets.setForServer` (main-process vault,
   namespaced `mcp.<id>.<key>`) — never sent to `mcp.add`, never logged. Starting a server may pop
   a native consent dialog the first time (or after command/args change) — that flow lives in the
   main process (mcp/manager.ts) and isn't reproduced here. */
import React from 'react';
const { useEffect, useState } = React;
import { Btn, Empty, HelpNote, PageHead, Panel } from '../../components/components.jsx';

const STATUS_BADGE = {
  running:  { cls: 'on',   en: 'Running',  th: 'กำลังทำงาน' },
  starting: { cls: 'info', en: 'Starting', th: 'กำลังเริ่ม' },
  stopped:  { cls: 'idle', en: 'Stopped',  th: 'หยุดแล้ว' },
  error:    { cls: 'warn', en: 'Error',    th: 'ผิดพลาด' },
};

// space- or comma-separated → array (matches how the sibling git-install form takes a tag string).
function parseArgs(raw) {
  return raw.split(/[,\s]+/).map(s => s.trim()).filter(Boolean);
}

function AddServerForm({ T, busy, onSubmit }) {
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
      <div className="faint" style={{ fontSize: 12, marginBottom: 6 }}>
        {T('Register a local MCP server. The first start (or any change to its command/args) asks for your consent.',
           'ลงทะเบียน MCP server ในเครื่องนี้ — การเริ่มใช้งานครั้งแรก (หรือหลังแก้ไข command/args) จะขอความยินยอมก่อนเสมอ')}
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
        <input className="bf-input" style={{ flex: 1, minWidth: 140 }} placeholder={T('Server id (e.g. everything)', 'รหัส server (เช่น everything)')}
          value={id} onChange={e => setId(e.target.value)} />
        <input className="bf-input" style={{ flex: 1, minWidth: 140 }} placeholder={T('Label', 'ชื่อที่แสดง')}
          value={label} onChange={e => setLabel(e.target.value)} />
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <input className="bf-input mono" style={{ flex: 1, minWidth: 120, fontSize: 12.5 }} placeholder={T('Command (e.g. npx)', 'คำสั่ง (เช่น npx)')}
          value={command} onChange={e => setCommand(e.target.value)} />
        <input className="bf-input mono" style={{ flex: 2, minWidth: 220, fontSize: 12.5 }} placeholder={T('Args — space or comma separated', 'อาร์กิวเมนต์ — คั่นด้วยช่องว่างหรือจุลภาค')}
          value={args} onChange={e => setArgs(e.target.value)} />
      </div>
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
        <input className="bf-input" style={{ flex: 1, minWidth: 140 }} placeholder={T('Secret key (optional)', 'ชื่อคีย์ลับ (ไม่บังคับ)')}
          value={secretKey} onChange={e => setSecretKey(e.target.value)} />
        <input className="bf-input" type="password" style={{ flex: 1, minWidth: 160 }} placeholder={T('Secret value (optional)', 'ค่าคีย์ลับ (ไม่บังคับ)')}
          value={secretValue} onChange={e => setSecretValue(e.target.value)} autoComplete="new-password" />
        <Btn kind="gold" sm disabled={!ok || busy} onClick={submit}>{busy ? '…' : T('Add server', 'เพิ่ม server')}</Btn>
      </div>
    </Panel>
  );
}

function McpRow({ d, status, T, busy, onStart, onStop }) {
  const sb = STATUS_BADGE[status] || STATUS_BADGE.stopped;
  const running = status === 'running' || status === 'starting';
  return (
    <div className="tool-row">
      <span className="tool-ic">🔌</span>
      <div className="tool-bd">
        <div className="tool-name">{d.label || d.id} <span className={`badge ${sb.cls}`}>{T(sb.en, sb.th)}</span></div>
        <div className="mono faint" style={{ fontSize: 11, marginTop: 3 }}>{d.id} · {d.command} {(d.args || []).join(' ')}</div>
      </div>
      {running
        ? <Btn kind="ghost" sm disabled={busy} onClick={onStop}>{busy ? '…' : T('Stop', 'หยุด')}</Btn>
        : <Btn kind="gold" sm disabled={busy} onClick={onStart}>{busy ? '…' : T('Start', 'เริ่ม')}</Btn>}
    </div>
  );
}

export function LocalMcp({ Sys }) {
  const isDesktop = !!window.pikaosDesktop?.isDesktop;
  const T = (Sys && typeof Sys.T === 'function') ? Sys.T : ((en) => en);
  const [servers, setServers] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [busy, setBusy] = useState(null);   // 'add' | server id | null
  const [err, setErr] = useState(null);

  const load = async () => {
    setErr(null);
    try {
      const [list, st] = await Promise.all([window.pikaosDesktop.mcp.list(), window.pikaosDesktop.mcp.statuses()]);
      setServers(list || []);
      setStatuses(st || {});
    } catch (e) { setErr(e.message || 'load failed'); }
  };

  // Hooks must run unconditionally on every render (react-hooks/rules-of-hooks), so the
  // desktop-only gate (below, after all hooks) guards the JSX, not the hook calls themselves;
  // this effect double-guards so it's a no-op on web even before that gate gets hit.
  useEffect(() => {
    if (!isDesktop) return;
    load();
    // no removeListener on the bridge yet — safe to skip cleanup (this screen mounts once per visit).
    window.pikaosDesktop.mcp.onStatus((id, s) => setStatuses(prev => ({ ...prev, [id]: s })));
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
        kicker={T('Desktop · Local MCP', 'เดสก์ท็อป · Local MCP')}
        title={T('Local MCP Servers', 'MCP Server ในเครื่อง')}
        desc={T('Manage MCP servers that run as local child processes on this machine. Starting one for the first time (or after its command/args change) asks for your consent.',
                'จัดการ MCP server ที่รันเป็นโปรเซสในเครื่องนี้ · การเริ่มใช้งานครั้งแรก (หรือหลังแก้ไข command/args) จะขอความยินยอมจากคุณก่อนเสมอ')}
        actions={<Btn kind="ghost" sm icon="↻" onClick={load}>{T('Refresh', 'รีเฟรช')}</Btn>} />

      {err && <HelpNote>{T('Error: ', 'ผิดพลาด: ')}{err}</HelpNote>}

      <AddServerForm T={T} busy={busy === 'add'} onSubmit={addServer} />

      {servers.length === 0
        ? <Empty icon="🔌" title={T('No MCP servers registered', 'ยังไม่มี MCP server ที่ลงทะเบียน')}
            sub={T('Add one above to prove the runtime end-to-end.', 'เพิ่ม server ด้านบนเพื่อทดสอบระบบแบบครบวงจร')} />
        : <div className="tool-list" style={{ marginTop: 12 }}>
            {servers.map(d => (
              <McpRow key={d.id} d={d} status={statuses[d.id]} T={T} busy={busy === d.id}
                onStart={() => start(d.id)} onStop={() => stop(d.id)} />
            ))}
          </div>}
    </div>
  );
}

Object.assign(window, { LocalMcp });
