---
title: Sitemap Generate — URL to IA Diagram
type: feature
status: design
keywords: [sitemap generate, ia diagram, crawl, tree builder, node classifier, mermaid, drawio, export, discovery]
related: [./checklist-audit.md, ./compare.md, ./compare-hardening.md, ../process/improvement-plan.md]
summary: >
  Owns the design for crawling a single URL into an IA diagram (tree builder, node
  classifier, AI assist, export). The reverse of audit; shares Discovery with checklist-audit.
updated: 2026-06-20
---

# PiKaOs — Sitemap Generate (URL → IA Diagram)

> Feature design: **single URL in → system crawls the real site → outputs an IA diagram** like the
> one ShareInvestor sent (e.g. SEAFCO ESG IA) — the reverse direction of audit:
> audit = *template→inspect site* ([checklist-audit.md](checklist-audit.md)) · generate = *site→build diagram/template*.
> Shares Discovery (§3.0 of checklist-audit) + symbol legend (§1.1) — this doc owns
> only the **tree builder · node classifier · AI assist (Local→API) · export** parts.
> Every proposal references real code as of 2026-06-12.

---

## 1. Pipeline

```
single URL
 │ 1. Discovery — sitemap ∪ crawl menu + anchor text     (checklist-audit §3.0 — already in design)
 │ 2. Tree builder — assemble hierarchy                    (§2 this doc)
 │ 3. Node classifier — node_type + module                (§3; AI only where rules can't decide — §4)
 │ 4. Export — Mermaid · draw.io · OPML · SVG · sitemap.xml (§5)
 ▼
IA diagram (+ if a template is also supplied → color the inspection results per checklist-audit §5.1)
```

Stateless like compare/audit — no DB, no `repositories/` layer; results stored as client-side files.

## 2. Tree builder — rank pages into levels

Uses **3 signals voting** per page:

| signal | used as | source |
|---|---|---|
| nav nesting (`li` nested in `<nav>`) | **primary** — the IA the designer intended | must extend `_PageParser` (§6) |
| URL path segments (`/esg/environmental/climate-change`) | confirmation | existing discovery |
| that page's breadcrumb | most accurate but not every site has it | child page HTML |

Tie-break rule: **nav wins** (a flat-URL site has path depth 1 but a genuinely nested menu).
Page in sitemap but not in nav → place under parent by path prefix + flag `orphan`.

## 3. Separate module vs sub-module/component

**Step 1 — main dividing line: does it have its own URL or not**

| | Module (①②③ — box that has a page) | Component (⑤ + colored box — lives inside a page) |
|---|---|---|
| URL | has its own path (found in sitemap/nav) | none — it's content **inside** the parent page |
| evidence | `<a href="/esg/climate-change">` | `h2/h3` heading · anchor `#section` · module marker |

Example (from SEAFCO IA): "Climate Change" has a page (②) while "Climate Strategy / TCFD Disclosure"
is a heading **within** that page (⑤) — known because the first has a URL and the latter appears as h2/h3 in the parent page HTML.

**Step 2 — rank the page level**: §2 vote → ① Menu Level 1 (top nav level / path depth 1) ·
② Sub Menu (second-level dropdown) · ③ Landing/Group (hub page linking to several children with the same path prefix).

**Step 3 — tag special modules (REMARK colored box)** from markers in the HTML:

| module | Marker |
|---|---|
| Related Documents / Download | list of `<a href="*.pdf">` ≥1 at the same spot |
| Gallery | dense group of `<img>` (grid), not inline content images |
| Contact Form | `<form>` + input ≥1 (same criterion as audit §4) |
| Flipbook/View Online | iframe/script viewer + paired PDF link |
| Activities/News list | list with repeating dates + many `/news/...` child links |

## 4. AI assist — Local → API

Uses **the same `llm` adapter the engine was designed around** ([system-design.md §4](../architecture/system-design.md)) —
do not create a separate client: the interface `llm.complete(model, messages, ...)` dispatches to
**Local (Ollama/vLLM, OpenAI-compatible) as default** · switch to OpenAI/Anthropic via
`config.settings` (env) with no change to the generate code. Implementing it here (phase G2) means building
the real adapter that engine phase C will reuse — no duplicate adapter.

