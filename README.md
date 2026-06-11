# PiKaOs — Agent Workspace (Vite + React)

A multi-agent “agent-ops” workspace, framed with a light RPG flavor, built in the
**PiKaOs design language**: calm neutral surfaces + **one indigo accent**, springy
“physical-button” motion, and 3D **Mitr** cartoon letters. Two themes only —
`pro` (light) and `pro-dark` (night). Thai-first UI.

**Created by saksit chuenmaiwaiy.**

> **Doc set.** This README is the front door. For the rules you must follow while
> coding, read [`CLAUDE.md`](CLAUDE.md). For the full visual foundations (color
> governance, type scale, motion, 3D letters, component specimen), read the design
> guide at [`design-system/Design System/README.md`](design-system/Design%20System/README.md).
> All three are derived from the original PiKaOs design-system reference and are
> kept in sync with `src/` (the single source of truth).

---

## 1. Run

**To run the app, double-click [`start.bat`](start.bat)** at the repo root. It first
makes sure **Docker** is running — if Docker won't start it runs
[`fix-docker.bat`](fix-docker.bat) automatically (needs admin/UAC) and waits — then
opens Windows Terminal tabs (Frontend dev · Docker · Shell), installs deps if missing,
and starts the dev server on http://localhost:5173. This is the **only** sanctioned way
to run/serve the app — do not launch the dev server through a background `cmd`
(see [`CLAUDE.md` §0](CLAUDE.md)).

The app lives in [`Frontend/`](Frontend). For one-off, non-serving tasks (install, a
compile check) run npm from there:

```bash
cd Frontend
npm install
npm run build    # → Frontend/dist/  (compile check only — does not serve)
```

Real Vite + ES modules. React/ReactDOM come from `npm` (no CDN). `localStorage`
keys (`guildos.*`, `guild-theme`) are kept as-is so previously saved
rooms/agents/settings still load.

---

## 2. Repository layout

The repo is split into **the app** (`Frontend/`, what Vite builds) and **the design
artifacts** (`design-system/`, static deliverables — not part of the build).
Project docs (`README.md`, `CLAUDE.md`) sit at the root.

```
PiKaOs/
  README.md             ← you are here (project front door)
  CLAUDE.md             dev rules (component-first, i18n, file map, theme)
  Frontend/             the Vite + React app:
    index.html            Vite entry — loads /src/main.jsx, imports the 3 web fonts
    vite.config.js        @vitejs/plugin-react · port 5173 · build → Frontend/dist/
    package.json
    public/assets/        served at /assets/* — CEO pixel sprite sheets
    src/                  the application (see §3)
  design-system/        design deliverables — NOT imported by the app:
    Design System/        live specimen (PiKaOs Design System.html) + css/ + cards/ + guide
    styles.css            DS CSS entry (@import → Design System/css/*)
    PiKaOs App Preview.html, Login Preview.html, PiKaOs Components.html,
    PiKaOs 3D Letters.html      standalone static previews
    previews/  screenshots/  uploads/   image artifacts
```

### 3. Inside `Frontend/src/`

(paths below are relative to `Frontend/`)

```
main.jsx              ReactDOM root, theme restore, imports modules in dependency order
App.jsx               shell: theme, login gate, sidebar (3D-letter brand), topbar, routing
screens/              one file per route — main · secondary · extra · world · admin ·
                      builder · rbac · workflows · me · sitemap · tools · library
components/
  components.jsx       app primitives (Btn, Panel, PageHead, Avatar, Badge, StatTile, Empty …)
  ui/                  PiKaOs component kit (full set) + index.js barrel + ui-kit.css
lib/                  store, characters (+ TOOL_TYPES), sprites, rooms, world-life,
                     i18n, ui-modal, notify, tweaks, fx
data/                data, users, workflows, office + i18n/<lang>-<lexicon>.json (5 packs)
styles/              index.css @imports the rest in order (see below)
```

`styles/index.css` import order (tokens/base first, kit before app so app rules win):
`ui-kit.css` → `styles.css` → `components.css` → `world.css` → `kit-overlays.css`
→ `dashboard.css` → `rbac.css` → `fx.css`.

Cross-file symbols use real **named imports** (live bindings). A small `window.*`
runtime bus is preserved by design for shared mutable state and imperative helpers:
`__chars`, `__charById`, `uiConfirm` / `uiAlert` / `uiPrompt`, `uiLoading`, `makeT`,
`__guildGo`, `CharacterSprite` / `DocEditor`. `notify.jsx` and `tweaks-app.jsx`
mount their own React roots (`#notify-root`, `#tweaks-root`) on import; `fx.js` is
the vanilla post-mount shell helper.

