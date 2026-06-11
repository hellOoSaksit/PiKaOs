# PiKaOs Design System

> The design guide for **PiKaOs — Agent Workspace** (Vite + React, Thai-first UI).
> This folder documents the brand's foundations and components so anyone can build on-brand
> screens, mocks and slides. Open `PiKaOs Design System.html` for the live, theme-switchable specimen.

**Source of truth:** the running app under **`Frontend/src/`** (all `src/…` paths below are
relative to `Frontend/`). Tokens live in
`src/styles/styles.css`; the component kit in `src/components/ui/`. The CSS here (`css/`) is a
verbatim copy of those files so the specimens render in production fidelity.

---

## 1. What PiKaOs is

A multi-agent "agent-ops" workspace framed with a light RPG flavor — you run a team of AI
**agents** through rooms, quests, tools and a knowledge codex. The product is calm and
professional first; the game flavor is a thin, optional vocabulary layer (see the app's i18n
system), never loud chrome.

Two themes only: **`pro`** (light, default) and **`pro-dark`** (night). There is no third theme.

---

## 2. Visual foundations

**Surfaces.** Cool neutral greys do all the structural work. Light theme stacks
`--bg-1` (app) → `--bg-2` (cards, pure white) → `--bg-3/4` (insets, chips). Night theme is a
near-black `#0c0e12` ladder. Hairline borders use `--line` / `--line-soft`; never heavy rules.

**One accent.** A single confident **indigo** carries every primary action, active nav item,
focus ring and key stat. For historical reasons the token family is named `--gold`
(`--gold` `#4361ee`, `--gold-bright`, `--gold-deep`, `--gold-glow`). Treat it as the *only* brand
color — do not introduce new hues for emphasis.

**Semantic colors** are used sparingly and only for meaning: `--emerald` (ok/online),
`--crimson` (danger), `--amber` (warning **only**), `--sapphire` (info), `--amethyst` (research),
`--ruby`. All states are rendered as tinted chips via `color-mix` (≈12% bg / ≈40% border), not
solid fills.

**Corners & elevation.** Radii `--radius-sm 6px` · `--radius 9px` · `--radius-lg 14px`.
Three-step shadow ladder: `--shadow-raised` (chips/tiles) → `--shadow-panel` (cards) →
`--shadow-pop` (modals/menus). Shadows are soft and low-contrast; in light theme they're barely
there.

**Motion — "physical buttons."** This is the signature feel. Buttons carry a solid 3D base
shadow (`0 3px 0 var(--gold-deep)`), lift `-1px` on hover, and **sink + shrink** on press
(`translateY(3px) scale(.985)`), springing back. Two shared easings:
`--spring: cubic-bezier(.34,1.9,.6,1)` (release overshoot) and
`--spring-soft: cubic-bezier(.34,1.4,.64,1)` (gentle). Everything is wrapped in
`@media (prefers-reduced-motion: no-preference)`.

**Hover / press states.** Hover = subtle surface lift (`--bg-2` → `--bg-3`) + 1px raise; press =
sink + `scale(.985)` + shorter transition. Focus = `0 0 0 3px var(--gold-glow)` ring. No opacity
fades for interaction — use the spring.

**Layout.** App shell is a fixed `256px` sidebar + fluid main with a `62px` topbar. Content pads
at `34px 40px`, max-width ~`1500px`. Cards are `--radius-lg`, 1px `--line` border,
`--shadow-panel`, white body with `16px` padding.

**Backgrounds.** Flat token colors — no gradients on surfaces, no imagery, no texture
(`--paper-texture: none`). The only gradients are the button fills (`--gold-grad`) and the 3D
letter shadow stack.

---

## 3. Typography

Three families, loaded from Google Fonts:

| Role | Family | Use |
|---|---|---|
| Display / brand | **Mitr** (700) | 3D cartoon letters, hero/brand only |
| UI (everything) | **IBM Plex Sans Thai** (300–700) | headings, body, labels — Thai-first |
| Mono / meta | **JetBrains Mono** (400–600) | kickers, code, IDs, tabular numbers |

Helpers (from `styles.css`): `.display` (700, +.04em), `.kicker` (mono, uppercase, +.2em,
10.5px), `.mono` (tabular-nums), `.thai-serif`. Both languages share the same families — never
swap a different face for Thai vs English. Body copy is 14px / line-height 1.65.

---

## 4. The 3D letters (brand signature)

