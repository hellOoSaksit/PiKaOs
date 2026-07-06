/* PiKaOs — desktop-only Connect-Server screen (connect-server spec 2026-07-06).
   The first thing a desktop user meets: one centered field for the server URL/IP, the brand
   wordmark on top (via the white-label seam — never hardcoded), and the locally-remembered
   server list (connect / edit / delete). No mascot on this screen by design.
   Props: { language, onConnected } — onConnected(apiBaseUrl) fires after a successful
   probe + save; AppBoot then wires the desktop transport and continues the normal boot. */
import React from 'react';
const { useState, useEffect } = React;
import { getBrand } from '../lib/brand.js';
import { makeT } from '../lib/i18n.jsx';
import { normalizeServerInput, probeServer } from '../lib/server-url.js';

// normalizeServerInput throws Error('empty'|'invalid'|'http_not_allowed') → the matching i18n key
const ERR_KEY = { empty: 'connect.errEmpty', invalid: 'connect.errInvalid', http_not_allowed: 'connect.errHttp' };

export function ConnectServer({ language, onConnected }) {
  // standalone i18n: this screen renders above <App/> (AppBoot wraps App), before Sys.t exists —
  // makeT resolves through the same JSON packs with the 4-level fallback, so no strings are hardcoded
  const t = makeT(language);
  const brand = getBrand();

  const [input, setInput] = useState('');
  const [servers, setServers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [warn, setWarn] = useState(false);

  useEffect(() => {
    window.pikaosDesktop.config.get()
      .then((cfg) => setServers(Array.isArray(cfg?.servers) ? cfg.servers : []))
      .catch(() => setServers([]));
  }, []);

  // live plain-http warning while typing — informational only, the connect click decides
  const onChange = (value) => {
    setInput(value); setError('');
    try { setWarn(normalizeServerInput(value).plainHttp); } catch (e) { setWarn(false); }
  };

  const connect = async (raw) => {
    if (busy) return;
    let target;
    try { target = normalizeServerInput(raw); }
    catch (e) { setError(t(ERR_KEY[e.message] || 'connect.errInvalid')); return; }
    setBusy(true); setError('');
    try {
      if (!(await probeServer(target.url))) { setError(t('connect.errUnreachable')); return; }
      // upsert: this server becomes the newest row; the main process re-validates every
      // entry, dedupes by url, and caps the list (spec "save rule": only a successful
      // probe ever writes)
      const next = [{ url: target.url, lastUsedAt: new Date().toISOString() },
                    ...servers.filter((s) => s.url !== target.url)];
      try { await window.pikaosDesktop.config.set({ apiBaseUrl: target.url, servers: next }); }
      catch (e) { setError(t('connect.errSave')); return; }
      onConnected(target.url);
    } finally { setBusy(false); }
  };

  const removeServer = async (url) => {
    const prev = servers;
    setServers(servers.filter((s) => s.url !== url));   // optimistic
    // deleting a row is list housekeeping, not a disconnect. Filter off the freshly-read config
    // (not local state) so we persist against the real stored list, and roll the UI back if the
    // write fails so a "deleted" row never silently returns on relaunch.
    try {
      const cfg = await window.pikaosDesktop.config.get();
      const remaining = (Array.isArray(cfg.servers) ? cfg.servers : []).filter((s) => s.url !== url);
      // if the deleted row IS the active server, repoint apiBaseUrl to the next saved one — otherwise
      // AppBoot would auto-connect on the next launch to a server the user just deleted (and which no
      // longer appears in the list to delete again). No rows left → apiBaseUrl is moot: AppBoot needs
      // servers.length > 0 to auto-connect, so it falls through to this Connect-Server screen anyway.
      const nextActive = cfg.apiBaseUrl === url ? (remaining[0]?.url ?? cfg.apiBaseUrl) : cfg.apiBaseUrl;
      await window.pikaosDesktop.config.set({ apiBaseUrl: nextActive, servers: remaining });
    } catch (e) {
      setServers(prev);        // rollback: reflect what is actually persisted
      setError(t('connect.errDelete'));
    }
  };

  const submit = (e) => { e.preventDefault(); connect(input); };

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', background: 'var(--bg-1)', overflowY: 'auto', padding: 24 }}>
      {/* brand: an image logo when the white-label system sets one, else the wordmark letters */}
      {brand.logoUrl
        ? <img src={brand.logoUrl} alt={brand.name} style={{ maxHeight: 72, maxWidth: 260, objectFit: 'contain' }} />
        : <div style={{ display: 'flex', gap: 10 }}>
            {brand.wordmarkLetters.map((ch, i) => (<span key={i} className="ltr" style={{ fontSize: 46 }}>{ch}</span>))}
          </div>}

      <h1 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 26, margin: '26px 0 8px',
        color: 'var(--ink)', letterSpacing: '-0.02em' }}>{t('connect.title')}</h1>
      <p style={{ margin: '0 0 24px', color: 'var(--ink-3)', fontSize: 14, lineHeight: 1.55,
        textAlign: 'center', maxWidth: 420 }}>
        {t('connect.subtitle', { name: brand.name })}
      </p>

      <form onSubmit={submit} noValidate style={{ width: '100%', maxWidth: 420 }}>
        <input className="auth-input mono" type="text" autoFocus spellCheck={false} autoComplete="off"
          value={input} placeholder={t('connect.placeholder')} disabled={busy} aria-label={t('connect.placeholder')}
          onChange={(e) => onChange(e.target.value)} />
        {warn && !error && (
          <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--gold)' }}>{t('connect.warnHttp')}</p>
        )}
        {error && (
          <p role="alert" style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--crimson-deep)' }}>{error}</p>
        )}
        <button type="submit" className="btn btn-gold" disabled={busy}
          style={{ width: '100%', padding: 13, fontSize: 15, marginTop: 14 }}>
          {busy ? t('connect.connecting') : t('connect.connect')}
        </button>
      </form>

      {servers.length > 0 && (
        <div style={{ width: '100%', maxWidth: 420, marginTop: 34 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.16em',
            textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 10 }}>{t('connect.savedTitle')}</div>
          {servers.map((s) => (
            <div key={s.url} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
              border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-2)',
              marginBottom: 8 }}>
              <button type="button" onClick={() => connect(s.url)} disabled={busy}
                style={{ flex: 1, textAlign: 'left', background: 'none', border: 0, cursor: 'pointer', padding: 0 }}>
                <div className="mono" style={{ fontSize: 13, color: 'var(--ink)' }}>{s.url}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2 }}>
                  {s.lastUsedAt ? new Date(s.lastUsedAt).toLocaleString() : t('connect.neverUsed')}
                </div>
              </button>
              <button type="button" title={t('connect.edit')} aria-label={`${t('connect.edit')} ${s.url}`} disabled={busy}
                onClick={() => onChange(s.url)}
                style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)',
                  color: 'var(--ink-3)', cursor: 'pointer', padding: '4px 8px', fontSize: 12 }}>✎</button>
              <button type="button" title={t('connect.remove')} aria-label={`${t('connect.remove')} ${s.url}`} disabled={busy}
                onClick={() => removeServer(s.url)}
                style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)',
                  color: 'var(--crimson-deep)', cursor: 'pointer', padding: '4px 8px', fontSize: 12 }}>🗑</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
