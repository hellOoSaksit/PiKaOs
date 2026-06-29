---
title: Site Checklist Audit — audit a site against a Content Checklist
type: feature
status: design
keywords: [checklist, audit, ir website, sitemap, crawl, matching engine, template, static dynamic, compare]
related: [./compare.md, ./sitemap-generate.md, ./compare-hardening.md, ../process/improvement-plan.md]
summary: >
  Owns the design for auditing a target site against a checklist template (CSV/JSON in,
  matching engine, per-kind verification). Read before building the audit feature.
updated: 2026-06-20
---

# PiKaOs — Site Checklist Audit (audit a site against a Content Checklist)

> New feature design: enter the URL of the site to audit + a checklist (e.g. IR Website Checklist)
> → the system walks the sitemap/actual pages and reports what is **missing/extra/wrong** against the checklist.
> Built on the existing Compare module ([`../COMPARE.md`](compare.md)) — same infra
> (sitemap parser, page fetcher, batching, config pattern) but changes the "source of truth"
> from *the Production sitemap* to a *checklist template*.
> Example template already converted from a real file: [`checklist-templates/ir-website-standard.json`](checklist-templates/ir-website-standard.json).

---

## Current Understanding

From the file `20250327-TIPAK-IR-Checklist(TIPAK's IR Website).csv` (159 rows):

