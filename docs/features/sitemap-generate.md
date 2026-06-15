# PiKaOs — Sitemap Generate (URL → IA Diagram)

> Design ฟีเจอร์: **ใส่ URL เดียว → ระบบ crawl เว็บจริง → ออกเป็น IA diagram** แบบเดียวกับ
> ที่ ShareInvestor ส่งมา (เช่น SEAFCO ESG IA) — กลับทิศจาก audit:
> audit = *template→ตรวจเว็บ* ([checklist-audit.md](checklist-audit.md)) · generate = *เว็บ→สร้าง diagram/template*.
> ใช้ Discovery (§3.0 ของ checklist-audit) + symbol legend (§1.1) ร่วมกัน — เอกสารนี้เป็นเจ้าของ
> เฉพาะส่วน **tree builder · node classifier · AI assist (Local→API) · export**.
> ทุกข้อเสนออ้างโค้ดจริง ณ 2026-06-12.

---

## 1. Pipeline

```
URL เดียว
 │ 1. Discovery — sitemap ∪ crawl เมนู + anchor text     (checklist-audit §3.0 — มีแล้วใน design)
 │ 2. Tree builder — ประกอบ hierarchy                     (§2 เอกสารนี้)
 │ 3. Node classifier — node_type + module                (§3; AI ช่วยเฉพาะที่ rule ตัดสินไม่ได้ — §4)
 │ 4. Export — Mermaid · draw.io · OPML · SVG · sitemap.xml (§5)
 ▼
IA diagram (+ ถ้าส่ง template มาด้วย → ระบายสีผลตรวจตาม checklist-audit §5.1)
```

Stateless เหมือน compare/audit — ไม่มี DB, ไม่มี `repositories/` layer; เก็บผลเป็นไฟล์ฝั่ง client.

## 2. Tree builder — จัดชั้นของหน้า

ใช้ **3 สัญญาณโหวตกัน** ต่อหน้า:

| สัญญาณ | ใช้เป็น | ที่มา |
|---|---|---|
| nav nesting (`li` ซ้อนใน `<nav>`) | **หลัก** — คือ IA ที่คนออกแบบตั้งใจ | ต้องขยาย `_PageParser` (§6) |
| URL path segments (`/esg/environmental/climate-change`) | ยืนยัน | discovery เดิม |
| breadcrumb ของหน้านั้น | แม่นสุดแต่ไม่ทุกเว็บมี | HTML หน้าลูก |

กติกาเมื่อขัดกัน: **nav ชนะ** (เว็บ flat-URL จะมี path ลึก 1 แต่เมนูซ้อนจริง).
หน้าอยู่ใน sitemap แต่ไม่อยู่ใน nav → จัดใต้ parent ด้วย path prefix + ติดธง `orphan`.

## 3. แยก module vs sub-module/component

**ขั้น 1 — เส้นแบ่งหลัก: มี URL ของตัวเองหรือไม่**

| | Module (①②③ — กล่องที่มีหน้า) | Component (⑤ + กล่องสี — อยู่ในหน้า) |
|---|---|---|
| URL | มี path ตัวเอง (เจอใน sitemap/nav) | ไม่มี — เป็นเนื้อหา**ภายใน**หน้าแม่ |
| หลักฐาน | `<a href="/esg/climate-change">` | `h2/h3` heading · anchor `#section` · marker โมดูล |

ตัวอย่าง (จาก SEAFCO IA): "Climate Change" มีหน้า (②) ส่วน "Climate Strategy / TCFD Disclosure"
คือหัวข้อ**ใน**หน้านั้น (⑤) — รู้เพราะอย่างแรกมี URL อย่างหลังเจอเป็น h2/h3 ใน HTML หน้าแม่.

**ขั้น 2 — จัดชั้น page**: ผลโหวต §2 → ① Menu Level 1 (nav ชั้นแรก / path depth 1) ·
② Sub Menu (dropdown ชั้นสอง) · ③ Landing/Group (หน้า hub ที่ลิงก์ลูก path ขึ้นต้นเหมือนกันหลายตัว).

**ขั้น 3 — ติดป้ายโมดูลพิเศษ (REMARK กล่องสี)** จาก marker ใน HTML:

| โมดูล | Marker |
|---|---|
| Related Documents / Download | ลิสต์ `<a href="*.pdf">` ≥1 จุดเดียวกัน |
| Gallery | กลุ่ม `<img>` หนาแน่น (grid) ไม่ใช่รูปประกอบเนื้อหา |
| Contact Form | `<form>` + input ≥1 (เกณฑ์เดียวกับ audit §4) |
| Flipbook/View Online | iframe/script viewer + ลิงก์ PDF คู่กัน |
| Activities/News list | ลิสต์มีวันที่ซ้ำๆ + ลิงก์ลูก `/news/...` จำนวนมาก |

## 4. AI assist — Local → API

ใช้ **`llm` adapter ตัวเดียวกับที่ engine ออกแบบไว้** ([system-design.md §4](../architecture/system-design.md)) —
ห้ามสร้าง client แยก: interface `llm.complete(model, messages, ...)` dispatch ไป
**Local (Ollama/vLLM, OpenAI-compatible) เป็น default** · สลับ OpenAI/Anthropic ผ่าน
`config.settings` (env) โดยโค้ด generate ไม่แก้. การ implement ที่นี่ (เฟส G2) คือการสร้าง
adapter ตัวจริงที่ engine เฟส C จะ reuse — ไม่เกิด adapter ซ้ำสองตัว.

- **งานที่ให้ AI ทำ** (เล็กพอ local model ไหว): จำแนก node_type/module ที่ rule ตัดสินไม่ได้ ·
  จับคู่ไทย↔อังกฤษที่ fuzzy พลาด ("บรรษัทภิบาล" ↔ Corporate Governance) · จัด node `orphan` เข้าหมวด.
