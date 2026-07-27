/* The external-AI gateway switchboard, at the top of AI Access — the door, above the list of what
   is behind it. Desktop shell only: every control here goes through window.pikaosDesktop.gateway,
   so on the web build there is nothing to talk to and the panel must not render at all. */
import React from 'react';
const { useCallback, useEffect, useRef, useState } = React;
import Panel from '../../components/ui/Panel.jsx';
import Switch from '../../components/ui/Switch.jsx';
import Table from '../../components/ui/Table.jsx';

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
    return api.onStatus(setStatus);
  }, [api, refresh]);

  // The "Copied" flip-back is a timer outside React's render cycle; clear it on unmount so it
  // never fires setState against a panel that is already gone.
  useEffect(() => () => { if (copiedTimer.current) clearTimeout(copiedTimer.current); }, []);

  if (!api) return null;

  const toggle = async (on) => {
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
      await navigator.clipboard.writeText(config);
      setError(false);
      setCopied(true);
      clearTimeout(copiedTimer.current);
      copiedTimer.current = setTimeout(() => setCopied(false), COPIED_MS);
    } catch {
      setError(true);
    }
  };
  const revoke = async (name) => {
    try {
      await api.revoke(name);
      setError(false);
      refresh();
    } catch {
      setError(true);
    }
  };

  const label = !status.enabled ? t('mcpgw.status.off')
    : status.connections === 0 ? t('mcpgw.status.waiting')
    : t('mcpgw.status.connected', { n: status.connections });

  const columns = [
    { key: 'name', header: t('mcpgw.clients.title'), render: (r) => <strong>{r.name}</strong> },
    { key: 'act', header: '', render: (r) => (
        <button type="button" className="pop-action" onClick={() => revoke(r.name)}>
          {t('mcpgw.clients.revoke')}
        </button>) },
  ];

  return (
    <Panel title={t('mcpgw.title')} right={<span className="faint">{label}</span>}>
      <Switch checked={status.enabled} onChange={toggle} label={t('mcpgw.enable')} />
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
    </Panel>
  );
}