The PiKaOs wordmark is built from `.ltr` spans: Mitr 700, white `--letter-face`,
`-webkit-text-stroke` in `--gold-deep` with `paint-order: stroke fill` (outline *behind* the
fill, so no seams), plus a stack of hard offset shadows ending in a soft `--gold-glow`. Optional
entrance animations `.ltr.drop` (gravity drop + squash) and `.ltr.jelly`. Use it for brand
moments only — not as a heading style.

---

## 5. Iconography

- **Emoji as icons.** The app uses ordinary Unicode **emoji** as its icon set throughout
  (🔌 🧰 🎖️ 🏠 📤 🗂 ✨ 👔 …). This is intentional and on-brand — do not swap in an SVG icon
  library. Render at the surrounding font size; tone them with opacity (`.85`) where they sit in
  nav/labels.
- **Mono glyphs** (▾ ✓ ✕ ＋ ↗ ●) handle structural affordances (carets, checks, close, add).
- No icon font, no SVG sprite, no PNG icon set. The only inline SVGs are tiny control marks
  (e.g. the checkbox tick).

---

## 6. Content & tone

- Thai-first, professional, friendly. UI strings come from `src/data/i18n/*.json` (key-based) —
  never hardcode copy.
- Five vocabulary styles per the i18n packs: `en-formal` (master), `th-formal`,
  plus flavors `th-fantasy` / `en-adventurer` / `th-wuxia` that re-skin nouns
  (agent↔adventurer↔จอมยุทธ์, task↔quest↔ภารกิจ, token↔mana↔ลมปราณ). Default = `en-formal`.
- Sentences are short and concrete. Kickers are uppercase mono. Numbers are mono + tabular.

---

## 7. Components

Real primitives in `src/components/ui/` (each `<Name>.jsx` + sibling export in `index.js`):

`Button · Spinner · Checkbox · Switch · Segmented · Badge · Tooltip · Progress · Modal · Toast ·
StatusPopup · Dropdown (Select / Menu / MultiSelect) · Tags · TextFormatToolbar · Highlight ·
Input · DatePicker · SoftDeleteRow · Todo · Search · Filter · LoadingPopup · Notifications ·
Letters3D · SaveBar`

App-level primitives in `src/components/components.jsx`:
`Btn · Panel · PageHead · Avatar · Badge · StatTile · Empty · HelpNote · Meter · RankGem …`

Key classes shown in the specimen: `.btn` (`.btn-gold/.btn-ghost/.btn-danger`, `.btn-sm`),
`.badge` (`.on/.busy/.idle/.warn/.info/.magic`), `.rank` (S–D), `.bf-input` + `.bf-label`,
`.pk-switch`, `.pk-check`, `.seg` + `.seg-btn`, `.meter` (`.mana/.xp/.hp`), `.stat-tile`,
`.panel` + `.panel-head`, `.avatar`.

> The app's own live component library (Settings → "open component library",
> `src/screens/screens-library.jsx`) renders **every** kit component natively — use it as the
> exhaustive reference.

---

## 8. Index / manifest

This guide ships inside the repo's `design-system/` folder, which holds every static
design deliverable (the app itself is in `Frontend/` — see the project
[`README.md`](../../README.md)).

```
design-system/
  styles.css                  ← DS CSS entry: @import → Design System/css/* (link this one file)
  PiKaOs App Preview.html      standalone static previews (siblings)
  Login Preview.html
  PiKaOs Components.html
  PiKaOs 3D Letters.html
  previews/  screenshots/  uploads/    image artifacts
  Design System/
    PiKaOs Design System.html ← live, theme-switchable specimen (open this)
    README.md                 ← this guide
    SKILL.md                  ← pikaos-design skill manifest
    cards/                    ← small specimen cards (colors, type, spacing, components)
    css/
      pikaos-kit.css          ← copy of src/components/ui/ui-kit.css (kit components)
      pikaos-core.css         ← copy of src/styles/styles.css (tokens + primitives)
      pikaos-components.css    ← copy of src/styles/components.css (forms, page chrome)
```

Fonts load from Google Fonts (Mitr / IBM Plex Sans Thai / JetBrains Mono) — same import the app
uses. Link `Design System/css/pikaos-kit.css`, then `pikaos-core.css`, then `pikaos-components.css`
(this order matters: app rules must win on shared class names) — or just link the parent
`design-system/styles.css`, which `@import`s all three in the right order.

---

## Caveats

- The CSS files are **copies** — if `src/styles` or `src/components/ui` changes, re-copy them so
  the specimen stays in sync.
- This is a focused foundations + components specimen, not the full compiler-indexed design-system
  project (no per-component `.d.ts`/`.prompt.md`, dsCards, or product UI-kit recreations yet).
