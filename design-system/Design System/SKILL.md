---
name: pikaos-design
description: Use this skill to generate well-branded interfaces and assets for PiKaOs (the Agent Workspace product), either for production or throwaway prototypes/mocks/slides. Contains essential design guidelines, color + type tokens, fonts, and the component kit for prototyping.
user-invocable: true
---

# PiKaOs design

Read `README.md` in this skill first — it is the full design guide (visual foundations,
typography, iconography, content tone, component index). Then explore the other files.

**What's here**
- `README.md` — the design guide + manifest.
- `PiKaOs Design System.html` — a live, theme-switchable specimen of every foundation + component.
- `css/` — the production CSS (tokens, primitives, kit components). Link in this order:
  `pikaos-kit.css` → `pikaos-core.css` → `pikaos-components.css`.
- `cards/` — small specimen cards (colors, type, spacing, components).
- `../styles.css` (parent `design-system/`) — `@import` entry that reaches every token + style
  file. The running app lives in `Frontend/`; see the project `README.md` / `CLAUDE.md`.

**How to use**
- For visual artifacts (slides, mocks, throwaway prototypes): copy the `css/` files out, link them
  + the Google Fonts (`Mitr`, `IBM Plex Sans Thai`, `JetBrains Mono`), set `data-theme="pro"` (or
  `"pro-dark"`) on `<html>`, and build with the real classes (`.btn .btn-gold`, `.badge`, `.panel`,
  `.bf-input`, `.pk-switch`, `.seg`, `.meter`, `.stat-tile`, `.rank`, `.ltr` …). Produce static HTML
  for the user to view.
- For production code: read the rules here and follow the app conventions in the repo
  (`src/components/ui`, key-based i18n via `src/data/i18n/*.json` — never hardcode UI strings).

**Non-negotiables**
- One accent only — indigo (`--gold` family). No new hues for emphasis.
- Two themes only: `pro` (light) / `pro-dark` (night).
- Emoji are the icon set — don't swap in an SVG icon library.
- Buttons are "physical": 3D base shadow, sink + spring on press. Wrap motion in
  `@media (prefers-reduced-motion: no-preference)`.
- Thai-first copy; both languages share the same font families.

If invoked without guidance, ask the user what they want to build, ask a few questions, then act as
an expert PiKaOs designer who outputs HTML artifacts **or** production code as needed.
