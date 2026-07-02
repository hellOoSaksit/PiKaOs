# Shell/Nav/Theme Reset — BottomUtilityBar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the global `BottomUtilityBar` (home/search/notifications/add/chat/profile floating pill nav) to `PiKaOs-Core/Frontend`, ported from the DesignSync `Bottom Utility Bar.dc.html` reference, wired to real app data — without touching the existing nested content-nav's logic.

**Architecture:** Three new presentational components (`UtilityBarButton`, `PopoverPanel`, `BottomUtilityBar`) in `src/components/ui/` (matching where `Dropdown.jsx`/`Toast.jsx`/`Notifications.jsx`/`Search.jsx` already live — not `src/screens/`, which holds routed content screens, not shared shell chrome). One new stylesheet `src/styles/shell.css`. `BottomUtilityBar` owns its own `active`/`openPop` UI state (mirrors the DC `Component` class) and receives all real data (auth, theme, i18n) as props — no state duplication, no mock data inside the component.

**Tech Stack:** React 18 (function components, `useState`/`useEffect`), Vite, plain CSS custom properties (no CSS-in-JS, no Tailwind). No frontend test runner exists in this repo (`package.json` has no `test` script, no vitest/jest) — verification per task is `npm run lint` (eslint) + `npm run build` (vite compile check) + a manual browser check, matching how `FirstRun.jsx`/`login.css` were verified this session.

## Global Constraints

- Every string goes through `t("key")` via the existing `makeT(lang, style)` pack system (`src/lib/i18n.jsx:86-95`) — new keys added to `src/data/i18n/en-formal.json` and `src/data/i18n/th-formal.json` first, never hardcoded (CLAUDE.md §1.2).
- Never pass inline `style` to a shared component unless you own that component's prop contract — this project's `Panel` silently drops `style` (lessons.md trap D); the new components here accept `className` and define their own `style` only inside themselves.
- Reuse existing CSS custom properties from `src/styles/styles.css` `:root` (`--line`, `--line-soft`, `--bg-2`, `--bg-3`, `--ink-3`, `--ink-4`, `--crimson`, `--emerald`, `--sapphire`, `--amethyst`, `--gold-grad`, `--gold-deep`, `--gold-bright`, `--raised-grad`, `--shadow-raised`, `--shadow-pop`, `--radius-lg`, `--radius-sm`, `--font-head`, `--font-body`, `--font-mono`, `--font-display`, `--spring`) — all confirmed present in `styles.css` this session (`--radius-lg:59`, `--shadow-raised:53`, `--gold-grad:46-47`, `--line:18`, etc.). Never import the DesignSync `ds/pikaos-*.css` files — port markup into this project's own classes instead (same precedent as `login.css`).
- No new npm dependencies (tech-stack §4 dependency policy) — everything here is plain React + CSS.
- Running the dev server for manual verification requires asking the user first ("want me to run it, or will you?") per CLAUDE.md §0 — `npm run lint`/`npm run build` do not need to ask.
- This plan is Phase 1 of the frontend rebuild — content screens (Admin/Agents/Dashboard/etc.) are out of scope; only the shared shell.

---

## File Structure

**Create:**
- `PiKaOs-Core/Frontend/src/components/ui/UtilityBarButton.jsx` — one icon slot (icon, optional label, optional badge, active pill).
- `PiKaOs-Core/Frontend/src/components/ui/PopoverPanel.jsx` — generic popout shell (position, `popUp` animation, outside-click + Escape close).
- `PiKaOs-Core/Frontend/src/components/ui/BottomUtilityBar.jsx` — composes 6× `UtilityBarButton` + 4× `PopoverPanel`, owns `active`/`openPop` state, takes real data as props.
- `PiKaOs-Core/Frontend/src/styles/shell.css` — `barPop`/`popUp`/`badgePulse` keyframes + `.utility-bar`/`.ub-*`/`.popover-panel` layout rules.

**Modify:**
- `PiKaOs-Core/Frontend/src/data/i18n/en-formal.json` — add `utilitybar.*` translation keys.
- `PiKaOs-Core/Frontend/src/data/i18n/th-formal.json` — add `utilitybar.*` translation keys.
- `PiKaOs-Core/Frontend/src/styles/index.css` — add `@import './shell.css';`.
- `PiKaOs-Core/Frontend/src/App.jsx` — render `<BottomUtilityBar>` in the app shell (inside the `.app` div, alongside `Sidebar`/`Topbar`), wire real props.
- `PiKaOs-Core/Frontend/src/styles/styles.css` — tokenize the one remaining hardcoded value in the nav-caret rule (see Task 7 — this is a small hygiene fix, not a visual redesign; no DesignSync reference file exists yet for the nested content-nav, so a fuller reskin is deferred).

---

### Task 1: i18n strings for the utility bar

**Files:**
- Modify: `PiKaOs-Core/Frontend/src/data/i18n/en-formal.json`
- Modify: `PiKaOs-Core/Frontend/src/data/i18n/th-formal.json`

**Interfaces:**
- Produces: the `utilitybar.*` keys every later task's `t("utilitybar....")` call relies on. Also reuses two pre-existing keys: `t("theme.day")` / `t("theme.night")` (already in both packs) and `t("profile.signOut")` (already in both packs) — do not duplicate these.

