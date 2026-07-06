# PiKaOs-Core Frontend — App-level boot gate + mascot cache-check

**Date:** 2026-07-02
**Status:** approved design, not yet implemented
**Scope:** extract the "Starting PIKA" boot curtain out of `FirstRun.jsx` into an app-level gate
that wraps the whole SPA, and make it conditional on a build-hash cache check instead of always
showing. Also in scope: porting the actual mascot WebGL bundle into this project (currently
missing, so the boot curtain never really finishes loading a mascot today — see Why). Individual
content screens and the rest of the app shell are unaffected.

## Why

Today the "Starting PIKA" boot curtain (full-screen splash: bouncing "PIKA" letters + boot-message
dots + a mascot iframe underneath) is local state inside `FirstRun.jsx` — it only ever shows for a
not-yet-logged-in user, and shows on *every* visit to that screen regardless of whether the
mascot's assets were already loaded before. Meanwhile a returning, already-logged-in user sees no
boot experience at all — `App.jsx` renders `null` while `auth.ready` resolves, then goes straight
to the app shell.

The user wants the boot curtain to be a general "the app has a 3D asset to load, wait for it"
gate that runs for every visitor, but **only when actually needed**: skip it entirely once the
mascot bundle has been loaded before, and only re-show it when the cached version doesn't match
what the server currently ships (e.g. after a deploy that changed the mascot).

This maps directly onto an already-documented (but not yet implemented) mechanism in
[release-and-rollback.md §4](../../../PiKaOs-Docs/docs/architecture/release-and-rollback.md):
`GET /api/version` returns a build hash for exactly this kind of cache/skew check. The backend
endpoint already exists (`Backend/app/core/routers/health.py:27-33`); this design wires the
frontend to it, scoped specifically to gating the boot curtain (not the broader "new version,
please reload" toast release-and-rollback.md also describes — that's a separate, out-of-scope
concern).

Separately: the boot curtain's mascot iframe points at `/mascot/embed.html`, which does not exist
anywhere in `PiKaOs-Core/Frontend` — confirmed by searching the whole `Frontend/` tree, `vite.config.js`,
and `nginx.conf.template`. The real mascot bundle (`embed.html`, `Face.js`, `PikaMascot.js`,
`Limbs.js`, `lights.js`, `main.js`, `states.js`, `support.js`) only exists in the DesignSync
claude.ai design-system project (`390db268-9d3b-4638-aec2-35d29aa67748`), imported into
`PiKaOs-Docs/design-system/` earlier this session but never ported into the actual app. Building a
cache-check around a mascot that 404s is pointless, so porting the real files in is part of this
same effort.

## Design

### Component boundary

**New:** `PiKaOs-Core/Frontend/src/components/AppBoot.jsx` — a top-level gate component, not a
screen (parallel reasoning to why `BottomUtilityBar`/`UtilityBarButton`/`PopoverPanel` live in
`src/components/ui/`: this is app-shell infrastructure, not routed content). Wraps `{children}` —
mounted in `App.jsx` *above* the existing `if (!auth.ready) return null;` gate, since asset
loading is independent of auth state.

```
<AppBoot>
  {!auth.ready ? null : !auth.loggedIn ? <FirstRun .../> : <the authenticated app shell>}
</AppBoot>
```

**`FirstRun.jsx` changes:** removes the `booting` state, the boot-curtain JSX block (current lines
159–180), and the `BOOT_MIN`/`pikaReady`/hard-cap `useEffect` (lines 87–116) — all of that logic
moves into `AppBoot.jsx` verbatim (same constants, same postMessage contract). `FirstRun.jsx`
**keeps** its own persistent left-pane mascot iframe (the "showcase" next to the code-entry form,
current lines 204–215) exactly as-is — confirmed with the user this stays. That iframe is
independent of `AppBoot`'s temporary one; the two are never mounted at the same time in practice
(the curtain — if shown — covers the whole screen including where `FirstRun` would render, and by
the time `FirstRun` is visible the curtain has already finished).

### Cache/version check (data flow)

1. **New API helper** in `src/lib/api.js`, next to `setupStatus()`/`verifySetupCode()` (same
   pre-auth section): `export async function getVersion() { return raw("/version", { auth: false }); }`
   — hits `GET /api/version`, which already exists and returns `{version, build, name}`
   (`Backend/app/core/routers/health.py:27-33`). No backend changes.
2. **Storage key:** `localStorage` key `pikaos.boot.v1`, matching the formal `pikaos.*` naming
   already established for `TOKEN_KEY = "pikaos.access"` in `api.js` (per the project's
   formal-terminology-only rule — legacy `guildos.*` keys elsewhere, e.g. `guildos.notify.v1`,
   `guildos.rooms.v2`, are pre-existing game-metaphor debt, not a pattern to extend) — stores the
   last-seen `build` string.
