/* PiKaOs — app-level boot gate. On desktop it first decides WHICH server to talk to (the
   Connect-Server screen when none is saved / the saved one is unreachable / the user asked to
   switch — connect-server spec 2026-07-06), wires the desktop transport, and only THEN runs the
   original job: show the "Starting PIKA" curtain when the mascot bundle isn't cached for the
   current server build (GET /api/version build-hash check against localStorage). Mounted in
   main.jsx, wrapping <App/> — asset loading is independent of auth state, so this sits above
   the whole SPA rather than inside App.jsx's own conditional returns. */
import React from 'react';
const { useState, useEffect, useRef, useCallback } = React;
import { getVersion, configureTransport, getApiBase } from './lib/api.js';
import { packById, defaultPack, makeT } from './lib/i18n.jsx';
import { getBrand } from './lib/brand.js';
import { probeServer, serverKeyFor } from './lib/server-url.js';
import { ConnectServer } from './screens/ConnectServer.jsx';

// build-hash cache key, per server (spec §5): the same desktop talks to many servers, and server
// A's build must not satisfy server B's curtain check. Computed at USE time — the desktop transport
// (and therefore the active base) is wired before versionCheck runs on every path.
const bootKey = () => `pikaos.boot.v1:${serverKeyFor(getApiBase())}`;
// one-time scrub of the old global key (same pattern as api.js's localStorage scrub)
try { localStorage.removeItem('pikaos.boot.v1'); } catch (e) { /* ignore */ }
const LEX_KEY = 'guild-lex';        // same key App.jsx reads for the active lexicon/language
const BOOT_MIN = 1300;              // minimum curtain display so the animation doesn't flash by
const BOOT_HARD_CAP = 4000;         // never trap the user on the splash if the mascot fails to load

// sessionStorage flag: '1' = show Connect-Server even when the saved server is reachable
// (set by the "change server" link on FirstRun/Login, cleared on the next successful connect)
export const FORCE_CONNECT_KEY = 'pikaos.forceConnect';

// mirrors App.jsx's own lex -> language resolution, kept independent so AppBoot doesn't need
// App.jsx's internal state (it wraps App, it isn't rendered inside it). Returns the real language
// code (not collapsed to en/th) so makeT can resolve packs like ja for the pre-App boot screens.
function currentLanguage() {
  let lex = null;
  try { lex = localStorage.getItem(LEX_KEY); } catch (e) { /* ignore */ }
  const pack = (lex && packById(lex)) || defaultPack() || {};
  return pack.lang || 'en';
}

// desktop transport (API base + bearer-token provider) must be wired to the main process
// BEFORE any request fires — including the version fetch — and well before App mounts and
// useAuth's restore() runs (App/children only mount once phase reaches 'ready')
function wireDesktopTransport(apiBaseUrl) {
  configureTransport({
    apiBase: apiBaseUrl,
    tokenProvider: {
      get: () => window.pikaosDesktop.auth.getAccessToken(),
      refresh: async () => !!(await window.pikaosDesktop.auth.getAccessToken()),
    },
  });
}

export function AppBoot({ children }) {
  const [phase, setPhase] = useState('checking'); // 'checking' | 'connect' | 'booting' | 'ready'
  const frame = useRef(null);
  const mascotReady = useRef(false);
  const bootDone = useRef(false);
  const mounted = useRef(true);
  const t0 = useRef(0);
  const buildRef = useRef(null);

  const pika = useCallback((method, ...args) => {
    const w = frame.current && frame.current.contentWindow;
    if (w) { try { w.postMessage({ pika: method, args }, '*'); } catch (e) { /* ignore */ } }
  }, []);

  // cache check: compare the server's current build hash to the one saved on the last
  // successful boot — shared by the auto path and the Connect-Server path
  const versionCheck = useCallback(() => {
    let stored = null;
    try { stored = localStorage.getItem(bootKey()); } catch (e) { /* ignore */ }
    getVersion()
      .then((v) => {
        if (!mounted.current) return;
        buildRef.current = (v && v.build) || null;
        setPhase(buildRef.current && buildRef.current === stored ? 'ready' : 'booting');
      })
      .catch(() => { if (mounted.current) setPhase('booting'); });
  }, []);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      if (window.pikaosDesktop?.isDesktop) {
        let force = false;
        try { force = sessionStorage.getItem(FORCE_CONNECT_KEY) === '1'; } catch (e) { /* ignore */ }
        let cfg = null;
        try { cfg = await window.pikaosDesktop.config.get(); } catch (e) { /* main unreachable → connect */ }
        const hasSaved = !!cfg && Array.isArray(cfg.servers) && cfg.servers.length > 0 && !!cfg.apiBaseUrl;
        const reachable = !force && hasSaved && await probeServer(cfg.apiBaseUrl);
        if (!mounted.current) return;
        if (!reachable) { setPhase('connect'); return; }   // spec: fresh / unreachable / forced
        wireDesktopTransport(cfg.apiBaseUrl);
      }
      if (mounted.current) versionCheck();
    })();
    return () => { mounted.current = false; };
  }, [versionCheck]);

  // Connect-Server probed + saved a server → same wiring as the auto path, then normal boot
  const onConnected = useCallback((apiBaseUrl) => {
    try { sessionStorage.removeItem(FORCE_CONNECT_KEY); } catch (e) { /* ignore */ }
    wireDesktopTransport(apiBaseUrl);
    versionCheck();
  }, [versionCheck]);

  // boot curtain: hold a minimum, finish once the mascot signals ready (or immediately on narrow
  // screens), hard-capped so a missing/broken iframe never traps the user.
  useEffect(() => {
    if (phase !== 'booting') return;
    document.body.classList.add('on-login');
    t0.current = (typeof performance !== 'undefined' ? performance.now() : 0);

    const finish = () => {
      if (bootDone.current) return;
      bootDone.current = true;
      if (buildRef.current) { try { localStorage.setItem(bootKey(), buildRef.current); } catch (e) { /* ignore */ } }
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
  if (phase === 'connect') return <ConnectServer language={currentLanguage()} onConnected={onConnected} />;
  if (phase === 'ready') return children;

  // brand + copy from the white-label seam / i18n packs — never a hardcoded literal here (the
  // seam exists so a white-label build renames the wordmark and message in one place)
  const brand = getBrand();
  const word = brand.wordmarkLetters;
  const bootMsg = makeT(currentLanguage())('boot.starting', { name: brand.name });
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