---

## 4. Design language (summary)

The full spec lives in the **[design guide](design-system/Design%20System/README.md)** —
this is the short version. The non-negotiables:

- **One accent only** — indigo, the `--gold` token family (named for history):
  `--gold` / `--gold-bright` / `--gold-deep` / `--gold-glow`. Primary buttons,
  focus rings, links, active states, the 3D letters. Never a second decorative hue.
- **Functional colors = meaning only.** `--crimson` danger · `--emerald` success ·
  `--amber` warning · `--sapphire`/`--amethyst`/`--ruby` status tags. Otherwise
  neutral or `--gold`.
- **Surfaces are layered neutrals** (`--bg-1` → `--bg-2` → `--bg-3` → `--bg-4`),
  borders `--line` / `--line-soft`. Never tint panels with the accent.
- **Two themes** via `data-theme="pro" | "pro-dark"` on `<html>`. Use tokens only —
  dark mode then works for free. Never hardcode hex; derive new washes with
  `color-mix` from existing tokens.
- **Type:** `--font-toon` **Mitr** 700 (3D letters), `--font-body`
  **IBM Plex Sans Thai** (all UI), `--font-mono` **JetBrains Mono** (kickers/meta).
  Both languages share the same families.
- **Motion** — “physical buttons”: 3D base shadow, sink + spring on press, overshoot
  on release. Shared easings `--spring` / `--spring-soft`, all gated behind
  `@media (prefers-reduced-motion: no-preference)`.
- **3D letters** — one `<span class="ltr">` per glyph, stroke-behind-fill
  (`paint-order: stroke fill`) + stacked hard shadows; used by the login hero
  (`<Letters3D>`) and the sidebar brand.
- **Icons are emoji.** Don’t swap in an SVG icon library.

---

## 5. Component kit — `src/components/ui`

Imported via the barrel [`Frontend/src/components/ui/index.js`](Frontend/src/components/ui/index.js)
(pulls in `ui-kit.css` once). The full reference set is kept whether or not the app
currently uses each one:

`Button` · `Spinner` · `Checkbox` · `Switch` · `Segmented` · `Field` · `Badge` ·
`Tooltip` · `Progress` · `Modal` · `ToastProvider`/`useToast` · `StatusPopup` ·
`Select`/`Menu`/`MultiSelect` · `Tags` · `TextFormatToolbar` · `Highlight` ·
`DatePicker` · `SoftDeleteRow` · `Todo` · `Search` · `Filter` · `LoadingPopup` ·
`Notifications` · `Letters3D` · `SaveBar`.

```jsx
import { Button, Badge, Letters3D, useToast } from './components/ui';
```

**Component-first is a hard rule** — reuse → extend → create-new-completely, and
never hand-roll `<select>`/dropdown/modal/toast/switch/datepicker in screens. See
[`CLAUDE.md` §1](CLAUDE.md) for the full decision order and pre-ship checklist. The
live component library (Settings → “open component library”,
`Frontend/src/screens/screens-library.jsx`) renders every kit component natively.

Destructive actions follow the canonical pattern: 🗑 → countdown confirm → **soft
delete** → 5s undo → permanent. Status feedback uses the five `StatusPopup` presets
(success / error / warning / info / confirm).

---

## 6. Feature modules — หลักการทำงาน

**Login / Auth.** Full PiKaOs auth flow: live validation (blur + submit), SHOW/HIDE
password, forgot-password → “Check your inbox”, error banner (`wrongpw` to demo),
spinner while signing in. Success enters the workspace; reload lands back on login.

**Agent builder.** Profiles (load/save โปรไฟล์), sprite cards, position/หน้าที่,
model/API. สถานะเริ่มต้นถูกล็อกเป็น “ว่าง (idle)” — **AI เป็นผู้อัปเดตสถานะเอง**
ตามการทำงานจริง ผู้ใช้ตั้งเองไม่ได้. Skills แต่ละตัวมี `SKILL.md` กำกับ — เพิ่ม/
**แก้ไข/ลบ** ผ่านโหมด “✎ แก้ไข / ลบทักษะ” (ชิปขึ้นปุ่ม ✎/✕, ลบมี confirm แดง).
ช่องตำแหน่ง/เครื่องมือ **ไม่มีปุ่มเพิ่มในฟอร์ม** — จัดการที่ Tools Manager ที่เดียว.