3. **On `AppBoot` mount:**
   - Read `storedHash = localStorage.getItem('pikaos.boot.v1')` synchronously.
   - Call `getVersion()` (async, in parallel — no other work is blocked on this besides the gate
     itself).
   - While the request is in flight: render `null` (mirrors the existing `if (!auth.ready) return
     null;` pattern in `App.jsx` — not a new UX idiom, the same one applied one gate earlier).
   - **`build === storedHash`:** skip straight to rendering `children`. No curtain, no temporary
     mascot iframe ever mounted.
   - **`build !== storedHash`** (mismatch, or `storedHash` was `null` — first visit): render the
     curtain + a temporary mascot iframe (`<iframe src="/mascot/embed.html">`, same as today's
     `FirstRun` one), run the existing `BOOT_MIN` (1300ms) + `pikaReady` postMessage wait, hard-capped
     at 4000ms exactly as today. On completion: `localStorage.setItem('pikaos.boot.v1', build)`,
     unmount the temporary iframe, remove the curtain, render `children`.

### Error handling

- `getVersion()` rejects (network error, backend not up yet) → treated identically to "no stored
  hash": show the curtain, attempt the mascot load, still hard-capped at 4000ms. Never blocks
  forever — same fail-safe philosophy already in `FirstRun.jsx` today.
- Mascot iframe fails to load / never sends `pikaReady` → same existing hard-cap fallback (already
  built, just relocated) — the curtain always clears within 4 seconds regardless.
- No retry logic beyond what exists today — keep this addition minimal, don't invent new resilience
  machinery for a decorative element.

### Mascot asset porting (DONE — commit `b1506a2`, prerequisite completed before writing the plan)

Ported into `PiKaOs-Core/Frontend/public/mascot/`: `embed.html` + `src/{PikaMascot,Face,Limbs,lights,states}.js`
(source: DesignSync project `390db268-9d3b-4638-aec2-35d29aa67748`). `main.js`/`support.js`/`index.html`
(the DesignSync project's own debug-panel preview harness) were confirmed unneeded — `embed.html`'s
only entry-point import is `./src/PikaMascot.js`, which doesn't reach them.

**Found and fixed during porting:** `embed.html`'s original import map pointed `three` and
`three/addons/` at `unpkg.com` (a CDN) — pinned to Three.js 0.160.0, an older version than this
app's already-installed `three` (`^0.184.0`, used by Room 3D — `PiKaOs-Core/Frontend/src/lib/room-three.jsx`).
Confirmed with the user and vendored a fully offline copy instead:
- **Source:** the official `github.com/mrdoob/three.js` repo, tag `r185` (= npm `0.185.1`, the
  current latest stable release, confirmed against the npm registry this session) — not unpkg.
- **Isolated from the app's own `three` dependency** — kept as its own copy under
  `public/mascot/vendor/`, not touching `PiKaOs-Core/Frontend/package.json`'s `three` version, so
  bumping to "latest" for the mascot carries zero regression risk to the already-working Room 3D
  feature. The mascot is a raw static iframe outside the Vite bundle anyway, so this isolation is
  free, not extra work.
- **Full dependency tree resolved and vendored**, not just the two files the import map originally
  named: `vendor/three.module.js` + `vendor/three.core.js` (Three.js splits into these two as of
  recent releases) + 11 files under `vendor/jsm/{postprocessing,environments,shaders}/` (every
  relative import transitively reachable from `PikaMascot.js`'s `three/addons/postprocessing/*`
  and `lights.js`'s `three/addons/environments/RoomEnvironment.js` imports — verified with a script
  that every relative import across the whole tree resolves to a file on disk; zero missing).
- `embed.html`'s import map was rewritten to `"three": "./vendor/three.module.js"` /
  `"three/addons/": "./vendor/jsm/"` — no other file needed any edits, since import maps resolve
  bare specifiers per-document regardless of where they point.

Vite serves anything under `public/` at the site root unchanged, so `/mascot/embed.html` (already
referenced by `FirstRun.jsx`) now resolves for real — no build config changes needed.

### Testing / verification

No automated frontend test suite exists in this repo (no vitest/jest — confirmed this session).
Verification is `npm run lint` + `npm run build` (as used for every task this session), plus manual
browser verification (requires asking the user first per this project's rule 4 before starting any
dev server):
- First visit / cleared `localStorage` → real mascot animation shows in the curtain (not a blank
  iframe), then `FirstRun` (or the app shell) appears.
- Reload immediately after → curtain is skipped entirely, no flash.
- Manually delete the `pikaos.boot.v1` key → curtain reappears on next load.

## Not deciding now

- The broader "new version — reload" toast for an *already-open* tab hitting a stale build
  (release-and-rollback.md §4 point 2) is a separate, wider concern (affects the whole SPA, not
  just the boot moment) — out of scope here.
- Whether the mascot should also appear anywhere in the authenticated app shell (e.g. inside
  `BottomUtilityBar`'s profile popover) — not requested, not designed here.

## Non-goals

- No service worker / Cache Storage API (Approach C, considered and rejected — over-engineered for
  a decorative WebGL mascot, per the 3-approach comparison presented to and picked by the user).
- No backend changes — `/api/version` already exists and already returns everything needed.
- No changes to any screen other than `FirstRun.jsx` (curtain removal only) and the new `AppBoot.jsx`.
