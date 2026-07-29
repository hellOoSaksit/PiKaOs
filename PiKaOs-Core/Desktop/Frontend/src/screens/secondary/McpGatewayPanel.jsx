/* The external-AI gateway switchboard, at the top of AI Access — the door, above the list of what
   is behind it. Desktop shell only: every control here goes through window.pikaosDesktop.gateway,
   so on the web build there is nothing to talk to and the panel must not render at all. */
import React from 'react';
const { useCallback, useEffect, useRef, useState } = React;
import ConfirmBar from '../../components/ui/ConfirmBar.jsx';
import Panel from '../../components/ui/Panel.jsx';
import Switch from '../../components/ui/Switch.jsx';
import Table from '../../components/ui/Table.jsx';
import { confirmText, toggleIntent } from './McpGatewayPanel.logic.js';

const COPIED_MS = 1600;

export default function McpGatewayPanel({ Sys }) {
  const { t } = Sys;
  const api = typeof window !== 'undefined' ? window.pikaosDesktop?.gateway : null;
  const [status, setStatus] = useState({ enabled: false, connections: 0 });
  // null means "no snippet exists" (disabled, never enabled, or a failed fetch) — never a string
  // that happens to say the word "null"; the render below treats null as nothing to show.
  const [config, setConfig] = useState(null);
  const [clients, setClients] = useState([]);
  const [copied, setCopied] = useState(false);
  // One shared failure surface for every call that crosses into the main process (copy, toggle,
  // revoke, refresh). Kept generic on purpose (rule 10): it tells the operator the action did not
  // take effect, never what threw, so a path or stack can't leak through it.
  const [error, setError] = useState(false);
  // The one pending confirmation, or null. Both actions it guards — opening the gateway to an
  // external AI, and cutting a client's live connection — take effect instantly and have no undo,
  // unlike the allowlist table below, which has always been save-gated. Holding a single value
  // (rather than a flag per control) is what makes a second request REPLACE the first: a live UAT
  // showed that when prompts stack, the operator's click lands on the one they weren't reading.
  const [pending, setPending] = useState(null);
  const copiedTimer = useRef(null);

  const refresh = useCallback(async () => {
    if (!api) return;
    let failed = false;
    try {
      setClients(await api.clients());
    } catch {
      failed = true;
    }
    // config() resolves null whenever the gateway isn't actually serving a working snippet. Treat
    // a rejected call the same way — no snippet is safer than showing a stale or broken one.
    try {
      setConfig(await api.config());
    } catch {
      setConfig(null);
      failed = true;
    }
    setError(failed);
  }, [api]);

  useEffect(() => {
    if (!api) return undefined;
    api.status()
      .then(s => {
        setStatus(s);
        setError(false);
      })
      .catch(() => setError(true));
    refresh();
    // Connections change without any action on this screen, so the panel listens rather than polls.
    // Pairing (Allow/Deny) is decided in a native dialog the renderer has no other visibility into —
    // main re-emits a status push once a pairing resolves (pipe.ts's accept(), Fix 4) specifically so
    // this refetches clients() here instead of the approved-clients table staying stale until the
    // operator navigates away and back.
    return api.onStatus((s) => { setStatus(s); refresh(); });
  }, [api, refresh]);

  // The "Copied" flip-back is a timer outside React's render cycle; clear it on unmount so it
  // never fires setState against a panel that is already gone.
  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);

  if (!api) return null;

  const applyToggle = async (on) => {
    try {
      setStatus(await api.setEnabled(on));
      setError(false);
    } catch {
      setError(true);
      return; // nothing changed on the main-process side — a refresh would only re-show the same state
    }
    refresh();
  };
  const copy = async () => {
    if (!config) return;   // nothing to copy while there is no snippet
    try {
      // Copy happens in the main process over gateway:copyConfig, not navigator.clipboard.writeText
      // here: measured live in a packaged build, that call rejected even from this secure app://
      // context, because Chromium's Clipboard API separately needs document focus + a granted
      // clipboard-write permission that this app never configured. Electron's clipboard module (main
      // process) needs neither — see gateway/ipc.ts's writeToClipboard comment for the full story.
      const ok = await api.copyConfig();
      if (!ok) { setError(true); return; }   // disabled mid-flight, or no snippet — told, not silent
      setError(false);
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      setError(true);
    }
  };
  const applyRevoke = async (name) => {
    try {
      await api.revoke(name);
      setError(false);
      refresh();
    } catch {
      setError(true);
    }
  };

  // Confirmations run the real call, then clear themselves — so a failure surfaces through the same
  // banner every other action uses, and the bar never lingers over an action already carried out.
  const runPending = () => {
    const p = pending;
    setPending(null);
    if (!p) return;
    if (p.kind === 'revoke') applyRevoke(p.name);
    else applyToggle(p.kind === 'enable');
  };
  const ask = confirmText(pending);

  const label = !status.enabled ? t('mcpgw.status.off')
    : status.connections === 0 ? t('mcpgw.status.waiting')
    : t('mcpgw.status.connected', { n: status.connections });

  const columns = [
    { key: 'name', header: t('mcpgw.clients.title'), render: (r) => <strong>{r.name}</strong> },
    { key: 'act', header: '', render: (r) => (
        <button type="button" className="pop-action" onClick={() => setPending({ kind: 'revoke', name: r.name })}>
          {t('mcpgw.clients.revoke')}
        </button>) },
  ];

  return (
    <Panel title={t('mcpgw.title')} right={<span className="faint">{label}</span>}>
      {/* checked tracks the REAL state, never the pending one — the switch must not show a door as
          open before it is. That is also why cancelling needs no rollback: nothing moved. */}
      <Switch checked={status.enabled} onChange={() => setPending(toggleIntent(status.enabled))}
              label={t('mcpgw.enable')} />
      <p className="faint" style={{ fontSize: 12 }}>{t('mcpgw.unverified')}</p>
      {error && <p className="form-alert error">{t('mcpgw.error')}</p>}
      {status.enabled && (
        <>
          {/* config is null right after enabling (before the pipe is up) or on a failed fetch —
              only render the snippet + copy control once a real one exists. */}
          {config && (
            <>
              <p>{t('mcpgw.config.title')}</p>
              <pre className="mono" style={{ overflowX: 'auto' }}>{config}</pre>
              <button type="button" className="pop-action" onClick={copy}>
                {copied ? t('mcpgw.config.copied') : t('mcpgw.config.copy')}
              </button>
            </>
          )}
          {clients.length
            ? <Table columns={columns} rows={clients.map(n => ({ id: n, name: n }))} />
            : <p className="faint">{t('mcpgw.clients.empty')}</p>}
        </>
      )}
      <ConfirmBar open={!!ask} message={ask ? t(ask.key, ask.params) : ''}
        confirmLabel={t('mcpgw.confirm.ok')} cancelLabel={t('mcpgw.confirm.cancel')}
        onConfirm={runPending} onCancel={() => setPending(null)} />
    </Panel>
  );
}