**Tools Manager (🧰 จัดการเครื่องมือ · admin, perm `options.manage`).** คลังกลางของ
system tools มีชนิด + config ตามชนิด: **MCP Server** (endpoint/transport) ·
**LINE OA Bot** (channel token/secret) · **Telegram Bot** (bot token/chat id) ·
**CMD / PowerShell** (shell/command/workdir) · **HTTP API** · **Webhook** · custom.
สวิตช์เปิด/ปิดต่อตัว (ปิด = ซ่อนจากฟอร์มสร้าง Agent โดยไม่ลบ). ชื่อ tool sync เข้า
`options.tools` อัตโนมัติ. หน้าเดียวกันนี้ยังจัดการตัวเลือก “ตำแหน่ง” ด้วย.
Storage: `guildos.toolsConfig`.

**Body ทุกช่องใช้ระบบ tiptap.** เอกสารใหญ่ (brief / worklog / AGENT.md / SKILL.md
overlay) ใช้ `DocEditor` (tiptap + execCommand fallback, autosave ลง
`guildos.doc.*`). ช่อง Body ในฟอร์ม (SKILL.md, เนื้อหา Codex) ใช้ `RichBody` —
tiptap inline + toolbar B/I/H1/H2/list/code; เก็บทั้ง plain text (ใช้ค้นหา/ไฟล์ .md)
และ HTML (ใช้แสดงผล).

**งาน & ห้อง (Quest flow).** สร้างงาน → เลือกห้องใหม่ (จากเทมเพลต) หรือห้องเดิม →
HERMES สร้างไฟล์ brief/worklog ให้ → งานเข้าคิวของห้อง. Filter bar รวมค้นหา +
สถานะ/ห้อง + ชิป “จบแล้ว / ถังขยะ”. ลบงาน = soft delete ไปถังขยะ กู้คืนได้.

**การแจ้งเตือน.** คำถามจาก Agent/ระบบเด้งเป็นการ์ดมุมขวา (นับถอยหลัง 7s) แล้วยุบเข้า
กระดิ่ง “งาน” บน topbar. แผงใหม่: หัวข้อ “การแจ้งเตือน” + ตัวนับ + **ล้างทั้งหมด**,
แต่ละรายการมี avatar ตามชนิด (🤖 ระบบ = สีฟ้า / ❓ คำถาม = สีอินดิโก), เวลาสัมพัทธ์,
ข้อความ clamp 2 บรรทัด, จุด unread สีอินดิโก, ปุ่ม ปิด/เข้าไปต่อ (เฉพาะเมื่อมีห้อง).
Storage: `guildos.notify.v1`.

**RBAC.** บทบาท admin/manager/member/viewer + per-user override; ทุก route
ผ่าน `guard(perm, el)`; ปุ่ม/ฟิลด์ที่ไม่มีสิทธิ์ถูกล็อกพร้อม 🔒 หรือซ่อนออก.

**Theme.** `data-theme="pro"|"pro-dark"` บน `<html>`; toggle ☀️/🌙 บน topbar;
ทุกสีผ่าน token เท่านั้นจึงสลับธีมได้ฟรี. ห้าม hardcode hex — ใช้ token จาก §4 เสมอ.

---

## 7. Documentation map

| File | Read it for |
|---|---|
| [`README.md`](README.md) | Project overview, run, layout, features — start here |
| [`CLAUDE.md`](CLAUDE.md) | Dev rules: component-first, i18n, file map, theme, preview build |
| [`docs/system-design.md`](docs/system-design.md) | System architecture — agent-ops engine, HERMES orchestration, data model |
| [`design-system/Design System/README.md`](design-system/Design%20System/README.md) | Full visual foundations + component specimen |
| [`design-system/Design System/SKILL.md`](design-system/Design%20System/SKILL.md) | `pikaos-design` skill manifest (generate on-brand artifacts) |

---

## 8. Migration notes

The whole app was converted from a legacy global-`<script>` build into ES modules
(data → `src/data`, logic → `src/lib`, primitives → `src/components`, screens →
`src/screens`, shell → `src/App.jsx`, entry → `src/main.jsx`) and rebranded
GuildOS / AgentOS / “Adventurer Guild” → **PiKaOs**. Internal identifiers that embed
“guild” (`GuildCtx`, route id `hall`) are intentionally left so persisted
`localStorage` data keeps loading.