- Structure: **9 sections** (IR Home → Information Inquiry) / **73 audit items**, each with
  TOPIC (TH/EN), TYPE OF CONTENT, CMS/CDP (module), Phase (Pre-IPO/Post-IPO),
  content status TH/EN (YES/NO/N/A/**HIDE**).
- Items have **2 levels**: *page* (e.g. `2.1 General Information` — has its own URL) and
  *in-page component* (e.g. Highlight Banners, Stock Performance on the IR Home page — no separate URL,
  must be checked **within** the parent page).
- The Static/Dynamic split answers "how to check", not just a label:
  static = content is in the HTML, checkable directly · dynamic = pulled from an API/JS widget where the raw HTML has no data
  (as agreed: check at the **page + marker** level, then flag manual check for the data inside the widget).

**Source file quality issues (must be fixed at the source, not worked around in the system):**

1. The Thai-language columns are **corrupted across the whole file** (`?????`) — exported with a non-Unicode encoding.
   → re-export as **CSV UTF-8** from Excel/Sheets, then `topic_th` can be filled in the template right away
   (required to match Thai-language sites).
2. The `Type (Static/Dynamic/Form)` column is **empty in every row** — so the system infers it from `CMS/CDP` per the table in §2;
   the content team should confirm/correct it in the converted template.

---

## 1. Concept

```
checklist template (JSON)        target site (single URL)
        │                                │
        │                    sitemap.xml + crawl menu/home page
        │                                │
        └──────► matching engine ◄───────┘
                      │
              verification per kind (static/dynamic/form/link_out)
                      │
            report: found · found-but-wrong · ambiguous · missing · hidden-ok · needs-manual · extra
```

**Stateless in the first phase** like compare (no DB): the client sends the template JSON + base URL per request.
Storing templates in the system (DB + management screen) is the next phase, once the engine table lands (improvement-plan phase D).

## 1.1 Input adapters — a checklist can arrive in several formats → normalize to one template

A client can send "what the site must have" in ≥3 formats; all are converted to a **central template JSON** (schema §2)
before entering the matching engine — the engine doesn't know where the input came from.

| Adapter | Input | Conversion | Reliability |
|---|---|---|---|
| **CSV** | checklist table (e.g. TIPAK) | parse rows → flat items + infer kind from CMS/CDP (§2 table) | high (clear structure) |
| **IA tree (open)** | XMind / draw.io / Mermaid / FreeMind / OPML | read hierarchy + map node_type from legend | high — **recommend requesting the source file, not a PDF** |
| **IA tree (Edraw .emmx)** | Edraw MindMaster (the file ShareInvestor actually uses) | unzip → full text from `mmpage/page.bin`; **hierarchy lives in the encoded `mm.bkiwi`** | medium — text is complete, but parent-child must be reconstructed/reviewed (see §2.2) |
| **PDF/IA image** | diagram exported as PDF/image (e.g. SEAFCO) | OCR + reconstruct boxes/lines → **human confirms** | **low — not automatic** (see §2.2) |
| **manual** | entered on screen | straight into the schema | high |

Three examples already converted from real files:
- `checklist-templates/ir-website-standard.json` — flat (from TIPAK CSV, 73 items).
- `checklist-templates/esg-website-standard.json` — IA tree (from SEAFCO PDF, 159 nodes, 9 sections, depth 3).
- `checklist-templates/corporate-website-standard.json` — IA tree (from WD `.emmx`, 173 nodes, 10 menus, depth 4;
  `verified:false` — hierarchy reconstructed from DFS order, pending review against the MindMaster file).

### Standard symbol legend (from ShareInvestor's IA — kept as a system-wide default)

ShareInvestor's IA defines node type via "SYMBOL" + module kind via "REMARK" (colored box) —
**this solves the CSV "empty Type column" problem entirely** because kind is already specified in the diagram:

| SYMBOL | node_type | kind checked |
|---|---|---|
| ① Menu Level 1 / Homepage | `menu` | static (home/section) |
| ② Sub Menu / Module Page | `submenu` | static/dynamic |
| ③ Landing Page · ④ Group/Module | `landing` / `group` | dynamic |
| ⑤ Scene / Static Details | `scene` | static |
| Link Out / Link In Website | `link_out` / `link_in` | link_out / internal |
| API (Appendix B) | `api` | dynamic + needs_manual |

| REMARK (colored box) | module | kind |
|---|---|---|
| Download Module ("Related Documents") | `download` | dynamic (list ≥1) |
| Gallery Module | `gallery` | dynamic |
| Activities Module | `activities` | dynamic |
| Sustainability Report Module | `sustainability_report` | dynamic (+ Flipbook/PDF) |
| Contact Form | `contact_form` | form |

## 2. Checklist template (schema)

Supports **2 shapes** in one schema: `format: "flat"` (items[] — from CSV) or
`format: "ia-tree"` (tree[] with nested children — from IA). The matching engine flattens the tree → items
with `parent`/`depth`/`section` before running, so the same code handles both.

Example flat file: `docs/checklist-templates/ir-website-standard.json` ·
tree: `docs/checklist-templates/esg-website-standard.json`

```jsonc
{
  "template": "ir-website-standard",
  "items": [{
    "id": "4.1",
    "section": "Stock Info",
    "topic_en": "Stock Quote",
    "topic_th": null,              // fill in after UTF-8 re-export
    "content_type": "API",
    "module": "widget",            // from the CMS/CDP column
    "phase": "Post-IPO",           // Pre-IPO | Post-IPO
    "kind": "dynamic",             // static | dynamic | form | link_out (inferred/confirmed manually)
    "expected": "present",         // present | hidden (from HIDE)
    "scope": "page",               // page | component (component = checked in the section's parent page)
    "match": {
      "slug_keywords": ["stock", "quote"],     // matched against path in sitemap/menu
      "title_keywords": ["Stock Quote"],       // matched against <title>/h1/menu text
      "url_override": null                     // specify the URL directly if known (beats every rule)
    },
    "verify": { "marker": null }   // override the widget marker per item
  }]
}
```

Table inferring `kind` from `CMS/CDP` (used during CSV import — the result in the template can always be edited manually):

| CMS/CDP | kind | How to check |
|---|---|---|
| Premium Content (Text/Image) | `static` | content is in the HTML |
| Widget / API | `dynamic` | marker + manual flag |
| News / Download / Board / Shareholder / Webcast Module | `dynamic` | page + list has ≥1 item (server-rendered list items are usually visible in the HTML) |
| Form Module | `form` | has `<form>` + field |
| Link Out | `link_out` | has an outbound link + destination responds 2xx/3xx |

## 2.2 Importing IA from PDF/image — limitations to be upfront about

A file like `SEAFCO-FSTE-ESG-Sitemap.pdf` is an **image PDF** (≈3MB, the whole-page diagram is an image, with no
usable text layer). Asking the system to "read boxes + connecting lines from the image and build a tree automatically" is OCR +
layout reconstruction, which is **not reliable enough to use as source of truth** — nested boxes, crossing lines,
and colors that indicate type all make errors easy. Policy:

1. **Always request the source file first** — these diagrams are drawn in XMind / draw.io / Mermaid / FreeMind, which
   export to `.xmind`/`.drawio`/`.mm`/`.json` with the hierarchy + node colors directly → 100% accurate parsing.
2. If only a PDF/image is available → **OCR-assist** mode: the system guesses an initial tree, then **forces a human to review/edit** on screen
   before saving as a template (no audit runs from raw OCR output). Flagged `transcribed_by: "ocr"` +
   `verified: false` until a human confirms.
3. The attached `esg-website-standard.json` was transcribed via **vision-read** (I read the image myself) — the
   `transcribed_by: "vision-read"` field warns that it **must be reviewed against the source file** before real use
   (e.g. "5 Related Activities" might be 3, and some node color labels read from the image may be off).

> Summary: PDF is an **acceptable but untrusted** input — the quality path is source file → CSV → manual;
> PDF comes last and must always pass through a human.

**Edraw `.emmx` case (the one ShareInvestor uses):** it's a zip — `mmpage/page.bin` has the complete text of every node
(extractable via string-extract) but **the level relationships live in the encoded `mm.bkiwi`**, so the parser reconstructs the tree
from **DFS order** (MindMaster writes nodes in tree-traversal order) + ALL-CAPS = top section. The result is a usable
structure, but "who is whose child" at deep levels may be off — a human must review (like PDF). **A better path:**
ask the team doing the IA to export from MindMaster as **OPML / FreeMind (.mm) / Markdown outline**, which carries the hierarchy
as text directly → 100% accurate parsing with no guessing. (The attached `corporate-website-standard.json` was made with this
DFS-reconstruct method, hence `verified:false`.)

## 3.0 Sitemap Discovery — from a single URL → the site's actual set of URLs

> Step before the matching engine: the user gives only a single `baseUrl`, so the system must collect all of the site's URLs itself.
> Principle: **sitemap.xml ∪ menu crawl** — the sitemap gives quantitative completeness, the menu gives anchor text
> (important for title score §3.2) and on real IR sites is often more complete than the sitemap. Both sources are evidence,
> not alternatives — a URL found in both is the highest-quality candidate.

**Steps**

1. **Sitemap** — derive `<base>/sitemap.xml` (compare's existing `sitemapFor` pattern) →
   reuse [`fetch_sitemap_urls`](../../../PiKaOs-Core/Backend/app/services/sitemap.py) (already supports `sitemapindex`,
   follow redirects, caps `max_urls`/`max_sitemaps`). If 404/broken → read `robots.txt`
   for a `Sitemap:` line first (many sites declare it there, not at the standard path).
   **A broken sitemap doesn't fail the whole run** (unlike compare's 502 — there the sitemap is the source of truth,
   here it's just one source): fall back to crawl only + flag `sitemap_missing` in the response.
2. **Menu crawl** — `fetch_page(baseUrl)` → `links` ([`content.py`](../../../PiKaOs-Core/Backend/app/services/content.py)
   already filters same-host + makes them absolute) = depth 1; BFS onward up to `audit_crawl_depth`
   (default 2 — menu + section landing pages, enough to cover IA depth 3–4 because nav appears on every page),
   capped at `audit_crawl_max_pages` pages. Keep the **anchor text** of the first link pointing to that URL
   (from `_PageParser.links` — must be extended to also keep text alongside href; currently it keeps only href).
3. **Normalize + union** — strip `#fragment` · strip trailing slash · dedupe; **same host only**
   (URLs in the sitemap pointing to another host are dropped — if the IR site is on a subdomain, the user should enter that subdomain
   as `baseUrl` directly). Keep the query string (some dynamic pages are distinguished by `?page=`).
4. **Output per URL**: `{url, sources: ["sitemap"|"menu"...], depth, anchor}` — `anchor` is
   input to the title score (§3.2); `sources`/`depth` ride along with the audit result's evidence (§5).
5. **Split by language** — group by path prefix `/th/`·`/en/` (or no prefix = default language),
   feeding per-language auditing in §3.5.

**Early warning**: sitemap missing **and** the home page has an unusually low number of internal links (SPA without SSR — §8)
→ flag a warning at discovery, rather than letting the whole run come out as a baffling `missing`.

**Security**: every fetched URL (sitemap, robots, crawl) passes through the **same SSRF guard as compare**
(task A7 — block private/loopback + redirect to internal) — see §6.

**New config** (the `compare_*` pattern in [`config.py`](../../../PiKaOs-Core/Backend/app/config.py)):
`audit_crawl_depth: int = 2` · `audit_crawl_max_pages: int = 50` ·
`audit_discovery_max_urls: int = 2000` (following `compare_max_urls`).

## 3. Matching engine — find each item's URL

1. **Collect the site's actual URLs**: the result from Sitemap Discovery (§3.0) — sitemap ∪ menu with anchor text.
2. **Score candidates per item**:
   - slug score: the fraction of `slug_keywords` found in the path (e.g. `/stock-quote` ↔ ["stock","quote"]).
   - title score: `difflib` ratio between `title_keywords` and the `<title>`/`h1`/menu anchor text.
   - plus context: a candidate under the same section (path starting like an already-matched sibling item)
     gets bonus points — solving duplicate names across sections (e.g. "Financial Highlights" appears in both IR Home and §3.1,
     "IR Calendar" appears in both §1 and §5.4).
3. **Decide**: best ≥ 0.75 → `found` · 0.5–0.75 → `ambiguous` (show top-3 for a human to pick, then record
   `url_override` in the template) · < 0.5 → `missing`.
4. `scope: "component"` doesn't find a URL itself — it's checked in the parent page's HTML (the URL the main section matched)
   using `title_keywords` against headings/text/`alt` on the page.
5. Bilingual sites (`/th/...`, `/en/...`): audit per language — report per item per language (the checklist already has separate
   TH/EN status that lines up).

## 4. Verification per kind

| kind | `found` (complete) criteria | `found_weak` criteria | Notes |
|---|---|---|---|
| `static` | 2xx page + content > N chars + title_keyword found | 2xx page but thin content / no keyword found | reuse `content.py` |
| `dynamic` | 2xx page + **module marker** found + (list: ≥1 item) | 2xx page but no marker found | default marker per module, e.g. widget = SET widget container id/`<script src>`; overridable per item; **data inside the widget = `needs_manual` always** (no headless, as agreed) |
| `form` | 2xx page + `<form>` + input ≥1 | page exists but no form | doesn't actually submit |
| `link_out` | anchor leaving the origin found + destination probe 2xx/3xx | link found but destination broken | e.g. Prospectus → market.sec.or.th |
| `expected: hidden` | **not** found in menu/sitemap → `hidden_ok` | — | found despite being required hidden → `hidden_violation` |

**Phase awareness**: the request specifies `phase: "pre-ipo" | "post-ipo"` — in pre-ipo mode, missing Post-IPO
items are reported as `not_yet_required` (not counted as fail). Matches the real use case: auditing a site before IPO
can use the same checklist as after IPO.

**Extra results (extra)**: URLs on the site (sitemap ∪ menu) that match no item at all → an "extra vs checklist" list
for a human to scan — symmetric with compare's existing `extraOnUat`.

## 5. API + UI

**Backend** (same pattern as compare — stateless, no repositories):

```
POST /api/audit            { baseUrl, template, phase?, lang? ("th"|"en"|"both") }
  → 202-style like compare: returns matching + page-level results (fast)
POST /api/audit/deep       { pairs: [{itemId, url}] }   ← client streams as batches
  → deep component/marker/link_out checks (existing DeepBatchIn pattern — avoids proxy timeout)
POST /api/audit/import     { kind: "csv"|"ia", data }   → template JSON (adapter §1.1; reports encoding/empty-column/OCR issues)
GET  /api/audit/export     { result, as: "csv"|"json"|"sitemap_xml"|"ia_mermaid" }
```

Response per item: `state` (found · found_weak · ambiguous · missing · hidden_ok ·
hidden_violation · not_yet_required · needs_manual · error) + `evidence`
(matched URL, score, marker found, language) — every verdict has evidence a human can trace back.

> **Generate mode** (the reverse direction: no template → crawl the site and build an IA diagram + AI classify
> Local→API) is its own document → [sitemap-generate.md](sitemap-generate.md).

### 5.1 Output as an IA diagram (whatever input format → can output that same format)

Because the checklist can be ingested as an IA tree, the audit result can **be output as the same IA diagram** — the same nodes
but colored by state (green=found · yellow=found_weak/ambiguous · red=missing · gray=not_yet_required/
hidden_ok · orange=needs_manual). Reuses the template's tree, no need to redraw:

- **Mermaid** (`ia_mermaid`) — renders immediately in the UI (mermaid is already in the artifact set) + embeds in
  the .md report; each node binds `:::found`/`:::missing` as a color classDef.
- **sitemap.xml** (`sitemap_xml`) — only nodes that are `found` + have a real URL → ready to hand to the client/SEO.
- **CSV** — the original checklist + audit-result columns (state, matched_url, score) for hand comparison in Excel.

This closes the loop the user asked for: **enter a URL → the system walks the real site → it comes out as an IA diagram in the same form
ShareInvestor delivered, but colored by what's present/missing** — compare it image-for-image against the original right away.

New config following the `compare_*` pattern: `audit_match_threshold`, `audit_ambiguous_threshold`,
`audit_max_items`, `audit_concurrency`, `audit_min_content_chars` + the discovery set (§3.0).

**Frontend**: a new "Site Audit" screen beside Compare Content (Workspace group) — reuses the entire existing UI language:
upload CSV/JSON → table grouped by section + filter pills per state + batch-style progress
(`.cmp-skel` skeleton) + a button to export results back to CSV (the checklist's original columns + audit-result columns).
`ambiguous` rows have a dropdown to pick the correct URL → recorded into the template (`url_override`) → reruns get more accurate over time.

## 6. Security + limits (tied to already-planned work)

- **Same SSRF guard as compare** (task A7 in improvement-plan): block private/loopback IPs +
  redirect to internal — audit takes user URLs in exactly the same way, so it must share the guard.
- `require_perm("audit.run")` (add a new permission in the A1 set; while RBAC isn't here yet, use
  `get_current_user` temporarily like compare).
- Limit to 1 pending audit per user (Redis key) — prevents rapid-fire clicking.

## 7. Build order (sub-phases)

| Phase | Delivers | Depends on |
|---|---|---|
| 1 | `/api/audit/import` (CSV→template) + page-level `/api/audit` (match + probe + static verify) + Audit screen to display/export | depends on nothing — doable immediately on the current stack |
| 2 | `/api/audit/deep` (component/marker/form/link_out) + ambiguous picker + bilingual | phase 1 |
| 3 | store templates in DB + audit history (compare to last time — regression between deploys) | engine table (improvement-plan B1/D) |
| 4 ⚪ | semantic matching with an LLM (once the agent engine lands): have the agent read the page and decide "does the content match the topic" instead of keywords — far more accurate for Thai sites | engine phase C |

## 8. Limitations to state to users plainly

- Sites that render entirely with JS (SPA without SSR): the raw HTML is nearly empty → most results will be `found_weak`/
  `needs_manual`. The system detects this (abnormally low text/HTML ratio) and flags a warning for the whole run.
- Matching accuracy depends on keyword quality — the first pass of a new site will have `ambiguous` items for a human to decide,
  then the system remembers (`url_override`); this is intended behavior, not a bug.
- Numbers inside a widget (stock price, etc.) are not verified — out of the agreed scope (no headless browser).

## Pros / Cons / Impact

**Pros**: reuses ~70% of the existing compare infra (sitemap, fetch, probe, batch, config, UI pattern) —
no new dependency; stateless in the first phase, so it isn't blocked on engine work; the template is open JSON
reusable across clients (IR sites are nearly all the same standard across the market).
**Cons**: keyword matching has false positives/negatives by nature — mitigated with evidence +
ambiguous picker + (phase 4) LLM; a dynamic widget can only be checked for "presence", not "correctness".
**Impact**: yields an automated QA tool that audits a site from the same checklist the team already uses —
and once the agent engine is done, this feature is one of the first tools the agent can call (kind=`read`,
safe to resume per the risk-mitigation policy §1).
