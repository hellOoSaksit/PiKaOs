/* PiKaOs — app-level boot gate: shows the "Starting PIKA" curtain only when the mascot bundle
   hasn't been cached for the current server build (GET /api/version build-hash check against
   localStorage). Mounted in main.jsx, wrapping <App/> — asset loading is independent of auth
   state, so this sits above the whole SPA rather than inside App.jsx's own conditional returns. */
import React from 'react';
const { useState, useEffect, useRef, useCallback } = React;
import { getVersion, configureTransport } from './lib/api.js';
import { packById, defaultPack } from './lib/i18n.jsx';

const BOOT_KEY = 'pikaos.boot.v1';
const LEX_KEY = 'guild-lex';        // same key App.jsx reads for the active lexicon/language
const BOOT_MIN = 1300;              // minimum curtain display so the animation doesn't flash by
const BOOT_HARD_CAP = 4000;         // never trap the user on the splash if the mascot fails to load

const BOOT_MSG = { en: 'Starting PIKA', th: 'กำลังเริ่ม PIKA' };

// mirrors App.jsx's own lex -> language resolution, kept independent so AppBoot doesn't need
// App.jsx's internal state (it wraps App, it isn't rendered inside it)
function currentLanguage() {
  let lex = null;
  try { lex = localStorage.getItem(LEX_KEY); } catch (e) { /* ignore */ }
  const pack = (lex && packById(lex)) || defaultPack() || {};
  return pack.lang === 'en' ? 'en' : 'th';
}

export function AppBoot({ children }) {
  const [phase, setPhase] = useState('checking'); // 'checking' | 'booting' | 'ready'
  const frame = useRef(null);
  const mascotReady = useRef(false);
  const bootDone = useRef(false);
  const t0 = useRef(0);
  const buildRef = useRef(null);

  const pika = useCallback((method, ...args) => {
    const w = frame.current && frame.current.contentWindow;
    if (w) { try { w.postMessage({ pika: method, args }, '*'); } catch (e) { /* ignore */ } }
  }, []);

  // cache check: compare the server's current build hash to the one saved on the last successful boot.
  // On desktop, the transport (API base + bearer-token provider) must be wired to the main process
  // BEFORE any request fires — including this one — and well before App mounts and useAuth's restore()
  // runs (App/children only mount once this component reaches phase 'ready', see below).
  useEffect(() => {
    let alive = true;
    let stored = null;
    try { stored = localStorage.getItem(BOOT_KEY); } catch (e) { /* ignore */ }
    (async () => {
      if (window.pikaosDesktop?.isDesktop) {
        // Configure the desktop transport in its own try so a config.get() rejection can't also
        // abort the version fetch below and stall boot — the version fetch must always run.
        try {
          const { apiBaseUrl } = await window.pikaosDesktop.config.get();
          configureTransport({
            apiBase: apiBaseUrl,
            tokenProvider: {
              get: () => window.pikaosDesktop.auth.getAccessToken(),
              refresh: async () => !!(await window.pikaosDesktop.auth.getAccessToken()),
            },
          });
        } catch (e) { /* desktop transport unconfigured; version fetch + boot still proceed */ }
      }
      return getVersion();
    })()
      .then((v) => {
        if (!alive) return;
        buildRef.current = (v && v.build) || null;
        setPhase(buildRef.current && buildRef.current === stored ? 'ready' : 'booting');
      })
      .catch(() => { if (alive) setPhase('booting'); });
    return () => { alive = false; };
  }, []);

  // boot curtain: hold a minimum, finish once the mascot signals ready (or immediately on narrow
  // screens), hard-capped so a missing/broken iframe never traps the user.
  useEffect(() => {
    if (phase !== 'booting') return;
    document.body.classList.add('on-login');
    t0.current = (typeof performance !== 'undefined' ? performance.now() : 0);

    const finish = () => {
      if (bootDone.current) return;
      bootDone.current = true;
      if (buildRef.current) { try { localStorage.setItem(BOOT_KEY, buildRef.current); } catch (e) { /* ignore */ } }
      setPhase('ready');
    };
    const tryFinish = () => {
      if (bootDone.current) return;
      const elapsed = (typeof performance !== 'undefined' ? performance.now() : BOOT_MIN) - t0.current;
      const isReady = mascotReady.current || window.innerWidth < 760;
      if (elapsed >= BOOT_MIN && isReady) finish();
    };

    const onMsg = (e) => {
      if (e.data && e.data.pikaReady) {
        mascotReady.current = true;
        pika('setState', 'sleeping');
        tryFinish();
      }
    };
    window.addEventListener('message', onMsg);
    const t1 = setTimeout(tryFinish, BOOT_MIN + 40);
    const t2 = setTimeout(finish, BOOT_HARD_CAP);

    return () => {
      document.body.classList.remove('on-login');
      window.removeEventListener('message', onMsg);
      clearTimeout(t1); clearTimeout(t2);
    };
  }, [phase, pika]);

  if (phase === 'checking') return null;
  if (phase === 'ready') return children;

  const word = ['P', 'I', 'K', 'A'];
  const bootMsg = BOOT_MSG[currentLanguage()];
  return (
    <>
      <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', gap: 26, background: 'var(--bg-1)' }}>
        <div style={{ position: 'absolute', top: '50%', left: '50%', width: 520, height: 520,
          transform: 'translate(-50%,-56%)', background: 'radial-gradient(circle, var(--gold-glow) 0%, transparent 62%)',
          pointerEvents: 'none', animation: 'glowBreath 6s ease-in-out infinite' }} />
        <div style={{ display: 'flex', gap: 11, position: 'relative', zIndex: 2 }}>
          {word.map((ch, i) => (
            <span key={i} className="ltr" style={{ fontSize: 62, animation: `letterBounce 1.15s ease-in-out ${i * 0.12}s infinite` }}>{ch}</span>
          ))}
        </div>
        <div style={{ position: 'relative', zIndex: 2, display: 'flex', alignItems: 'center', gap: 8,
          fontFamily: 'var(--font-mono)', fontSize: 11.5, letterSpacing: '.14em', textTransform: 'uppercase', color: 'var(--ink-3)' }}>
          {bootMsg}
          <span style={{ display: 'inline-flex', gap: 3 }}>
            {[0, 0.2, 0.4].map((d, i) => (
              <span key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--gold)', animation: `bootDots 1.1s ease-in-out ${d}s infinite` }} />
            ))}
          </span>
        </div>
      </div>
      <iframe src="/mascot/embed.html" title="PIKA mascot" ref={frame} allowTransparency="true" loading="eager"
        style={{ position: 'fixed', width: 1, height: 1, opacity: 0, border: 0, pointerEvents: 'none' }} />
    </>
  );
}
