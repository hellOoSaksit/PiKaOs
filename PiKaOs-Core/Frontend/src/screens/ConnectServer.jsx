/* PiKaOs — desktop-only Connect-Server screen (connect-server spec 2026-07-06).
   The first thing a desktop user meets: one centered field for the server URL/IP, the brand
   wordmark on top (via the white-label seam — never hardcoded), and the locally-remembered
   server list (connect / edit / delete). No mascot on this screen by design.
   Props: { language, onConnected } — onConnected(apiBaseUrl) fires after a successful
   probe + save; AppBoot then wires the desktop transport and continues the normal boot. */
import React from 'react';
const { useState, useEffect } = React;
import { getBrand } from '../lib/brand.js';
import { normalizeServerInput, probeServer } from '../lib/server-url.js';

const DICT = {
  en: {
    title: 'Connect to your server',
    subtitle: (name) => `Enter the address of your ${name} server — for example 192.168.1.50:8000 or https://pikaos.example.com`,
    placeholder: 'server URL or IP',
    connect: 'Connect',
    connecting: 'Connecting…',
    savedTitle: 'Saved servers',
    neverUsed: 'not used yet',
    edit: 'Edit',
    remove: 'Delete',
    warnHttp: 'Unencrypted connection (http) — use only on a trusted network.',
    errEmpty: 'Enter a server address.',
    errInvalid: 'That address is not a valid URL or IP.',
    errHttp: 'Plain http is allowed only for local, LAN, or VPN addresses — use https for public servers.',
    errUnreachable: 'Cannot reach a server at this address.',
    errSave: 'Connected, but saving the server failed — check the desktop logs.',
  },
  th: {
    title: 'เชื่อมต่อเซิร์ฟเวอร์',
    subtitle: (name) => `กรอกที่อยู่เซิร์ฟเวอร์ ${name} ของคุณ — เช่น 192.168.1.50:8000 หรือ https://pikaos.example.com`,
    placeholder: 'URL หรือ IP ของเซิร์ฟเวอร์',
    connect: 'เชื่อมต่อ',
    connecting: 'กำลังเชื่อมต่อ…',
    savedTitle: 'เซิร์ฟเวอร์ที่บันทึกไว้',
    neverUsed: 'ยังไม่เคยใช้',
    edit: 'แก้ไข',
    remove: 'ลบ',
    warnHttp: 'การเชื่อมต่อไม่เข้ารหัส (http) — ใช้ได้เฉพาะเครือข่ายที่ไว้ใจ',
    errEmpty: 'กรุณากรอกที่อยู่เซิร์ฟเวอร์',
    errInvalid: 'ที่อยู่นี้ไม่ใช่ URL หรือ IP ที่ถูกต้อง',
    errHttp: 'http ใช้ได้เฉพาะที่อยู่ local / LAN / VPN — เซิร์ฟเวอร์สาธารณะต้องใช้ https',
    errUnreachable: 'ติดต่อเซิร์ฟเวอร์ตามที่อยู่นี้ไม่ได้',
    errSave: 'เชื่อมต่อได้ แต่บันทึกเซิร์ฟเวอร์ไม่สำเร็จ — ตรวจ log ของแอป',
  },
};

const ERR_KEY = { empty: 'errEmpty', invalid: 'errInvalid', http_not_allowed: 'errHttp' };

export function ConnectServer({ language, onConnected }) {
  const T = DICT[DICT[language] ? language : 'en'];
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
    catch (e) { setError(T[ERR_KEY[e.message] || 'errInvalid']); return; }
    setBusy(true); setError('');
    try {
      if (!(await probeServer(target.url))) { setError(T.errUnreachable); return; }
      // upsert: this server becomes the newest row; the main process re-validates every
      // entry, dedupes by url, and caps the list (spec "save rule": only a successful
      // probe ever writes)
      const next = [{ url: target.url, lastUsedAt: new Date().toISOString() },
                    ...servers.filter((s) => s.url !== target.url)];
      try { await window.pikaosDesktop.config.set({ apiBaseUrl: target.url, servers: next }); }
      catch (e) { setError(T.errSave); return; }
      onConnected(target.url);
    } finally { setBusy(false); }
  };

  const removeServer = async (url) => {
    const next = servers.filter((s) => s.url !== url);
    setServers(next);
    // deleting a row is list housekeeping, not a disconnect — the active URL stays
    try {
      const cfg = await window.pikaosDesktop.config.get();
      await window.pikaosDesktop.config.set({ apiBaseUrl: cfg.apiBaseUrl, servers: next });
    } catch (e) { /* next successful connect rewrites the list anyway */ }
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
        color: 'var(--ink)', letterSpacing: '-0.02em' }}>{T.title}</h1>
      <p style={{ margin: '0 0 24px', color: 'var(--ink-3)', fontSize: 14, lineHeight: 1.55,
        textAlign: 'center', maxWidth: 420 }}>
        {T.subtitle(brand.name)}
      </p>

      <form onSubmit={submit} noValidate style={{ width: '100%', maxWidth: 420 }}>
        <input className="auth-input mono" type="text" autoFocus spellCheck={false} autoComplete="off"
          value={input} placeholder={T.placeholder} disabled={busy} aria-label={T.placeholder}
          onChange={(e) => onChange(e.target.value)} />
        {warn && !error && (
          <p style={{ margin: '8px 0 0', fontSize: 12.5, color: 'var(--gold)' }}>{T.warnHttp}</p>
        )}
        {error && (
          <p role="alert" style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--crimson-deep)' }}>{error}</p>
        )}
        <button type="submit" className="btn btn-gold" disabled={busy}
          style={{ width: '100%', padding: 13, fontSize: 15, marginTop: 14 }}>
          {busy ? T.connecting : T.connect}
        </button>
      </form>

      {servers.length > 0 && (
        <div style={{ width: '100%', maxWidth: 420, marginTop: 34 }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10.5, letterSpacing: '.16em',
            textTransform: 'uppercase', color: 'var(--ink-4)', marginBottom: 10 }}>{T.savedTitle}</div>
          {servers.map((s) => (
            <div key={s.url} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px',
              border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)', background: 'var(--bg-2)',
              marginBottom: 8 }}>
              <button type="button" onClick={() => connect(s.url)} disabled={busy}
                style={{ flex: 1, textAlign: 'left', background: 'none', border: 0, cursor: 'pointer', padding: 0 }}>
                <div className="mono" style={{ fontSize: 13, color: 'var(--ink)' }}>{s.url}</div>
                <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 2 }}>
                  {s.lastUsedAt ? new Date(s.lastUsedAt).toLocaleString() : T.neverUsed}
                </div>
              </button>
              <button type="button" title={T.edit} aria-label={`${T.edit} ${s.url}`} disabled={busy}
                onClick={() => onChange(s.url)}
                style={{ background: 'none', border: '1px solid var(--line)', borderRadius: 'var(--radius-sm)',
                  color: 'var(--ink-3)', cursor: 'pointer', padding: '4px 8px', fontSize: 12 }}>✎</button>
              <button type="button" title={T.remove} aria-label={`${T.remove} ${s.url}`} disabled={busy}
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
