/* AI Console — chat over the desktop bridge (spec 2026-07-08-ai-console-byo-key).
   Desktop-only: browsers have no OS keychain, so off-desktop this renders nothing and the bar
   never shows the button. All copy through t('ai.*').

   Two modes, no endpoint field:
   - byo-key: provider picker + model + a WRITE-ONLY key field. The key goes to ai.setKey and is
     cleared from local state — there is no read-back path anywhere. (Ollama is keyless.)
   - admin: no key, no picker. Shows what the Admin published (provider · model from ai.getConfig)
     plus a plain explanation. If the managed runtime can't be reached (AI plugin absent / caller
     lacks llm.view) the console shows its own error state and NEVER falls back to byo-key.

   The off-desktop / closed guard lives in this thin outer function BEFORE any hook, so it stays
   plain-callable for the house test idiom; all hooks live in AiConsoleInner. */
import React, { useEffect, useRef, useState } from 'react';
import {
  toChatMessages, adminCloudLimited, resolveSurface, assistantText,
} from './AiConsole.logic.js';

export function AiConsole({ t, open, onClose }) {
  const bridge = typeof window !== 'undefined' ? window.pikaosDesktop : null;
  if (!bridge || !open) return null;
  return <AiConsoleInner t={t} bridge={bridge} onClose={onClose} />;
}

function AiConsoleInner({ t, bridge }) {
  const [cfg, setCfg] = useState(null);          // {mode, provider, model, baseUrl, maxSteps, hasKey}
  const [keyDraft, setKeyDraft] = useState('');
  const [input, setInput] = useState('');
  const [log, setLog] = useState([]);            // [{role:'user'|'assistant', content}]
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);    // running tool name / error banner
  const [adminError, setAdminError] = useState(false);
  const logRef = useRef(null);

  useEffect(() => {
    bridge.ai.getConfig().then(setCfg);
    bridge.ai.onEvent((ev) => {
      if (ev.type === 'tool') setStatus(t('ai.tool.running') + ' ' + ev.name);
      if (ev.type === 'error') setStatus(t('ai.error.generic'));
      if (ev.type === 'done') setStatus(null);
    });
  }, [bridge, t]);
  useEffect(() => { logRef.current?.scrollTo(0, logRef.current.scrollHeight); }, [log]);

  if (!cfg) return <div className="pop-empty">{t('ai.loading')}</div>;

  const surface = resolveSurface(cfg, adminError);

  const setMode = async (mode) => {
    setAdminError(false);
    await bridge.ai.setConfig({ mode });
    setCfg(await bridge.ai.getConfig());
  };
  const saveSetup = async () => {
    if (keyDraft.trim()) { await bridge.ai.setKey(cfg.provider, keyDraft.trim()); setKeyDraft(''); }
    setCfg(await bridge.ai.getConfig());
  };
  const pickProvider = async (provider) => {
    await bridge.ai.setConfig({ provider });
    setCfg(await bridge.ai.getConfig());
  };
  const send = async () => {
    const content = input.trim();
    if (!content || busy) return;
    setInput(''); setBusy(true);
    const next = [...log, { role: 'user', content }];
    setLog(next);
    try {
      const r = await bridge.ai.chat(toChatMessages(next));
      setLog([...next, { role: 'assistant', content: assistantText(r, t('ai.truncated')) }]);
    } catch {
      // Under admin, a failed run means the managed runtime is unreachable — surface the dedicated
      // admin-unavailable state rather than a generic banner, and never fall back to byo-key.
      if (cfg.mode === 'admin') setAdminError(true);
      else setStatus(t('ai.error.generic'));
    } finally { setBusy(false); }
  };
  const stop = () => bridge.ai.stop();

  const modeTab = (mode, label) => (
    <button
      type="button"
      className={'ai-mode-tab' + (cfg.mode === mode ? ' active' : '')}
      style={{
        flex: 1, fontSize: 11.5, padding: '5px 0', cursor: 'pointer',
        border: '1px solid var(--line)', background: cfg.mode === mode ? 'var(--line-soft)' : 'transparent',
        fontWeight: cfg.mode === mode ? 600 : 400,
      }}
      onClick={() => setMode(mode)}
    >{label}</button>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 420 }}>
      <div className="pop-head">
        <span className="pop-title">{t('ai.title')}</span>
        {cfg.mode === 'admin'
          ? <span className="mono faint" style={{ fontSize: 11 }}>{cfg.provider} · {cfg.model}</span>
          : (
            <select className="bf-input" style={{ width: 'auto', fontSize: 12 }} value={cfg.provider}
              onChange={(e) => pickProvider(e.target.value)} data-no-lex>
              <option value="ollama">Ollama</option>
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
            </select>
          )}
      </div>

      <div style={{ display: 'flex', gap: 6, padding: '8px 14px 0' }}>
        {modeTab('byo-key', t('ai.mode.byoKey'))}
        {modeTab('admin', t('ai.mode.admin'))}
      </div>

      {surface === 'admin-unavailable' && (
        <div style={{ padding: 14 }}>
          <div className="pop-empty" style={{ color: 'var(--danger, #c0392b)' }}>{t('ai.mode.adminUnavailable')}</div>
        </div>
      )}

      {surface === 'setup' && (
        <div style={{ padding: 14, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{t('ai.setup.title')}</div>
          <div className="faint" style={{ fontSize: 11.5 }}>{t('ai.setup.hint')}</div>
          <input className="bf-input" type="password" placeholder={t('ai.setup.keyPh')}
            value={keyDraft} onChange={(e) => setKeyDraft(e.target.value)} />
          <button type="button" className="pop-foot" style={{ border: '1px solid var(--line)' }}
            onClick={saveSetup} disabled={!keyDraft.trim()}>{t('ai.setup.save')}</button>
        </div>
      )}

      {(surface === 'chat' || surface === 'admin') && (
        <>
          {surface === 'admin' && (
            <div className="faint" style={{ fontSize: 11.5, padding: '8px 14px 0' }}>{t('ai.mode.adminHint')}</div>
          )}
          <div ref={logRef} style={{ flex: 1, overflowY: 'auto', padding: '10px 14px', minHeight: 120 }}>
            {log.length === 0 && <div className="pop-empty">{t('ai.empty')}</div>}
            {log.map((m, i) => (
              <div key={i} style={{ marginBottom: 8, fontSize: 13, lineHeight: 1.5 }}>
                <span className="mono faint" style={{ fontSize: 10.5, marginRight: 6 }}>
                  {m.role === 'user' ? t('ai.you') : t('ai.assistant')}
                </span>
                <span style={{ whiteSpace: 'pre-wrap' }}>{m.content}</span>
              </div>
            ))}
            {status && <div className="mono faint" style={{ fontSize: 11 }}>{status}</div>}
          </div>
          <div style={{ display: 'flex', gap: 6, padding: '10px 14px', borderTop: '1px solid var(--line-soft)' }}>
            {adminCloudLimited(cfg) ? (
              // admin + cloud runtime: sending would 401 (no client-side key). Explain, don't send.
              <div className="faint" style={{ fontSize: 11.5, flex: 1 }}>{t('ai.mode.adminHint')}</div>
            ) : (
              <>
                <input className="bf-input" style={{ flex: 1 }} placeholder={t('ai.input.placeholder')}
                  value={input} onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && send()} disabled={busy} />
                {busy
                  ? <button type="button" className="pop-action" onClick={stop}>{t('ai.stop')}</button>
                  : <button type="button" className="pop-action" onClick={send}>{t('ai.send')}</button>}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
