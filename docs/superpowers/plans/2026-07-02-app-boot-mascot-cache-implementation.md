# App Boot Gate + Mascot Cache-Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extract the "Starting PIKA" boot curtain out of `FirstRun.jsx` into a new `AppBoot` gate that wraps the whole SPA, conditional on a `GET /api/version` build-hash cache check — skip the curtain entirely on repeat visits, only re-show it when the cached build is stale or missing.

**Architecture:** One new component, `AppBoot`, mounted in `main.jsx` wrapping `<App/>` (not inside `App.jsx`'s own return — `App()` has three separate early-return statements for `auth.ready`/`auth.loggedIn`/the authenticated shell, and restructuring those into one conditional tree to nest `AppBoot` inside them would be a much larger, riskier change to an already-large, heavily-relied-on file for zero behavioral benefit; wrapping at the `main.jsx` root achieves the identical "wraps the whole SPA, independent of auth" outcome with a minimal, low-risk diff — this is a refinement over the approved spec's literal wording, not a scope change, and mirrors `main.jsx`'s own existing precedent of reading `localStorage` synchronously before first paint). `AppBoot` picks its own bilingual boot text by independently reading the same `guild-lex` localStorage key `App.jsx` reads, via the shared `lib/i18n.jsx` pack lookup — it does not need any prop from `App.jsx`, since it wraps `App`, not the reverse.

**Tech Stack:** React 18, Vite. No new dependencies. No frontend test runner in this repo — verification per task is `npm run lint` + `npm run build`, run via standalone Docker (see Global Constraints).

## Global Constraints

- Mascot assets are already ported and working: `PiKaOs-Core/Frontend/public/mascot/embed.html` + its `src/*.js` + vendored `three` — done in commit `b1506a2`, nothing further needed there.
- New `localStorage` key: `pikaos.boot.v1` (formal `pikaos.*` prefix, matching `TOKEN_KEY = "pikaos.access"` in `api.js` — never the legacy `guildos.*` prefix, per this project's formal-terminology-only rule).
- No new npm dependencies.
- No backend changes — `GET /api/version` already exists (`Backend/app/core/routers/health.py:27-33`, returns `{version, build, name}`).
- `npm run lint` / `npm run build` verification commands (run from `PiKaOs-Core/Frontend/`, this repo has no running dev container by default — build the deps image once, then run these standalone so no compose stack is required):
  ```bash
  docker build --target deps -t pikaos-frontend-deps -f Dockerfile .
  docker run --rm -v "$(pwd):/app" -v /app/node_modules -w /app pikaos-frontend-deps npm run lint
  docker run --rm -v "$(pwd):/app" -v /app/node_modules -w /app pikaos-frontend-deps npm run build
  ```
  Current baseline (confirmed this session): lint = 0 errors (pre-existing warnings only); build succeeds.
- Running the dev server for manual visual verification requires asking the user first ("want me to run it, or will you?") per this project's rule — `lint`/`build` do not need to ask.

---

## File Structure

**Create:**
- `PiKaOs-Core/Frontend/src/AppBoot.jsx` — the boot gate component (peer to `App.jsx`, not under `components/` — it wraps `App`, it isn't a reusable UI atom consumed by screens).

**Modify:**
- `PiKaOs-Core/Frontend/src/lib/api.js` — add `getVersion()`.
- `PiKaOs-Core/Frontend/src/main.jsx` — import `AppBoot`, wrap `<App/>`.
- `PiKaOs-Core/Frontend/src/screens/FirstRun.jsx` — remove the `booting` state, the boot-curtain `useEffect`, the curtain JSX block, and the now-unused `bootMsg` DICT entries; keep the persistent left-pane mascot iframe and its `pikaReady`→`sleeping` transition.

---

### Task 1: `getVersion()` in `api.js`

**Files:**
- Modify: `PiKaOs-Core/Frontend/src/lib/api.js:120-123` (the `--- first-run setup ---` section)

**Interfaces:**
- Produces: `export async function getVersion()` — returns `{version, build, name}` (resolves the promise from `GET /api/version`, pre-auth). Task 2 (`AppBoot.jsx`) imports and calls this.

- [ ] **Step 1: Add the function**

In `api.js`, the file currently has this section:

```js
// --- first-run setup (kernel console-code gate) ---
// The Core prints a rotating setup code to the server console (stdout) on startup; the operator
// pastes it here to unlock the install page (Jupyter-token pattern). No auth — this gate runs
// before any account exists.
// TODO(kernel backend): POST /api/setup/verify-code + GET /api/setup/status don't exist yet — these
// 404 until that lands. The FirstRun screen handles the missing backend gracefully in dev preview.
export async function setupStatus() { return raw("/setup/status", { auth: false }); }   // { needsSetup, ... }
export async function verifySetupCode(code) {
  return raw("/setup/verify-code", { method: "POST", auth: false, body: { code } });
}
```

Add this new section immediately after it (before the `--- LLM provider config API ---` section):

```js

// --- app version / build hash (AppBoot's mascot-cache check; also the seam release-and-
// rollback.md §4's SPA version-skew policy is meant to use) ---
export async function getVersion() { return raw("/version", { auth: false }); }   // { version, build, name }
```

- [ ] **Step 2: Lint**

```bash
cd PiKaOs-Core/Frontend
docker build --target deps -t pikaos-frontend-deps -f Dockerfile .
docker run --rm -v "$(pwd):/app" -v /app/node_modules -w /app pikaos-frontend-deps npm run lint
```
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add PiKaOs-Core/Frontend/src/lib/api.js
git commit -m "feat(api): add getVersion() for the AppBoot mascot-cache check"
```

---

### Task 2: `AppBoot` component

**Files:**
- Create: `PiKaOs-Core/Frontend/src/AppBoot.jsx`

**Interfaces:**
- Consumes: `getVersion` from `./lib/api.js` (Task 1). `packById`, `defaultPack` from `./lib/i18n.jsx` (already exported — confirmed via the existing `import { makeT, DEFAULT_LANG, DEFAULT_STYLE, packById, defaultPack, defaultPackForLang, LEX_PACKS } from './lib/i18n.jsx';` in `App.jsx`).
- Produces: `export function AppBoot({ children })`. Task 4 (`main.jsx`) imports and wraps `<App/>` with it: `<AppBoot><App /></AppBoot>`.

- [ ] **Step 1: Write the component**

```jsx
/* PiKaOs — app-level boot gate: shows the "Starting PIKA" curtain only when the mascot bundle
   hasn't been cached for the current server build (GET /api/version build-hash check against
   localStorage). Mounted in main.jsx, wrapping <App/> — asset loading is independent of auth
   state, so this sits above the whole SPA rather than inside App.jsx's own conditional returns. */
import React from 'react';
const { useState, useEffect, useRef, useCallback } = React;
import { getVersion } from './lib/api.js';
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

  // cache check: compare the server's current build hash to the one saved on the last successful boot
  useEffect(() => {
    let alive = true;
    let stored = null;
    try { stored = localStorage.getItem(BOOT_KEY); } catch (e) { /* ignore */ }
    getVersion()
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
```

Note: `.ltr` (line with `className="ltr"`) and the `glowBreath`/`letterBounce`/`bootDots` keyframes are already defined globally in `src/styles/login.css`, imported unconditionally via `src/styles/index.css` — no new CSS needed, confirmed this session (`--radius-lg`, `--gold-glow`, etc. tokens and these three keyframes are already present and loaded app-wide, not scoped to any one screen).

- [ ] **Step 2: Lint**

```bash
cd PiKaOs-Core/Frontend
docker run --rm -v "$(pwd):/app" -v /app/node_modules -w /app pikaos-frontend-deps npm run lint
```
Expected: no new errors.

- [ ] **Step 3: Build**

```bash
docker run --rm -v "$(pwd):/app" -v /app/node_modules -w /app pikaos-frontend-deps npm run build
```
Expected: succeeds (component isn't imported anywhere yet — this only proves it's syntactically valid on its own).

- [ ] **Step 4: Commit**

```bash
git add PiKaOs-Core/Frontend/src/AppBoot.jsx
git commit -m "feat(shell): add AppBoot — cache-checked mascot boot curtain"
```

---

### Task 3: Remove the boot curtain from `FirstRun.jsx`

**Files:**
- Modify: `PiKaOs-Core/Frontend/src/screens/FirstRun.jsx` (four separate edits in the same file — DICT entries, state/refs, the boot `useEffect`, and the curtain JSX block)

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — `FirstRun`'s exported signature (`{ t, language, onLang, onVerified }`) is unchanged. The persistent left-pane mascot iframe (lines ~204-215 in the current file, unchanged by this task) keeps working exactly as before.

**Before making any edit, confirm the file hasn't drifted from what this task expects:**

```bash
grep -n "const \[booting\|const ready = useRef\|const bootDone = useRef\|const t0 = useRef\|bootMsg:" PiKaOs-Core/Frontend/src/screens/FirstRun.jsx
```
Expected output (line numbers may vary slightly if untouched context shifted, but these exact lines must exist):
```
30:    bootMsg: 'Starting PIKA',
49:    bootMsg: 'กำลังเริ่ม PIKA',
71:  const [booting, setBooting] = useState(true);
75:  const ready = useRef(false);
76:  const bootDone = useRef(false);
77:  const t0 = useRef(0);
```
If this doesn't match, STOP and report NEEDS_CONTEXT — do not guess at a different edit location.

- [ ] **Step 1: Remove `bootMsg` from both DICT entries**

Change (in the `en` block of `DICT`):
```js
    verifyLoad: 'Verifying…',
    bootMsg: 'Starting PIKA',
    errEmpty: 'Please enter the setup code from the server console.',
```
to:
```js
    verifyLoad: 'Verifying…',
    errEmpty: 'Please enter the setup code from the server console.',
```

Change (in the `th` block of `DICT`):
```js
    verifyLoad: 'กำลังตรวจสอบ…',
    bootMsg: 'กำลังเริ่ม PIKA',
    errEmpty: 'กรุณากรอกรหัสตั้งค่าจากคอนโซลของเซิร์ฟเวอร์',
```
to:
```js
    verifyLoad: 'กำลังตรวจสอบ…',
    errEmpty: 'กรุณากรอกรหัสตั้งค่าจากคอนโซลของเซิร์ฟเวอร์',
```

- [ ] **Step 2: Remove the `booting` state and the boot-only refs**

Change:
```jsx
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [booting, setBooting] = useState(true);
  const [ok, setOk] = useState(false);

  const frame = useRef(null);
  const ready = useRef(false);
  const bootDone = useRef(false);
  const t0 = useRef(0);
```
to:
```jsx
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [ok, setOk] = useState(false);

  const frame = useRef(null);
```

(`frame` stays — it still drives the persistent left-pane mascot iframe via `pika()`, used later in `succeed()`.)

- [ ] **Step 3: Simplify the boot `useEffect`**

Change:
```jsx
  // boot screen: hold a minimum, finish once the mascot is ready (or immediately when there is no
  // model / on narrow screens), hard-capped so a missing iframe never traps the user on the splash.
  useEffect(() => {
    document.body.classList.add('on-login');
    t0.current = (typeof performance !== 'undefined' ? performance.now() : 0);
    const BOOT_MIN = 1300;

    const finish = () => { if (!bootDone.current) { bootDone.current = true; setBooting(false); } };
    const tryFinish = () => {
      if (bootDone.current) return;
      const elapsed = (typeof performance !== 'undefined' ? performance.now() : BOOT_MIN) - t0.current;
      const isReady = ready.current || window.innerWidth < 760;
      if (elapsed >= BOOT_MIN && isReady) finish();
    };

    const onMsg = (e) => {
      if (e.data && e.data.pikaReady) {
        ready.current = true;
        pika('setState', 'sleeping');   // dormant — eyes shut — until setup succeeds
        tryFinish();
      }
    };
    window.addEventListener('message', onMsg);
    const t1 = setTimeout(tryFinish, BOOT_MIN + 40);
    const t2 = setTimeout(finish, 4000);   // hard cap

    return () => {
      document.body.classList.remove('on-login');
      window.removeEventListener('message', onMsg);
      clearTimeout(t1); clearTimeout(t2);
    };
  }, [pika]);
```
to:
```jsx
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
```

- [ ] **Step 4: Remove the curtain JSX block**

Change:
```jsx
    <div className="auth-screen">
      {/* boot / loading splash */}
      {booting && (
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
            {T.bootMsg}
            <span style={{ display: 'inline-flex', gap: 3 }}>
              {[0, 0.2, 0.4].map((d, i) => (
                <span key={i} style={{ width: 4, height: 4, borderRadius: '50%', background: 'var(--gold)', animation: `bootDots 1.1s ease-in-out ${d}s infinite` }} />
              ))}
            </span>
          </div>
        </div>
      )}

      {/* language toggle */}
```
to:
```jsx
    <div className="auth-screen">
      {/* language toggle */}
```

Do NOT remove `const word = ['P', 'I', 'K', 'A'];` (appears earlier in the file, before the `return`) — it is also used by the persistent left-pane mascot showcase (`{word.map((ch, i) => (<span key={i} className="ltr" style={{ fontSize: 52 }}>{ch}</span>))}`), which this task does not touch.

- [ ] **Step 5: Lint**

```bash
cd PiKaOs-Core/Frontend
docker run --rm -v "$(pwd):/app" -v /app/node_modules -w /app pikaos-frontend-deps npm run lint
```
Expected: no new errors. (`setBooting`/`booting`/`ready`/`bootDone`/`t0`/`BOOT_MIN` must have zero remaining references — lint's `no-undef`/`no-unused-vars` will catch a missed spot.)

- [ ] **Step 6: Build**

```bash
docker run --rm -v "$(pwd):/app" -v /app/node_modules -w /app pikaos-frontend-deps npm run build
```
Expected: succeeds.

- [ ] **Step 7: Commit**

```bash
git add PiKaOs-Core/Frontend/src/screens/FirstRun.jsx
git commit -m "refactor(firstrun): remove boot curtain (moved to AppBoot)"
```

---

### Task 4: Wire `AppBoot` into `main.jsx`

**Files:**
- Modify: `PiKaOs-Core/Frontend/src/main.jsx`

**Interfaces:**
- Consumes: `AppBoot` from `./AppBoot.jsx` (Task 2).
- Produces: nothing — this is the final integration point.

- [ ] **Step 1: Add the import**

In `main.jsx`, add this import next to `import App from './App.jsx';`:

```js
import { AppBoot } from './AppBoot.jsx';
```

- [ ] **Step 2: Wrap the render call**

Change:
```jsx
createRoot(document.getElementById('root')).render(<App />);
```
to:
```jsx
createRoot(document.getElementById('root')).render(<AppBoot><App /></AppBoot>);
```

- [ ] **Step 3: Build**

```bash
cd PiKaOs-Core/Frontend
docker run --rm -v "$(pwd):/app" -v /app/node_modules -w /app pikaos-frontend-deps npm run build
```
Expected: succeeds.

- [ ] **Step 4: Manual verification (ask the user first before starting the dev server)**

Ask: "Want me to run the dev server to verify this visually, or will you run it yourself?" If you run it:
```bash
./start.sh
```
Then confirm, in order:
- First visit (or after clearing `localStorage`): the "Starting PIKA" / "กำลังเริ่ม PIKA" curtain shows with the real animated mascot underneath (not a blank iframe), then clears into `FirstRun` (or the app shell, if already signed in) within ~1.3–4 seconds.
- Reload the page again immediately: the curtain does NOT reappear — goes straight to the next screen with no flash.
- In devtools, run `localStorage.removeItem('pikaos.boot.v1')` then reload: the curtain reappears.
- No console errors from the mascot iframe (check devtools — the mascot loads and animates, `EffectComposer`/`RoomEnvironment` etc. resolve with no 404s).
- `FirstRun`'s own left-pane mascot (once the curtain clears) still shows and still transitions through its states (sleeping → surprised → happy) on a successful setup-code submit, exactly as before this change.

- [ ] **Step 5: Commit**

```bash
git add PiKaOs-Core/Frontend/src/main.jsx
git commit -m "feat(shell): wire AppBoot into the app entry point"
```

---

## Deferred (explicitly out of scope for this plan)

- The broader "new version — reload" toast for an already-open tab hitting a stale build (release-and-rollback.md §4 point 2) — a separate, wider concern than the boot-moment cache check built here.
- Real search / notifications / chat wiring for `BottomUtilityBar` — unrelated, already deferred in that feature's own plan.
- Backend `/api/setup/*` — unrelated; `FirstRun`'s setup-code verification still 404s for real use on this branch, tracked separately.