- [ ] **Step 1: Read the current `translations` block shape**

Both files are JSON with a top-level `translations` object (flat dot-key → string), e.g. `en-formal.json` already has `"profile.signOut": "Sign out"`. Confirm this shape:

```bash
cd PiKaOs-Core/Frontend/src/data/i18n
python3 -c "import json; print(list(json.load(open('en-formal.json'))['translations'].items())[:3])"
```
Expected: prints 3 `["key", "value"]` pairs — confirms flat dot-key strings under `translations`.

- [ ] **Step 2: Add English keys to `en-formal.json`**

Open `en-formal.json`, find the `"translations": { ... }` object, and add these entries (anywhere inside the object — keep alphabetical-ish grouping with existing `profile.*`/`theme.*` keys if you want, order doesn't matter to the loader):

```json
"utilitybar.home": "Home",
"utilitybar.search": "Search",
"utilitybar.search.placeholder": "Search agents, tasks, files...",
"utilitybar.notifications": "Notifications",
"utilitybar.notifications.title": "Notifications",
"utilitybar.notifications.readAll": "Mark all read",
"utilitybar.notifications.empty": "No new notifications",
"utilitybar.notifications.viewAll": "View all notifications",
"utilitybar.add": "New",
"utilitybar.add.title": "Create new",
"utilitybar.chat": "Chat",
"utilitybar.chat.title": "Messages",
"utilitybar.chat.compose": "Compose",
"utilitybar.chat.empty": "No messages yet",
"utilitybar.chat.open": "Open inbox",
"utilitybar.profile": "Profile",
"utilitybar.profile.viewProfile": "View profile",
"utilitybar.profile.settings": "Settings"
```

- [ ] **Step 3: Add the matching Thai keys to `th-formal.json`**

Same key names, Thai values (mirrors the DC source copy where it exists):

```json
"utilitybar.home": "หน้าแรก",
"utilitybar.search": "ค้นหา",
"utilitybar.search.placeholder": "ค้นหาเอเจนต์ ภารกิจ ไฟล์...",
"utilitybar.notifications": "แจ้งเตือน",
"utilitybar.notifications.title": "การแจ้งเตือน",
"utilitybar.notifications.readAll": "อ่านทั้งหมด",
"utilitybar.notifications.empty": "ไม่มีการแจ้งเตือนใหม่",
"utilitybar.notifications.viewAll": "ดูการแจ้งเตือนทั้งหมด",
"utilitybar.add": "สร้าง",
"utilitybar.add.title": "สร้างใหม่",
"utilitybar.chat": "แชท",
"utilitybar.chat.title": "ข้อความ",
"utilitybar.chat.compose": "เขียนใหม่",
"utilitybar.chat.empty": "ยังไม่มีข้อความ",
"utilitybar.chat.open": "เปิดกล่องข้อความ",
"utilitybar.profile": "โปรไฟล์",
"utilitybar.profile.viewProfile": "ดูโปรไฟล์",
"utilitybar.profile.settings": "ตั้งค่า"
```

- [ ] **Step 4: Validate both files are still valid JSON**

```bash
cd PiKaOs-Core/Frontend/src/data/i18n
python3 -c "import json; json.load(open('en-formal.json')); json.load(open('th-formal.json')); print('OK')"
```
Expected: `OK` (no `JSONDecodeError`).

- [ ] **Step 5: Commit**

```bash
git add PiKaOs-Core/Frontend/src/data/i18n/en-formal.json PiKaOs-Core/Frontend/src/data/i18n/th-formal.json
git commit -m "feat(i18n): add utilitybar.* strings for the BottomUtilityBar"
```

---

### Task 2: `UtilityBarButton` component

**Files:**
- Create: `PiKaOs-Core/Frontend/src/components/ui/UtilityBarButton.jsx`

**Interfaces:**
- Consumes: nothing from other tasks (pure presentational leaf).
- Produces: `export function UtilityBarButton({ icon, label, showLabel, active, badge, onClick, title })` — `icon` is a JSX element (an `<svg>`), `label`/`title` are already-translated strings (caller passes `t(...)` output), `badge` is `number|null` (renders nothing when falsy/0), `active` is boolean (renders the gold pill background), `onClick(e)` is called with the native click event.

- [ ] **Step 1: Write the component**

```jsx
import React from 'react';

/**
 * One icon slot in the BottomUtilityBar: icon, optional label chip, optional
 * badge count, gold pill background when active. Mirrors the DC markup's
 * per-button structure (Bottom Utility Bar.dc.html) without repeating its
 * inline styles per call site.
 */
export function UtilityBarButton({ icon, label, showLabel = false, active = false, badge, onClick, title }) {
  const badgeText = badge > 9 ? '9+' : (badge > 0 ? String(badge) : null);
  return (
    <button
      type="button"
      className={'ub-btn' + (active ? ' active' : '')}
      title={title}
      onClick={onClick}
    >
      {active && <span className="ub-btn-pill" />}
      <span className="ub-btn-icon">{icon}</span>
      {badgeText && <span className="ub-badge">{badgeText}</span>}
      {showLabel && <span className="ub-btn-label">{label}</span>}
    </button>
  );
}
```

- [ ] **Step 2: Lint**

```bash
cd PiKaOs-Core/Frontend && docker compose -p pikaos -f deploy/docker-compose.generated.yml exec frontend npm run lint
```
Expected: no new errors (may show pre-existing warnings elsewhere — only new errors from this file block the task).

- [ ] **Step 3: Commit**

```bash
git add PiKaOs-Core/Frontend/src/components/ui/UtilityBarButton.jsx
git commit -m "feat(ui): add UtilityBarButton component"
```

---

### Task 3: `PopoverPanel` component

**Files:**
- Create: `PiKaOs-Core/Frontend/src/components/ui/PopoverPanel.jsx`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: `export function PopoverPanel({ open, onClose, anchor = 'right', width = 320, children })` — `anchor` is `'left'|'right'|'center'` (controls which side of the trigger button the popover hangs from, matching the DC markup's per-popout `left:0` / `right:0` / `left:50%;transform:translateX(-50%)` positioning), `width` in px, `onClose()` called on outside-click or Escape. Renders `null` when `!open`.

- [ ] **Step 1: Write the component**

```jsx
import React, { useEffect, useRef } from 'react';

/**
 * Generic popout shell used by the utility bar's search/notifications/chat/
 * profile buttons — the DC markup (Bottom Utility Bar.dc.html) repeats this
 * shell 4× nearly verbatim; this component + a children slot replaces that
 * duplication. Positioned relative to its parent (caller wraps the trigger
 * button + this panel in a `position:relative` container).
 */
export function PopoverPanel({ open, onClose, anchor = 'right', width = 320, children }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => { if (ref.current && !ref.current.contains(e.target)) onClose(); };
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div ref={ref} className={'popover-panel anchor-' + anchor} style={{ width }}>
      {children}
    </div>
  );
}
```

- [ ] **Step 2: Lint**

```bash
cd PiKaOs-Core/Frontend && docker compose -p pikaos -f deploy/docker-compose.generated.yml exec frontend npm run lint
```
Expected: no new errors.

- [ ] **Step 3: Commit**

```bash
git add PiKaOs-Core/Frontend/src/components/ui/PopoverPanel.jsx
git commit -m "feat(ui): add PopoverPanel component"
```

---

### Task 4: `shell.css` — keyframes + layout, imported into `index.css`

**Files:**
- Create: `PiKaOs-Core/Frontend/src/styles/shell.css`
- Modify: `PiKaOs-Core/Frontend/src/styles/index.css:10` (add the import, same pattern as `login.css`)

**Interfaces:**
- Consumes: existing tokens from `styles.css` `:root` (listed in Global Constraints above) — this file defines zero new custom properties.
- Produces: CSS classes `.utility-bar`, `.utility-bar-overlay`, `.ub-btn`, `.ub-btn.active`, `.ub-btn-pill`, `.ub-btn-icon`, `.ub-btn-label`, `.ub-badge`, `.ub-divider`, `.ub-profile-btn`, `.ub-profile-btn .ub-profile-ring`, `.popover-panel`, `.popover-panel.anchor-left/right/center` — every class name `UtilityBarButton`/`PopoverPanel`/`BottomUtilityBar` (Tasks 2/3/5) render.

- [ ] **Step 1: Confirm `index.css`'s current import pattern**

```bash
cat PiKaOs-Core/Frontend/src/styles/index.css
```
Expected: line 10 is `@import './login.css';` (or similar) — confirms the `@import` pattern to follow.

- [ ] **Step 2: Write `shell.css`**

```css
/* Bottom Utility Bar + generic popover shell — ported from DesignSync
   Bottom Utility Bar.dc.html. Tokens reused from styles.css (byte-identical
   to the DC reference's own CSS — never import ds/pikaos-*.css). */

@keyframes barPop {
  from { opacity: 0; transform: translate(-50%, 14px); }
  to   { opacity: 1; transform: translate(-50%, 0); }
}
@keyframes popUp {
  from { opacity: 0; transform: translateY(10px) scale(.97); }
  to   { opacity: 1; transform: translateY(0) scale(1); }
}
@keyframes badgePulse {
  0%, 100% { transform: scale(1); }
  45%      { transform: scale(1.18); }
}

.utility-bar-overlay {
  position: fixed; inset: 0; z-index: 40;
}

.utility-bar {
  position: fixed; left: 50%; bottom: 22px; transform: translateX(-50%);
  z-index: 42;
  display: flex; align-items: center; gap: 5px;
  padding: 9px;
  border-radius: var(--radius-lg);
  background: var(--bg-2);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-pop);
  animation: barPop .4s var(--spring) both;
}

.ub-btn {
  position: relative;
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  width: 54px; padding: 9px 6px;
  border: none; background: transparent;
  border-radius: 15px;
  cursor: pointer;
  font-family: var(--font-body);
  color: var(--ink-3);
  transition: transform .2s var(--spring), background .14s;
}
.ub-btn:hover { background: var(--bg-3); }
.ub-btn:active { transform: scale(.93); }
.ub-btn.active { color: #fff; }
.ub-btn-pill {
  position: absolute; inset: 0; border-radius: 15px;
  background: var(--gold-grad);
  box-shadow: 0 3px 0 var(--gold-deep);
}
.ub-btn-icon { position: relative; z-index: 1; display: grid; place-items: center; }
.ub-btn-label { position: relative; z-index: 1; font-size: 9.5px; font-weight: 600; }

.ub-badge {
  position: absolute; top: 3px; right: 7px; z-index: 2;
  min-width: 18px; height: 18px; padding: 0 5px;
  display: grid; place-items: center;
  border-radius: 999px;
  background: var(--crimson); color: #fff;
  font-family: var(--font-mono); font-weight: 700; font-size: 10.5px; line-height: 1;
  border: 2px solid var(--bg-2);
  animation: badgePulse 2.6s var(--spring) infinite;
}

.ub-divider {
  width: 1px; height: 30px; background: var(--line); margin: 0 3px;
}

.ub-profile-btn {
  position: relative;
  display: block; width: 44px; height: 44px; padding: 0;
  border: 2px solid transparent; border-radius: 13px;
  background: linear-gradient(150deg, var(--gold-bright), var(--amethyst));
  color: #fff; cursor: pointer;
  font-family: var(--font-display); font-weight: 700; font-size: 15px;
  box-shadow: var(--shadow-raised);
  transition: transform .25s var(--spring), border-color .15s;
}
.ub-profile-btn:hover { transform: translateY(-2px); }
.ub-profile-btn:active { transform: scale(.95); }
.ub-profile-btn.open { border-color: var(--gold-deep); }
.ub-profile-btn .ub-avatar-wrap { display: grid; place-items: center; width: 100%; height: 100%; }

.popover-panel {
  position: absolute; bottom: calc(100% + 14px); z-index: 41;
  border-radius: var(--radius-lg);
  background: var(--bg-2);
  border: 1px solid var(--line);
  box-shadow: var(--shadow-pop);
  overflow: hidden;
  animation: popUp .22s var(--spring) both;
}
.popover-panel.anchor-left { left: 0; }
.popover-panel.anchor-right { right: 0; }
.popover-panel.anchor-center { left: 50%; transform: translateX(-50%); }

.pop-head {
  display: flex; align-items: center; justify-content: space-between;
  padding: 14px 16px; border-bottom: 1px solid var(--line-soft);
}
.pop-title { font-family: var(--font-head); font-weight: 700; font-size: 14.5px; }
.pop-action {
  font-family: var(--font-display); font-weight: 600; font-size: 11.5px;
  color: var(--gold-bright); cursor: pointer; background: none; border: none;
}
.pop-empty { padding: 24px 16px; text-align: center; font-size: 12.5px; color: var(--ink-3); }
.pop-foot {
  padding: 11px; border-top: 1px solid var(--line-soft); text-align: center;
  font-family: var(--font-display); font-weight: 600; font-size: 12.5px;
  color: var(--gold-bright); cursor: pointer; background: none; border: none; width: 100%;
}
.pop-search-field {
  display: flex; align-items: center; gap: 9px;
  padding: 9px 12px; margin: 14px;
  border-radius: var(--radius-sm);
  background: var(--bg-3); border: 1px solid var(--line);
}
.pop-search-field input {
  flex: 1; border: none; background: transparent; outline: none;
  font-family: var(--font-body); font-size: 13.5px; color: var(--ink);
}
```

- [ ] **Step 3: Import it in `index.css`**

```bash
cd PiKaOs-Core/Frontend/src/styles
```

Add this line next to the existing `@import './login.css';`:

```css
@import './shell.css';
```

- [ ] **Step 4: Build to confirm the CSS compiles**

```bash
cd PiKaOs-Core/Frontend && docker compose -p pikaos -f deploy/docker-compose.generated.yml exec frontend npm run build
```
Expected: `vite build` finishes with no CSS parse errors (unused-selector warnings, if any, are fine — nothing consumes these classes yet until Task 5).

- [ ] **Step 5: Commit**

```bash
git add PiKaOs-Core/Frontend/src/styles/shell.css PiKaOs-Core/Frontend/src/styles/index.css
git commit -m "feat(styles): add shell.css for the BottomUtilityBar"
```

---

### Task 5: `BottomUtilityBar` component

**Files:**
- Create: `PiKaOs-Core/Frontend/src/components/ui/BottomUtilityBar.jsx`

**Interfaces:**
- Consumes: `UtilityBarButton` from Task 2 (`import { UtilityBarButton } from './UtilityBarButton.jsx'`), `PopoverPanel` from Task 3 (`import { PopoverPanel } from './PopoverPanel.jsx'`), CSS classes from Task 4.
- Produces: `export function BottomUtilityBar({ t, route, onHome, me, theme, onToggleTheme, onSignOut, notifications = [], chatThreads = [], onSearch, onAdd, showLabels = false })`.
  - `t` — the bound translator from `makeT()` (`App.jsx`'s existing `t`).
  - `route` — current app route string (`App.jsx`'s `route` state) — used only to decide whether the Home button starts "active" on first render; the component still owns its own click-driven `active` state afterward per the spec ("mirrors the DC Component class").
  - `onHome()` — navigates home (`App.jsx`'s `() => go('me')`).
  - `me` — the real current-user object from `App.jsx`'s `me` (shape: `{ avatar, display, username, ... }` from `data/data-users.jsx` — `avatar` is an emoji string, not initials).
  - `theme` / `onToggleTheme()` — `App.jsx`'s existing `theme` state + a callback that flips it (`() => setTheme(theme === 'pro' ? 'pro-dark' : 'pro')`).
  - `onSignOut()` — `App.jsx`'s `auth.logout`.
  - `notifications` / `chatThreads` — arrays of `{ id, title, time }`; empty by default (no real source exists yet — ships stubbed per spec).
  - `onSearch(query)` — called on Enter in the search field; optional, no-op if omitted.
  - `onAdd()` — called when the Add button is clicked; `App.jsx` wires this to `Sys.openBuilder()` (the existing "create new agent" flow — a real target, not a stub, since it already exists).

- [ ] **Step 1: Write the component**

```jsx
import React, { useState } from 'react';
import { UtilityBarButton } from './UtilityBarButton.jsx';
import { PopoverPanel } from './PopoverPanel.jsx';

const isAvImg = (a) => typeof a === 'string' && (a.startsWith('data:') || a.startsWith('http'));

const ICONS = {
  home: <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M4 11.5 12 4.5l8 7"/><path d="M6 9.8V19.5h12V9.8"/><path d="M10 19.5V14h4v5.5"/></svg>,
  search: <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="6.2"/><path d="m20 20-3.8-3.8"/></svg>,
  notifications: <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M18 9.5a6 6 0 1 0-12 0c0 4.8-2 6.3-2 6.3h16s-2-1.5-2-6.3z"/><path d="M10.2 19.2a2 2 0 0 0 3.6 0"/></svg>,
  add: <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>,
  chat: <svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6.5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2.5V20l4-3.5H18a2 2 0 0 0 2-2v-8z"/></svg>,
};

/**
 * Global floating utility bar — home/search/notifications/add/chat/profile.
 * Separate from the nested content-nav (data-nav.jsx/Sidebar in App.jsx),
 * which stays its own component per the shell/nav design (they're
 * fundamentally different shapes: flat 6-slot bar vs 3-level tree).
 */
export function BottomUtilityBar({
  t, route, onHome, me, theme, onToggleTheme, onSignOut,
  notifications = [], chatThreads = [], onSearch, onAdd, showLabels = false,
}) {
  const [active, setActive] = useState(route === 'me' ? 'home' : null);
  const [openPop, setOpenPop] = useState(null);
  const [query, setQuery] = useState('');
  const [clearedNotif, setClearedNotif] = useState(false);
  const [clearedChat, setClearedChat] = useState(false);

  const go = (tab, fn) => { setActive(tab); setOpenPop(null); fn && fn(); };
  const togglePop = (tab) => {
    setOpenPop((p) => (p === tab ? null : tab));
    setActive(tab);
    if (tab === 'notifications') setClearedNotif(true);
    if (tab === 'chat') setClearedChat(true);
  };
  const closePop = () => setOpenPop(null);

  const notifCount = clearedNotif ? 0 : notifications.length;
  const chatCount = clearedChat ? 0 : chatThreads.length;

  const submitSearch = (e) => {
    if (e.key !== 'Enter') return;
    onSearch && onSearch(query);
  };

  return (
    <>
      {openPop && <div className="utility-bar-overlay" onClick={closePop} />}
      <div className="utility-bar">
        <UtilityBarButton
          icon={ICONS.home} title={t('utilitybar.home')} label={t('utilitybar.home')}
          showLabel={showLabels} active={active === 'home'}
          onClick={() => go('home', onHome)}
        />

        <div style={{ position: 'relative' }}>
          <UtilityBarButton
            icon={ICONS.search} title={t('utilitybar.search')} label={t('utilitybar.search')}
            showLabel={showLabels} active={active === 'search'}
            onClick={() => togglePop('search')}
          />
          <PopoverPanel open={openPop === 'search'} onClose={closePop} anchor="left" width={300}>
            <div className="pop-search-field">
              <input
                type="text" autoFocus value={query}
                placeholder={t('utilitybar.search.placeholder')}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={submitSearch}
              />
            </div>
          </PopoverPanel>
        </div>

        <div style={{ position: 'relative' }}>
          <UtilityBarButton
            icon={ICONS.notifications} title={t('utilitybar.notifications')} label={t('utilitybar.notifications')}
            showLabel={showLabels} active={active === 'notifications'} badge={notifCount}
            onClick={() => togglePop('notifications')}
          />
          <PopoverPanel open={openPop === 'notifications'} onClose={closePop} anchor="center" width={320}>
            <div className="pop-head">
              <span className="pop-title">{t('utilitybar.notifications.title')}</span>
              <button type="button" className="pop-action">{t('utilitybar.notifications.readAll')}</button>
            </div>
            {notifications.length === 0
              ? <div className="pop-empty">{t('utilitybar.notifications.empty')}</div>
              : <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                  {notifications.map((n) => (
                    <div key={n.id} className="pop-head" style={{ borderBottom: '1px solid var(--line-soft)' }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{n.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{n.time}</div>
                    </div>
                  ))}
                </div>}
            <button type="button" className="pop-foot">{t('utilitybar.notifications.viewAll')}</button>
          </PopoverPanel>
        </div>

        <UtilityBarButton
          icon={ICONS.add} title={t('utilitybar.add.title')} label={t('utilitybar.add')}
          showLabel={showLabels} active={active === 'add'}
          onClick={() => go('add', onAdd)}
        />

        <div style={{ position: 'relative' }}>
          <UtilityBarButton
            icon={ICONS.chat} title={t('utilitybar.chat')} label={t('utilitybar.chat')}
            showLabel={showLabels} active={active === 'chat'} badge={chatCount}
            onClick={() => togglePop('chat')}
          />
          <PopoverPanel open={openPop === 'chat'} onClose={closePop} anchor="right" width={320}>
            <div className="pop-head">
              <span className="pop-title">{t('utilitybar.chat.title')}</span>
              <button type="button" className="pop-action">{t('utilitybar.chat.compose')}</button>
            </div>
            {chatThreads.length === 0
              ? <div className="pop-empty">{t('utilitybar.chat.empty')}</div>
              : <div style={{ maxHeight: 260, overflowY: 'auto' }}>
                  {chatThreads.map((c) => (
                    <div key={c.id} className="pop-head" style={{ borderBottom: '1px solid var(--line-soft)' }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{c.title}</div>
                      <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>{c.time}</div>
                    </div>
                  ))}
                </div>}
            <button type="button" className="pop-foot">{t('utilitybar.chat.open')}</button>
          </PopoverPanel>
        </div>

        <div className="ub-divider" />

        <div style={{ position: 'relative' }}>
          <button
            type="button"
            className={'ub-profile-btn' + (openPop === 'profile' ? ' open' : '')}
            title={t('utilitybar.profile')}
            onClick={() => togglePop('profile')}
          >
            <span className="ub-avatar-wrap">
              {isAvImg(me.avatar) ? <img src={me.avatar} alt="" style={{ width: '100%', height: '100%', borderRadius: 11, objectFit: 'cover' }} /> : <span>{me.avatar || '🧙'}</span>}
            </span>
          </button>
          <PopoverPanel open={openPop === 'profile'} onClose={closePop} anchor="right" width={276}>
            <div className="pop-head" style={{ background: 'var(--raised-grad)' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontFamily: 'var(--font-head)', fontWeight: 700, fontSize: 15 }}>{me.display}</div>
                <div style={{ fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--ink-3)' }}>@{me.username}</div>
              </div>
            </div>
            <div style={{ padding: 8 }}>
              <button type="button" className="pop-foot" style={{ borderTop: 'none', textAlign: 'left' }} onClick={closePop}>
                {t('utilitybar.profile.viewProfile')}
              </button>
              <button type="button" className="pop-foot" style={{ borderTop: 'none', textAlign: 'left' }} onClick={closePop}>
                {t('utilitybar.profile.settings')}
              </button>
              <button type="button" className="pop-foot" style={{ borderTop: 'none', textAlign: 'left' }} onClick={onToggleTheme}>
                {theme === 'pro' ? t('theme.night') : t('theme.day')}
              </button>
              <button type="button" className="pop-foot" style={{ borderTop: 'none', textAlign: 'left', color: 'var(--crimson)' }} onClick={() => { closePop(); onSignOut && onSignOut(); }}>
                {t('profile.signOut')}
              </button>
            </div>
          </PopoverPanel>
        </div>
      </div>
    </>
  );
}
```

- [ ] **Step 2: Lint**

```bash
cd PiKaOs-Core/Frontend && docker compose -p pikaos -f deploy/docker-compose.generated.yml exec frontend npm run lint
```
Expected: no new errors.

- [ ] **Step 3: Build**

```bash
cd PiKaOs-Core/Frontend && docker compose -p pikaos -f deploy/docker-compose.generated.yml exec frontend npm run build
```
Expected: succeeds (component isn't imported anywhere yet, so this only proves it's syntactically/type-valid on its own).

- [ ] **Step 4: Commit**

```bash
git add PiKaOs-Core/Frontend/src/components/ui/BottomUtilityBar.jsx
git commit -m "feat(ui): add BottomUtilityBar component"
```

---

### Task 6: Wire `BottomUtilityBar` into `App.jsx`

**Files:**
- Modify: `PiKaOs-Core/Frontend/src/App.jsx:29` (imports), `PiKaOs-Core/Frontend/src/App.jsx:638-660` (the returned JSX shell)

**Interfaces:**
- Consumes: `BottomUtilityBar` from Task 5. Real values already computed earlier in `App()`: `t`, `route`, `me`, `theme`, `setTheme`, `auth.logout`, `Sys.openBuilder`, `go`.
- Produces: nothing new — this is the integration point; no later task depends on it.

- [ ] **Step 1: Add the import**

In `App.jsx`, add this line next to the other `./components/ui/*` import (line 24, `import { Menu } from './components/ui/Dropdown.jsx';`):

```js
import { BottomUtilityBar } from './components/ui/BottomUtilityBar.jsx';
```

- [ ] **Step 2: Render it in the app shell**

In `App.jsx`, the return block currently reads (lines 638-660):

```jsx
  return (
    <ToastProvider>
    <div className="app" key={lex}>
      <Sidebar route={route} go={go} t={t} can={can} nav={navCfg} />
      <div className="main">
        <Topbar route={route} theme={theme} setTheme={setTheme} user={username} language={language} t={t}
          me={me} roles={roles} onSignOut={auth.logout}
          onSaveProfile={(u) => setUsers(prev => prev.map(x => x.id === currentUserId ? { ...x, ...u } : x))}
          viewAs={realCan("user.manage") ? { users, roles, realMe, current: viewingAs, onPick: setViewAs, T, t } : null} />
        {viewingAs && <ViewAsBanner user={viewingAs} roles={roles} onExit={() => setViewAs(null)} t={t} T={T} />}
        <div className="content">{screen}</div>
      </div>
      {userForm && <UserForm Sys={Sys} initial={userForm.id ? userForm : null} onClose={() => setUserForm(null)} />}
      {agentSel && <AgentDrawer a={agentSel} onClose={() => setAgentSel(null)} t={t}
        onEdit={(c) => { setAgentSel(null); setBuilder(c); }}
        onDelete={async (id) => { const c = chars.find(x => x.id === id); if (c && c.locked) { await window.uiAlert({ title: t("ad.cantDelTitle"), message: t("ad.ceoLockedAlert") }); return; } setAgentSel(null); S.remove(id); }} />}
      {questSel && <QuestDrawer q={questSel} onClose={() => setQuestSel(null)} t={t} onAgent={(a) => { setQuestSel(null); setAgentSel(a); }} />}
      {builder && <CharacterBuilder initial={builder.id ? builder : null} onSave={saveChar} onClose={() => setBuilder(null)} can={can} archived={archived} t={t} onRestore={(id) => { S.restore(id); setBuilder(null); }} />}
      <UIModalHost />
      <UILoadingHost />
    </div>
    </ToastProvider>
  );
```

Replace it with (adds `<BottomUtilityBar>` right before `<UIModalHost />`, so it renders above the drawers but its own popovers still stack correctly via `z-index`):

```jsx
  return (
    <ToastProvider>
    <div className="app" key={lex}>
      <Sidebar route={route} go={go} t={t} can={can} nav={navCfg} />
      <div className="main">
        <Topbar route={route} theme={theme} setTheme={setTheme} user={username} language={language} t={t}
          me={me} roles={roles} onSignOut={auth.logout}
          onSaveProfile={(u) => setUsers(prev => prev.map(x => x.id === currentUserId ? { ...x, ...u } : x))}
          viewAs={realCan("user.manage") ? { users, roles, realMe, current: viewingAs, onPick: setViewAs, T, t } : null} />
        {viewingAs && <ViewAsBanner user={viewingAs} roles={roles} onExit={() => setViewAs(null)} t={t} T={T} />}
        <div className="content">{screen}</div>
      </div>
      {userForm && <UserForm Sys={Sys} initial={userForm.id ? userForm : null} onClose={() => setUserForm(null)} />}
      {agentSel && <AgentDrawer a={agentSel} onClose={() => setAgentSel(null)} t={t}
        onEdit={(c) => { setAgentSel(null); setBuilder(c); }}
        onDelete={async (id) => { const c = chars.find(x => x.id === id); if (c && c.locked) { await window.uiAlert({ title: t("ad.cantDelTitle"), message: t("ad.ceoLockedAlert") }); return; } setAgentSel(null); S.remove(id); }} />}
      {questSel && <QuestDrawer q={questSel} onClose={() => setQuestSel(null)} t={t} onAgent={(a) => { setQuestSel(null); setAgentSel(a); }} />}
      {builder && <CharacterBuilder initial={builder.id ? builder : null} onSave={saveChar} onClose={() => setBuilder(null)} can={can} archived={archived} t={t} onRestore={(id) => { S.restore(id); setBuilder(null); }} />}
      <BottomUtilityBar
        t={t} route={route} onHome={() => go("me")} me={me}
        theme={theme} onToggleTheme={() => setTheme(theme === "pro" ? "pro-dark" : "pro")}
        onSignOut={auth.logout}
        notifications={[]} chatThreads={[]}
        onAdd={() => Sys.openBuilder()}
      />
      <UIModalHost />
      <UILoadingHost />
    </div>
    </ToastProvider>
  );
```

Note: `notifications`/`chatThreads` are passed as empty arrays — no real feed exists yet (`components/ui/Notifications.jsx` is an unwired demo, `lib/notify.jsx` is an unrelated task-bell, no chat-gateway plugin is integrated in the frontend). `onSearch` is omitted (defaults to no-op in `BottomUtilityBar`) — no confirmed live search backend behind the existing `route === "search"` toast in `go()`. `onAdd` wires to `Sys.openBuilder()`, the existing "create new agent" flow — a real target already in the codebase, not a stub.

- [ ] **Step 3: Build**

```bash
cd PiKaOs-Core/Frontend && docker compose -p pikaos -f deploy/docker-compose.generated.yml exec frontend npm run build
```
Expected: succeeds with no errors.

- [ ] **Step 4: Manual verification (ask the user first before starting the dev server)**

Ask: "Want me to run the dev server to verify this visually, or will you run it yourself?" If you run it:
```bash
./start.sh
```
Then open the app, sign in via the FirstRun `#firstrun` hash flow (per the Track B session note — `/api/setup/*` doesn't exist on this branch yet), and confirm:
- The pill bar appears fixed at the bottom-center of the screen.
- Clicking Search/Notifications/Chat/Profile opens a popover above the bar; clicking outside or pressing Escape closes it.
- Clicking Home navigates to the dashboard and highlights the Home button gold.
- Clicking Add opens the character builder modal.
- The profile popover shows the real signed-in user's name/username/avatar, and the theme toggle button actually flips light/dark.
- No console errors.

- [ ] **Step 5: Commit**

```bash
git add PiKaOs-Core/Frontend/src/App.jsx
git commit -m "feat(shell): wire BottomUtilityBar into the app shell"
```

---

### Task 7: Tokenize the one remaining hardcoded value in the nested content-nav CSS

**Files:**
- Modify: `PiKaOs-Core/Frontend/src/styles/styles.css:347-356` (`.nav-caret` rule)

**Scope note:** the spec asked for the nested content-nav (`Sidebar`/`NavNode` in `App.jsx:69-131`) to be "reskinned to the new token system." Auditing `styles.css:249-388` this session found the sidebar/nav rules **already** use `--line`, `--line-soft`, `--gold-grad`, `--gold-deep`, `--raised-grad`, and `--shadow-raised` throughout (`.sidebar`, `.nav-item.active`, `.nav-caret:hover` etc. — these tokens are shared with the DesignSync reference, confirmed byte-identical this session). The only literal that isn't already a custom property is `.nav-caret`'s `border-radius: 7px`. There is no DesignSync `.dc.html` reference file for the sidebar/content-nav specifically (only `Bottom Utility Bar.dc.html`, `Login.dc.html`, `Error Pages.dc.html`, `Icon System.dc.html` exist in the project) — so a fuller visual redesign has no source of truth to port from yet. This task is scoped to the one concrete, verifiable gap; a fuller content-nav reskin should wait for a dedicated DesignSync reference and its own follow-up task.

**Interfaces:** none — pure CSS value swap, no new selectors, no JSX changes.

- [ ] **Step 1: Confirm the current rule**

```bash
grep -n -A6 '^\.nav-caret {' PiKaOs-Core/Frontend/src/styles/styles.css
```
Expected: shows `border-radius: 7px;` as a literal inside `.nav-caret { ... }`.

- [ ] **Step 2: Swap it for the nearest token**

Change:
```css
.nav-caret {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; margin-left: 6px; flex: 0 0 22px;
  background: var(--bg-3); border: 1px solid var(--line); border-radius: 7px;
  color: var(--ink-2); cursor: pointer; font-size: 11px; line-height: 1;
  transform: rotate(-90deg);
  transition: transform .25s ease, background .15s ease, border-color .15s ease, color .15s ease;
}
```
to:
```css
.nav-caret {
  display: inline-flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; margin-left: 6px; flex: 0 0 22px;
  background: var(--bg-3); border: 1px solid var(--line); border-radius: var(--radius-sm);
  color: var(--ink-2); cursor: pointer; font-size: 11px; line-height: 1;
  transform: rotate(-90deg);
  transition: transform .25s ease, background .15s ease, border-color .15s ease, color .15s ease;
}
```
(`--radius-sm` is `10px` — close to the original `7px`, and consistent with how `.btn-sm`/`.dd` small controls elsewhere in this file already use `--radius-sm` for compact circular/pill controls.)

- [ ] **Step 3: Build**

```bash
cd PiKaOs-Core/Frontend && docker compose -p pikaos -f deploy/docker-compose.generated.yml exec frontend npm run build
```
Expected: succeeds, no CSS errors.

- [ ] **Step 4: Commit**

```bash
git add PiKaOs-Core/Frontend/src/styles/styles.css
git commit -m "style(nav): tokenize nav-caret border-radius"
```

---

## Deferred (explicitly out of scope for this plan)

- **Real notifications/chat data sources** — no backend endpoint or frontend state exists for either; wiring them is separate work once a source exists (chat ties into the parked chat-gateway plugin work — see memory `chat-gateway-plugin-plan`).
- **Real search** — no confirmed live search endpoint behind the existing `route === "search"` toast in `App.jsx`'s `go()`; needs its own investigation before wiring `onSearch`.
- **Full content-nav visual reskin** — no DesignSync reference file exists for the sidebar/nav yet (see Task 7's scope note); revisit once one is designed/fetched.
- **Backend `/api/setup/*`** — unrelated to this plan; the FirstRun gate (Track B, already committed) still 404s for real setup flows on this branch.