- **What AI does** (small enough for a local model): classify node_type/module the rules can't decide ·
  match Thai↔English where fuzzy fails ("บรรษัทภิบาล" ↔ Corporate Governance) · sort `orphan` nodes into categories.
- **Payload**: per-node metadata only (title, h1, h2-list, anchor, path) — no full HTML sent;
  batch many nodes, forced to answer with a single JSON schema.
- **Auditable**: every AI answer carries `classified_by: "llm"` + confidence (same principle as
  `transcribed_by` in checklist-audit §2.2) — UI shows it for human review/edit.

**Build phases** (continuing from §7 of checklist-audit):

| phase | deliverable | AI |
|---|---|---|
| G1 | `mode=generate` rule-based: tree + classifier + Mermaid render + export | none |
| G2 | real `llm` adapter (Local/Ollama default) + AI classifier + `classified_by` flag | Local |
| G3 | switch provider to API via config + rate-limit (copy `compare_max_concurrency`) | API |

## 5. Export — re-editable, not just an image

| format | what it's for |
|---|---|
| `ia_mermaid` | render immediately in UI + embed in .md report (matches checklist-audit §5.1) |
| `drawio` XML | **replaces .emmx** — editable in draw.io, looks like the ShareInvestor image, open format |
| `opml` | back into a mind-map tool (FreeMind/XMind can import) → hand to the IA team to continue |
| `svg` | finished image to send the client |
| `sitemap_xml` | only nodes with a real URL (the original from audit §5.1) |

> **Cannot write back to `.emmx`** — MindMaster's hierarchy lives in the encrypted `mm.bkiwi`
> (same limitation as on import — checklist-audit §2.2). draw.io is the equivalent solution.

## 6. API + config + implementation work

```
POST /api/audit   { baseUrl, mode: "generate", useAi?: bool, template?: ... }
  → { tree: [...], evidence per node, flags sitemap_missing/spa_suspect/orphan/classified_by }
GET  /api/audit/export   as: "ia_mermaid" | "drawio" | "opml" | "svg" | "sitemap_xml" | "csv" | "json"
```

New config (the `compare_*` pattern in [config.py](../../../PiKaOs-Core/Backend/app/config.py)):
`audit_generate_max_nodes` · `llm_provider` (`local|openai|anthropic`) · `llm_base_url` ·
`llm_model` · `llm_classify_batch` · `llm_timeout_s` — the `llm_*` set belongs to the shared adapter, not to audit.

**Must extend existing code**: `_PageParser` in [content.py](../../../PiKaOs-Core/Backend/app/services/content.py) currently keeps
a single h1 + flat links → add **h2/h3 list · nested nav structure (li depth) · anchor text paired with href**
(the last two are already noted in session-handoff). Still stdlib-only — do not add a parser dep (COMPARE.md rule).

**Frontend**: build on the existing Sitemap Match screen ([screens-sitemap.jsx](../../../PiKaOs-Core/Frontend/src/screens/screens-sitemap.jsx) —
currently scan is a mock `smHash`) — new "Generate" tab renders Mermaid + export buttons; the mocked
`useAi`/model settings ("Local · Ollama (dev)") wire into real config.

## 7. Security + limitations

- **SSRF guard shared with compare/audit** (task A7 in improvement-plan): block private/loopback +
  redirect to internal — for every URL fetched.
- `require_perm("audit.run")` once RBAC (A1) lands; meanwhile `get_current_user` like compare.
- **SPA without SSR**: nav not in the raw HTML → flag a warning for the whole run starting at discovery
  (no headless browser — existing agreement).
- AI = a classification assistant, not the source of truth — `classified_by: "llm"` results must pass
  a human before being used as an accepted production template.

## Pros / Cons / Impact

**Pros**: closes the loop the user asked for (URL → diagram like the image ShareInvestor sent); reuses almost all
of compare-audit's discovery/fetch/config; G2 yields the `llm` adapter the engine uses next — no wasted work.
**Cons**: tree accuracy depends on the target site's nav quality; SPA sites give partial results;
local model classifies less accurately than API (traded for free + fast — switchable).
**Impact**: the Sitemap Match screen goes from demo → real feature; produces `llm_*` config + adapter
that are the root of engine phase C; this doc is the source of truth for the generate path
(CLAUDE.md points here — update this doc in the same commit as the code that changes).
