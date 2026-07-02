/* PiKaOs — First-run setup gate (Core kernel "console-code" screen).
   The very first screen on a fresh install: BEFORE any account exists, the Core prints a rotating
   setup code to the server console (stdout). The operator pastes that one code here to unlock the
   install page. No login, no password — a single code field (Jupyter-token pattern).

   This is the start of the UI refactor: it reuses the new split-stage theme from the Login design
   (Login.dc.html) — mascot showcase on the left, form on the right, branded boot screen — but the
   four login fields collapse to ONE: the setup code.

   Backend: GET /api/setup/status + POST /api/setup/verify-code are TODO(Phase C / kernel). Until they
   exist this screen degrades gracefully in dev (accepts any non-empty code for preview, logs a warning).
   Props: { t, language, onLang, onVerified } — onVerified(code) fires once the code is accepted. */
import React from 'react';
const { useState, useEffect, useRef, useCallback } = React;
import * as api from '../lib/api.js';

const DICT = {
  en: {
    brand: 'PIKA — Internal AI Assistant',
    tagline: 'Secure internal AI workspace. First-run setup.',
    orgBadge: 'Console setup required',
    kicker: 'First-run · Setup',
    title: 'Enter setup code',
    subtitle: 'A one-time setup code was printed to the server console when PIKA started. Paste it below to begin installation.',
    codeLabel: 'Setup code',
    codePh: 'e.g.  PIKA-7F3A-K9QD',
    codeHint: 'Find it in the server console / startup logs (stdout). The code rotates on every restart.',
    verifyIdle: 'Continue',
    verifyLoad: 'Verifying…',
    errEmpty: 'Please enter the setup code from the server console.',
    errInvalid: 'That setup code is not valid. Check the latest code in the server console.',
    errNetwork: 'Cannot reach the server. Is the Core running?',
    okTitle: 'Code accepted',
    footerNote: 'Internal AI System',
  },
  th: {
    brand: 'PIKA — ผู้ช่วย AI ภายในองค์กร',
    tagline: 'พื้นที่ทำงาน AI ภายในที่ปลอดภัย · ตั้งค่าครั้งแรก',
    orgBadge: 'ต้องตั้งค่าผ่านคอนโซล',
    kicker: 'เริ่มต้นครั้งแรก · ตั้งค่า',
    title: 'กรอกรหัสตั้งค่า',
    subtitle: 'ระบบได้พิมพ์รหัสตั้งค่าแบบครั้งเดียวไว้ที่คอนโซลของเซิร์ฟเวอร์ตอนเริ่มทำงาน วางรหัสด้านล่างเพื่อเริ่มการติดตั้ง',
    codeLabel: 'รหัสตั้งค่า',
    codePh: 'เช่น  PIKA-7F3A-K9QD',
    codeHint: 'ดูได้จากคอนโซล / log ตอนเริ่มระบบ (stdout) รหัสจะเปลี่ยนใหม่ทุกครั้งที่รีสตาร์ท',
    verifyIdle: 'ดำเนินการต่อ',
    verifyLoad: 'กำลังตรวจสอบ…',
    errEmpty: 'กรุณากรอกรหัสตั้งค่าจากคอนโซลของเซิร์ฟเวอร์',
    errInvalid: 'รหัสตั้งค่าไม่ถูกต้อง กรุณาตรวจรหัสล่าสุดที่คอนโซล',
    errNetwork: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ — Core กำลังทำงานอยู่หรือไม่?',
    okTitle: 'รหัสถูกต้อง',
    footerNote: 'ระบบ AI ภายใน',
  },
};

