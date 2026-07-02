# PiKaOs-Core Frontend — Shell/Nav/Theme reset (Phase 1 of the full UI rebuild)

**Date:** 2026-07-02
**Status:** approved design, not yet implemented
**Scope:** the shared structural layer every screen sits inside. Individual content screens
(Admin, Agents, Dashboard, Settings, etc.) are explicitly **out of scope** — later phases, each
gets its own spec once this shell lands.

## Why

User wants the whole PiKaOs-Core frontend UX/UI (and its logic) rebuilt from zero, following the
DesignSync reference project (`390db268-9d3b-4638-aec2-35d29aa67748`, "Claude WebGL mascot" —
see memory `ui-design-reference-mandatory`) as the only source of design truth going forward. A
full-app rewrite is too large for one spec/plan (dozens of screens); this is the **first
sub-project**: the shared shell (theme + global utility nav) that every later screen will sit
inside, chosen as the starting point because it's the one piece every other screen depends on.

## Design

### Nav architecture — utility bar is global-only, nested content nav stays separate
`Bottom Utility Bar.dc.html` (fetched from DesignSync) is a **flat** floating pill bar with 6
fixed slots (home / search / notifications / add / chat / profile). The current sidebar nav
(`Menu Manager`, `data-nav.jsx` + `screens-nav.jsx`) is **nested up to 3 levels**
(Main → Sub → Sub), admin-reorderable (drag, indent/outdent, hide, rename) — a fundamentally
different shape. Decision: **keep them separate, don't force one into the other.**
- The utility bar owns only what its name says: search, notifications, chat, profile
  (theme toggle + logout live in the profile popout), "add" (create-new entry point).
- The existing nested content nav (agents/quests/tools/settings/…) stays its own component,
  **reskinned** to the new token system — its drag/indent/rename/hide logic in `data-nav.jsx` is
  untouched, only its CSS changes.

### Components (new, in `src/screens/` unless noted)

Broken into small reusable pieces rather than one monolith, per this project's clean-code rule
(small single-purpose components, reused not duplicated):

- **`UtilityBarButton.jsx`** — one icon slot: icon, optional label (`showLabels` prop), optional
  badge count, active-pill background. Used 6× inside `BottomUtilityBar` (home/search/notif/add/
  chat/profile) — encapsulates the shared hover/active/pill-background behavior from the DC
  markup instead of repeating it per button.
- **`PopoverPanel.jsx`** — the generic popout shell (positioned card, `popUp` entrance animation,
  click-away overlay, close-on-outside-click). Used by the search/notifications/chat/profile
  popouts — the DC markup repeats this shell 4× nearly verbatim; one component + a `children`
  slot replaces that duplication.
- **`BottomUtilityBar.jsx`** — composes `UtilityBarButton` × 6 + `PopoverPanel` for the 4
  popouts. Owns `active`/`openPop` state (mirrors the DC `Component` class). Props:
  `{ t, language, onLang, auth, theme, onToggleTheme, notifications, chatThreads, onSearch, onAdd }`
  — real data in, no mock state inside the component itself.
- **Sidebar/content-nav reskin** — locate the current render site (trace during planning; likely
  in `App.jsx` or a dedicated nav-render component alongside `screens-nav.jsx`'s admin-config
  panel) and swap its CSS classes to the new tokens (`--shadow-raised`, `--radius-lg`,
  `--gold-grad`, `--line`) — no JSX/logic restructuring, styling only.
- **`src/styles/shell.css`** (new) — utility-bar keyframes (`barPop`, `popUp`, `badgePulse`) +
  layout rules, following the same "reuse existing tokens, add only what's missing" precedent as
  `login.css` (verified this session: DesignSync's own CSS tokens are byte-identical to
  `styles.css`'s `:root` — never import the `ds/pikaos-*.css` files, port markup instead).

### i18n — every string routes through the existing pack system, none hardcoded

The DC markup's Thai strings are placeholders, not final copy. `BottomUtilityBar` and its
children take the same `{ t, language, onLang }` contract every other screen already uses
(`makeT(lang, style)` in `src/lib/i18n.jsx`, the same pattern `FirstRun.jsx`/`App.jsx` follow).
New copy (button labels, popout headers, "read all", "compose new", etc.) goes into the i18n
pack files (`en-formal`/`th-formal` first, per CLAUDE.md §1.2), never inline strings. The
language toggle itself is not duplicated — the utility bar's profile menu reuses the app's
existing `onLang`/`pickLanguage` mechanism (no second, competing toggle).

### Data flow (real sources, not the DC mock — trace exact sources during planning)
- Profile: `auth` (from `useAuth()`), avatar initials/color from existing user data.
- Notifications / chat: needs tracing — check if a real source exists (`data-workflows.jsx`?
  a backend endpoint?) or if these ship as stubbed/empty first (DESIGN-SPEC.md's own precedent:
  "complete UI, submit stubbed" is acceptable, matching how Compare/RedirectMap-style contact
  forms were handled).
- Theme: reuse the existing theme-toggle mechanism (need to confirm where `pro`/`pro-dark` is
  currently read/set — likely `Sys`/global config per `App.jsx`'s `Sys` object).
- Search: stub first unless a real search already exists to wire to.

## Not deciding now (flag for the implementation plan)
- Exact current sidebar/content-nav render location — trace, don't guess, during planning.
- Whether "add" and "chat" wire to real actions immediately or ship stubbed.
- Icon set: this bar's icons are inline SVG per the DC source (not the DS "emoji as icon"
  convention from `DESIGN-SPEC.md` §7.6 — that convention applies to *content* icons elsewhere,
  `Icon System.dc.html` is the reference when this bar's SVGs don't cover a need).

## Non-goals (this spec)
- Any individual content screen (Admin/Agents/Dashboard/etc.) — later phases, own specs.
- Backend changes — this is frontend-only.
- Production/self-host deploy (separate, already-parked spec).