- **Payload**: metadata ต่อ node เท่านั้น (title, h1, h2-list, anchor, path) — ไม่ส่ง HTML เต็ม;
  batch ละหลาย node, บังคับตอบ JSON schema เดียว.
- **ตรวจสอบได้**: ทุกคำตอบ AI ติด `classified_by: "llm"` + confidence (หลักเดียวกับ
  `transcribed_by` ใน checklist-audit §2.2) — UI โชว์ให้คนสอบทาน/แก้ได้.

**เฟสการสร้าง** (ต่อจาก §7 ของ checklist-audit):

| เฟส | ส่งมอบ | AI |
|---|---|---|
| G1 | `mode=generate` rule-based: tree + classifier + Mermaid render + export | ไม่ใช้ |
| G2 | `llm` adapter จริง (Local/Ollama default) + AI classifier + ธง `classified_by` | Local |
| G3 | สลับ provider เป็น API ผ่าน config + rate-limit (ลอก `compare_max_concurrency`) | API |

## 5. Export — เปิดแก้ต่อได้ ไม่ใช่แค่รูป

| format | ใช้ทำอะไร |
|---|---|
| `ia_mermaid` | render ทันทีใน UI + ฝังรายงาน .md (ตรง checklist-audit §5.1) |
| `drawio` XML | **แทน .emmx** — เปิดแก้ใน draw.io ได้ หน้าตาแบบรูป ShareInvestor, format เปิด |
| `opml` | กลับเข้า mind-map tool (FreeMind/XMind import ได้) → ส่งทีม IA ทำงานต่อ |
| `svg` | รูปสำเร็จส่งลูกค้า |
| `sitemap_xml` | เฉพาะ node ที่มี URL จริง (เดิมของ audit §5.1) |

> **เขียนกลับเป็น `.emmx` ไม่ได้** — hierarchy ของ MindMaster อยู่ใน `mm.bkiwi` ที่เข้ารหัส
> (ข้อจำกัดเดียวกับตอน import — checklist-audit §2.2). draw.io คือทางออกที่เทียบเท่า.

## 6. API + config + งาน implement

```
POST /api/audit   { baseUrl, mode: "generate", useAi?: bool, template?: ... }
  → { tree: [...], evidence ต่อ node, ธง sitemap_missing/spa_suspect/orphan/classified_by }
GET  /api/audit/export   as: "ia_mermaid" | "drawio" | "opml" | "svg" | "sitemap_xml" | "csv" | "json"
```

Config ใหม่ (แพตเทิร์น `compare_*` ใน [config.py](../../Backend/app/config.py)):
`audit_generate_max_nodes` · `llm_provider` (`local|openai|anthropic`) · `llm_base_url` ·
`llm_model` · `llm_classify_batch` · `llm_timeout_s` — ชุด `llm_*` เป็นของ adapter กลาง ไม่ใช่ของ audit.

**ต้องขยายของเดิม**: `_PageParser` ใน [content.py](../../Backend/app/services/content.py) ตอนนี้เก็บ
h1 ตัวเดียว + links แบบ flat → เพิ่ม **h2/h3 list · โครง nav ซ้อน (depth ของ li) · anchor text คู่ href**
(สองอย่างหลังจดไว้ใน session-handoff แล้ว). ยังคง stdlib-only — ห้ามเพิ่ม dep parser (กติกา COMPARE.md).

**Frontend**: ต่อยอดจอ Sitemap Match เดิม ([screens-sitemap.jsx](../../Frontend/src/screens/screens-sitemap.jsx) —
ตอนนี้ scan เป็น mock `smHash`) — แท็บใหม่ "Generate" render Mermaid + ปุ่ม export; settings
`useAi`/model ที่ mock ไว้ ("Local · Ollama (dev)") ต่อเข้า config จริง.

## 7. ความปลอดภัย + ข้อจำกัด

- **SSRF guard ร่วมกับ compare/audit** (งาน A7 ใน improvement-plan): block private/loopback +
  redirect ไป internal — ทุก URL ที่ fetch.
- `require_perm("audit.run")` เมื่อ RBAC (A1) มา; ระหว่างนี้ `get_current_user` แบบ compare.
- **SPA ไม่มี SSR**: nav ไม่อยู่ใน HTML ดิบ → ติดธงเตือนทั้ง run ตั้งแต่ discovery
  (ไม่ใช้ headless browser — ข้อตกลงเดิม).
- AI = ผู้ช่วยจำแนก ไม่ใช่ source of truth — ผล `classified_by: "llm"` ต้องผ่านคนก่อน
  ใช้เป็น template ตรวจรับจริง.

## Pros / Cons / Impact

**Pros**: ปิด loop ที่ผู้ใช้ขอ (URL → diagram แบบรูปที่ ShareInvestor ส่งมา); reuse discovery/
fetch/config ของ compare-audit เกือบทั้งหมด; G2 ได้ `llm` adapter ที่ engine ใช้ต่อ — งานไม่สูญ.
**Cons**: ความแม่นของ tree ขึ้นกับคุณภาพ nav ของเว็บเป้าหมาย; เว็บ SPA ได้ผลบางส่วน;
local model จำแนกแม่นน้อยกว่า API (แลกกับฟรี+เร็ว — สลับได้).
**Impact**: จอ Sitemap Match เปลี่ยนจาก demo → ฟีเจอร์จริง; เกิด `llm_*` config + adapter
ที่เป็นรากของ engine เฟส C; เอกสารนี้เป็น source of truth ของ generate path
(CLAUDE.md ชี้มาที่นี่ — อัปเดตเอกสารนี้ใน commit เดียวกับโค้ดที่เปลี่ยน).