// Preview mode (URL carries #firstrun/?firstrun) — lets us view the screen even when the setup backend
// isn't up. Outside preview the real /api/setup/verify-code response governs success/failure.
const PREVIEW = (() => {
  try { return /(?:[?#&])firstrun\b/.test(window.location.hash + window.location.search); } catch (e) { return false; }
})();

export function FirstRun({ t, language, onLang, onVerified }) {
  const lang = DICT[language] ? language : 'en';
  const T = DICT[lang];

  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);

  const frame = useRef(null);

  // drive the mascot iframe over postMessage
  const pika = useCallback((method, ...args) => {
    const w = frame.current && frame.current.contentWindow;
    if (w) { try { w.postMessage({ pika: method, args }, '*'); } catch (e) { /* ignore */ } }
  }, []);

  // the boot curtain itself now lives in AppBoot (mounted above App in main.jsx) — this just puts
  // the persistent left-pane mascot to sleep once it's loaded, until setup succeeds (see succeed()
  // below, which wakes it back up).
  useEffect(() => {
    document.body.classList.add('on-login');
    const onMsg = (e) => {
      if (e.data && e.data.pikaReady) pika('setState', 'sleeping');
    };
    window.addEventListener('message', onMsg);
    return () => {
      document.body.classList.remove('on-login');
      window.removeEventListener('message', onMsg);
    };
  }, [pika]);

  const succeed = useCallback((value) => {
    setOk(true);
    // wake the mascot: eyes snap open, then a delighted cheer
    pika('setState', 'surprised');
    setTimeout(() => { pika('setState', 'happy'); pika('playGesture', 'cheer'); }, 650);
    setTimeout(() => { if (onVerified) onVerified(value); }, 1100);
  }, [pika, onVerified]);

  const submit = async (e) => {
    e.preventDefault();
    if (loading || ok) return;
    const value = code.trim();
    if (!value) { setError(T.errEmpty); return; }
    setError('');
    setLoading(true);
    try {
      await api.verifySetupCode(value);
      succeed(value);
    } catch (err) {
      // Preview only (#firstrun): if the setup backend isn't reachable, accept any non-empty code so the
      // screen is viewable. In real first-run this is OFF — a wrong/unreachable code shows the real error.
      if (PREVIEW && import.meta.env.DEV && (err.status === 0 || err.status === 404)) {
        console.warn('[FirstRun] preview: setup backend unreachable (status %s) — accepting code locally.', err.status);
        succeed(value);
      } else if (err.status === 0) {
        setError(T.errNetwork);
      } else if (err.status === 400 || err.status === 401 || err.status === 403) {
        setError(T.errInvalid);
      } else {
        setError(T.errInvalid);
      }
    } finally {
      setLoading(false);
    }
  };

  const word = ['P', 'I', 'K', 'A'];

  return (
    <div className="auth-screen">
      {/* language toggle */}
      {onLang && (
        <div className="auth-lang" role="group" aria-label="language">
          <button type="button" className={lang === 'en' ? 'on' : ''} onClick={() => onLang('en')}>EN</button>
          <button type="button" className={lang === 'th' ? 'on' : ''} onClick={() => onLang('th')}>ไทย</button>
        </div>
      )}

      {/* LEFT — mascot showcase */}
      <div className="auth-hero">
        <div style={{ position: 'absolute', top: '50%', left: '50%', width: 620, height: 620,
          transform: 'translate(-50%,-58%)', background: 'radial-gradient(circle, var(--gold-glow) 0%, transparent 62%)',
          pointerEvents: 'none', animation: 'glowBreath 7s ease-in-out infinite' }} />
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(var(--line) 1.1px, transparent 1.1px)',
          backgroundSize: '26px 26px', opacity: .5, pointerEvents: 'none',
          maskImage: 'radial-gradient(circle at 50% 45%, #000 30%, transparent 72%)',
          WebkitMaskImage: 'radial-gradient(circle at 50% 45%, #000 30%, transparent 72%)' }} />

        <div style={{ display: 'flex', gap: 10, position: 'relative', zIndex: 2 }}>
          {word.map((ch, i) => (<span key={i} className="ltr" style={{ fontSize: 52 }}>{ch}</span>))}
        </div>

        <div style={{ position: 'relative', zIndex: 2, width: 340, height: 380, animation: 'pikaFloat 5.5s ease-in-out infinite' }}>
          <iframe src="/mascot/embed.html" title="PIKA mascot" ref={frame} allowTransparency="true" loading="eager"
            style={{ width: '100%', height: '100%', border: 0, background: 'transparent', pointerEvents: 'none' }} />
          {!ok && (
            <div style={{ position: 'absolute', top: 92, left: 196, pointerEvents: 'none', zIndex: 4,
              fontFamily: 'var(--font-head)', fontWeight: 800, color: 'var(--gold-bright)', opacity: .85 }}>
              <span style={{ position: 'absolute', fontSize: 15, animation: 'zzz 2.6s ease-in-out infinite' }}>z</span>
              <span style={{ position: 'absolute', left: 13, top: -9, fontSize: 19, animation: 'zzz 2.6s ease-in-out .85s infinite' }}>z</span>
              <span style={{ position: 'absolute', left: 31, top: -23, fontSize: 24, animation: 'zzz 2.6s ease-in-out 1.7s infinite' }}>Z</span>
            </div>
          )}
        </div>

        <div style={{ position: 'relative', zIndex: 2, textAlign: 'center', maxWidth: 360 }}>
          <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 19, color: 'var(--ink)', letterSpacing: '.01em' }}>{T.brand}</div>
          <div style={{ marginTop: 6, fontSize: 14, color: 'var(--ink-3)', lineHeight: 1.55 }}>{T.tagline}</div>
          <div style={{ marginTop: 14, display: 'inline-flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font-mono)',
            fontSize: 10, letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--ink-4)', padding: '5px 12px',
            border: '1px solid var(--line)', borderRadius: 999, background: 'var(--bg-2)' }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--gold)', boxShadow: '0 0 6px var(--gold)' }} />{T.orgBadge}
          </div>
        </div>
      </div>

      {/* RIGHT — single code field */}
      <div className="auth-formpane">
        <form onSubmit={submit} style={{ width: '100%', maxWidth: 384, animation: 'softIn .45s ease both' }} noValidate>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontFamily: 'var(--font-mono)', fontSize: 10.5,
            letterSpacing: '.2em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--gold)', boxShadow: '0 0 7px var(--gold-glow)' }} />{T.kicker}
          </div>
          <h1 style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 29, margin: '14px 0 8px', color: 'var(--ink)', letterSpacing: '-0.02em' }}>{T.title}</h1>
          <p style={{ margin: '0 0 26px', color: 'var(--ink-3)', fontSize: 14.5, lineHeight: 1.55 }}>{T.subtitle}</p>

          <div style={{ marginBottom: 16 }}>
            <label htmlFor="setup-code" style={{ display: 'block', fontFamily: 'var(--font-head)', fontWeight: 600, fontSize: 13, color: 'var(--ink-2)', marginBottom: 8 }}>{T.codeLabel}</label>
            <input id="setup-code" className="auth-input mono" type="text" inputMode="text" autoComplete="off"
              autoCapitalize="characters" spellCheck={false} autoFocus value={code} placeholder={T.codePh}
              onChange={(e) => { setCode(e.target.value); setError(''); }} disabled={loading || ok} />
            <p style={{ margin: '8px 0 0', fontSize: 12, color: 'var(--ink-4)', lineHeight: 1.5 }}>{T.codeHint}</p>
          </div>

          {error && (
            <div role="alert" style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 16, padding: '11px 14px',
              borderRadius: 'var(--radius-sm)', background: 'color-mix(in srgb, var(--crimson) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--crimson) 35%, transparent)', color: 'var(--crimson-deep)', fontSize: 13.5 }}>
              <span style={{ fontWeight: 700 }}>!</span>{error}
            </div>
          )}

          {ok && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 16, padding: '11px 14px',
              borderRadius: 'var(--radius-sm)', background: 'color-mix(in srgb, var(--emerald) 10%, transparent)',
              border: '1px solid color-mix(in srgb, var(--emerald) 35%, transparent)', color: 'var(--emerald)', fontSize: 13.5,
              animation: 'softIn .3s ease both' }}>
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true"><path d="M5 13l4 4 10-11" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
              {T.okTitle}
            </div>
          )}

          <button type="submit" className="btn btn-gold" disabled={loading || ok} style={{ width: '100%', padding: 14, fontSize: 15.5 }}>
            {loading ? T.verifyLoad : T.verifyIdle}
          </button>

          <footer style={{ marginTop: 26, paddingTop: 20, borderTop: '1px solid var(--line-soft)', display: 'flex',
            alignItems: 'center', justifyContent: 'center', gap: 8, flexWrap: 'wrap', fontFamily: 'var(--font-mono)',
            fontSize: 10.5, letterSpacing: '.04em', color: 'var(--ink-4)' }}>
            <span>PIKA · {T.footerNote}</span>
            <span style={{ color: 'var(--line)' }}>•</span>
            <span>v0.2</span>
          </footer>
        </form>
      </div>
    </div>
  );
}
