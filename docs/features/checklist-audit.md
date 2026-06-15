# PiKaOs — Site Checklist Audit (ตรวจเว็บตาม Content Checklist)

> Design ฟีเจอร์ใหม่: ใส่ URL ของเว็บที่ต้องการตรวจ + checklist (เช่น IR Website Checklist)
> → ระบบไล่ sitemap/หน้าเว็บจริง แล้วรายงานว่า**ขาด/เกิน/ผิด**อะไรเทียบกับ checklist.
> ต่อยอดจาก Compare module เดิม ([`../COMPARE.md`](compare.md)) — ใช้ infra เดียวกัน
> (sitemap parser, page fetcher, batching, config pattern) แต่เปลี่ยน "source of truth"
> จาก *sitemap ของ Production* เป็น *checklist template*.
> ตัวอย่าง template ที่แปลงจากไฟล์จริงแล้ว: [`checklist-templates/ir-website-standard.json`](checklist-templates/ir-website-standard.json).

---

## Current Understanding

จากไฟล์ `20250327-TIPAK-IR-Checklist(TIPAK's IR Website).csv` (159 แถว):

- โครงสร้าง: **9 หมวด** (IR Home → Information Inquiry) / **73 รายการตรวจ** แต่ละรายการมี
  TOPIC (TH/EN), TYPE OF CONTENT, CMS/CDP (module), Phase (Pre-IPO/Post-IPO),
  สถานะเนื้อหา TH/EN (YES/NO/N/A/**HIDE**).
- รายการมี **2 ระดับ**: *หน้า* (เช่น `2.1 General Information` — มี URL ของตัวเอง) และ
  *ส่วนประกอบในหน้า* (เช่น Highlight Banners, Stock Performance บนหน้า IR Home — ไม่มี URL แยก
  ต้องตรวจ**ภายใน**หน้าแม่).
- การแยก Static/Dynamic ใช้ตอบว่า "ตรวจอย่างไร" ไม่ใช่แค่ป้าย:
  static = เนื้อหาอยู่ใน HTML ตรวจได้ตรงๆ · dynamic = ดึงจาก API/JS widget ซึ่ง HTML ดิบไม่มีข้อมูล
  (ตามที่ตกลง: ตรวจระดับ **หน้า + marker** แล้วติดธง manual check สำหรับตัวข้อมูลใน widget).

**ปัญหาคุณภาพไฟล์ต้นทาง (ต้องแก้ที่ต้นทาง ไม่ใช่ workaround ในระบบ):**

1. คอลัมน์ภาษาไทย**เสียทั้งไฟล์** (`?????`) — ถูก export เป็น encoding ที่ไม่ใช่ Unicode.
   → re-export เป็น **CSV UTF-8** จาก Excel/Sheets แล้วเติม `topic_th` ใน template ได้ทันที
   (จำเป็นต่อการ match เว็บภาษาไทย).
2. คอลัมน์ `Type (Static/Dynamic/Form)` **ว่างทุกแถว** — ระบบจึงอนุมานจาก `CMS/CDP` ตามตาราง §2;
   ควรให้ทีม content ยืนยัน/แก้ใน template ที่แปลงแล้ว.

---

## 1. แนวคิด

```
checklist template (JSON)        target site (URL เดียว)
        │                                │
        │                    sitemap.xml + crawl เมนู/หน้าแรก
        │                                │
        └──────► matching engine ◄───────┘
                      │
              verification ต่อ kind (static/dynamic/form/link_out)
                      │
            รายงาน: พบ · พบแต่ผิด · กำกวม · ขาด · ซ่อนถูกต้อง · ต้องตรวจมือ · เกิน
```

**Stateless เฟสแรก** เหมือน compare (ไม่มี DB): client ส่ง template JSON + base URL ต่อ request.
เก็บ template ในระบบ (DB + หน้าจัดการ) เป็นเฟสถัดไปเมื่อตาราง engine มาแล้ว (improvement-plan เฟส D).

## 1.1 Input adapters — checklist มาได้หลายรูปแบบ → normalize เป็น template เดียว

ลูกค้าส่ง "สิ่งที่เว็บต้องมี" มาได้ ≥3 รูปแบบ; ทุกแบบถูกแปลงเป็น **template JSON กลาง** (schema §2)
ก่อนเข้า matching engine — engine ไม่รู้ว่า input มาจากไหน.

| Adapter | Input | วิธีแปลง | ความเชื่อถือ |
|---|---|---|---|
| **CSV** | ตาราง checklist (เช่น TIPAK) | parse แถว → flat items + อนุมาน kind จาก CMS/CDP (§2 ตาราง) | สูง (โครงสร้างชัด) |
| **IA tree (open)** | XMind / draw.io / Mermaid / FreeMind / OPML | อ่าน hierarchy + map node_type จาก legend | สูง — **แนะนำให้ขอไฟล์ต้นฉบับ ไม่ใช่ PDF** |
| **IA tree (Edraw .emmx)** | Edraw MindMaster (ไฟล์ที่ ShareInvestor ใช้จริง) | unzip → text จาก `mmpage/page.bin` ได้ครบ; **hierarchy อยู่ใน `mm.bkiwi` ที่เข้ารหัส** | ปานกลาง — text ครบ แต่ parent-child ต้องประกอบ/สอบทาน (ดู §2.2) |
| **PDF/รูป IA** | diagram ส่งออกเป็น PDF/ภาพ (เช่น SEAFCO) | OCR + reconstruct กล่อง/เส้น → **คนยืนยัน** | **ต่ำ — ไม่ auto** (ดู §2.2) |
| **manual** | กรอกในจอเอง | ตรงเข้า schema | สูง |

ตัวอย่างที่แปลงจากไฟล์จริงแล้ว 3 ตัว:
- `checklist-templates/ir-website-standard.json` — flat (จาก TIPAK CSV, 73 items).
- `checklist-templates/esg-website-standard.json` — IA tree (จาก SEAFCO PDF, 159 nodes, 9 หมวด, ลึก 3).
- `checklist-templates/corporate-website-standard.json` — IA tree (จาก WD `.emmx`, 173 nodes, 10 เมนู, ลึก 4;
  `verified:false` — โครงชั้นประกอบจาก DFS order, รอสอบทานไฟล์ MindMaster).

### Symbol legend มาตรฐาน (จาก IA ของ ShareInvestor — เก็บเป็นค่ากลางของระบบ)

IA ของ ShareInvestor นิยาม node type ด้วย "SYMBOL" + ชนิดโมดูลด้วย "REMARK" (กล่องสี) —
**แก้ปัญหา "คอลัมน์ Type ว่าง" ของ CSV ไปเลย** เพราะ kind ถูกระบุมาในรูปอยู่แล้ว:

| SYMBOL | node_type | kind ที่ตรวจ |
|---|---|---|
| ① Menu Level 1 / Homepage | `menu` | static (หน้าหลัก/หมวด) |
| ② Sub Menu / Module Page | `submenu` | static/dynamic |
| ③ Landing Page · ④ Group/Module | `landing` / `group` | dynamic |
| ⑤ Scene / Static Details | `scene` | static |
| Link Out / Link In Website | `link_out` / `link_in` | link_out / internal |
| API (Appendix B) | `api` | dynamic + needs_manual |

| REMARK (กล่องสี) | module | kind |
|---|---|---|
| Download Module ("Related Documents") | `download` | dynamic (ลิสต์ ≥1) |
| Gallery Module | `gallery` | dynamic |
| Activities Module | `activities` | dynamic |
| Sustainability Report Module | `sustainability_report` | dynamic (+ Flipbook/PDF) |
| Contact Form | `contact_form` | form |

## 2. Checklist template (schema)

รองรับ **2 รูปทรง** ใน schema เดียว: `format: "flat"` (items[] — จาก CSV) หรือ
`format: "ia-tree"` (tree[] ซ้อน children — จาก IA). matching engine flatten tree → items
พร้อม `parent`/`depth`/`section` ก่อนทำงาน จึงใช้โค้ดเดียวกันทั้งสองแบบ.

ไฟล์ตัวอย่าง flat: `docs/checklist-templates/ir-website-standard.json` ·
tree: `docs/checklist-templates/esg-website-standard.json`

```jsonc
{
  "template": "ir-website-standard",
  "items": [{
    "id": "4.1",
    "section": "Stock Info",
    "topic_en": "Stock Quote",
    "topic_th": null,              // เติมหลัง re-export UTF-8
    "content_type": "API",
    "module": "widget",            // จากคอลัมน์ CMS/CDP
    "phase": "Post-IPO",           // Pre-IPO | Post-IPO
    "kind": "dynamic",             // static | dynamic | form | link_out (อนุมาน/ยืนยันเอง)
    "expected": "present",         // present | hidden (จาก HIDE)
    "scope": "page",               // page | component (component = ตรวจในหน้าแม่ของ section)
    "match": {
      "slug_keywords": ["stock", "quote"],     // เทียบ path ใน sitemap/เมนู
      "title_keywords": ["Stock Quote"],       // เทียบ <title>/h1/ข้อความเมนู
      "url_override": null                     // ระบุ URL ตรงๆ ได้ถ้ารู้ (ชนะทุก rule)
    },
    "verify": { "marker": null }   // override marker ของ widget ได้ราย item
  }]
}
```

ตารางอนุมาน `kind` จาก `CMS/CDP` (ใช้ตอน import CSV — ผลใน template แก้มือได้เสมอ):

| CMS/CDP | kind | วิธีตรวจ |
|---|---|---|
| Premium Content (Text/Image) | `static` | เนื้อหาอยู่ใน HTML |
| Widget / API | `dynamic` | marker + manual flag |
| News / Download / Board / Shareholder / Webcast Module | `dynamic` | หน้า + ลิสต์มีรายการ ≥1 (รายการ render ฝั่ง server มักเห็นใน HTML) |
| Form Module | `form` | มี `<form>` + field |
| Link Out | `link_out` | มีลิงก์ออก + ปลายทางตอบ 2xx/3xx |

## 2.2 การ import IA จาก PDF/รูป — ข้อจำกัดที่ต้องตรงไปตรงมา

ไฟล์อย่าง `SEAFCO-FSTE-ESG-Sitemap.pdf` เป็น **PDF รูปภาพ** (≈3MB, diagram ทั้งหน้าเป็นภาพ ไม่มี
text layer ที่ใช้ได้) การให้ระบบ "อ่านกล่อง+เส้นเชื่อมจากรูปแล้วสร้าง tree อัตโนมัติ" คือ OCR +
layout reconstruction ซึ่ง **ไม่น่าเชื่อถือพอจะใช้เป็น source of truth** — กล่องซ้อน เส้นไขว้
สีบอกชนิด ล้วนทำให้ผิดได้ง่าย. นโยบาย:

1. **ขอไฟล์ต้นฉบับก่อนเสมอ** — diagram พวกนี้วาดจาก XMind / draw.io / Mermaid / FreeMind ซึ่ง
   export เป็น `.xmind`/`.drawio`/`.mm`/`.json` ที่มี hierarchy + สี node ตรงๆ → parse ได้แม่น 100%.
2. ถ้ามีแต่ PDF/รูป → โหมด **OCR-assist**: ระบบเดา tree ให้ตั้งต้น แล้ว**บังคับให้คนตรวจ/แก้**ในจอ
   ก่อนบันทึกเป็น template (ไม่รัน audit จากผล OCR ดิบ). ติดธง `transcribed_by: "ocr"` +
   `verified: false` จนกว่าคนจะยืนยัน.
3. `esg-website-standard.json` ที่แนบมา ถอดด้วย **vision-read** (ผมอ่านรูปเอง) — ฟิลด์
   `transcribed_by: "vision-read"` เตือนว่า **ต้องสอบทานกับไฟล์ต้นฉบับ** ก่อนใช้งานจริง
   (เช่น "5 Related Activities" อาจเป็น 3, ป้ายสีบาง node อ่านจากภาพอาจคลาดเคลื่อน).

> สรุป: PDF เป็น input ที่ **ยอมรับได้แต่ไม่ไว้ใจ** — เส้นทางคุณภาพคือไฟล์ต้นฉบับ → CSV → manual;
> PDF อยู่ท้ายสุดและต้องผ่านคนเสมอ.

**กรณี Edraw `.emmx` (ที่ ShareInvestor ใช้):** เป็น zip — `mmpage/page.bin` มี text ของทุก node ครบ
(ดึงได้ด้วย string-extract) แต่ **ความสัมพันธ์ชั้นอยู่ใน `mm.bkiwi` ที่เข้ารหัส** parser จึงประกอบ tree
จาก **DFS order** (MindMaster เขียน node เรียงตามลำดับเดินต้นไม้) + ALL-CAPS = หมวดหลัก. ได้โครงที่
ใช้งานได้ แต่การจัด "ใครเป็นลูกใคร" ในชั้นลึกอาจคลาด — ต้องให้คนสอบทาน (เหมือน PDF). **ทางที่ดีกว่า:**
ขอทีมที่ทำ IA export จาก MindMaster เป็น **OPML / FreeMind (.mm) / Markdown outline** ซึ่งมี hierarchy
เป็น text ตรงๆ → parse แม่น 100% โดยไม่ต้องเดา. (`corporate-website-standard.json` ที่แนบ ทำด้วยวิธี
DFS-reconstruct นี้ จึงติด `verified:false`.)

## 3.0 Sitemap Discovery — จาก URL เดียว → ชุด URL จริงของเว็บ

> ขั้นก่อน matching engine: ผู้ใช้ให้แค่ `baseUrl` เดียว ระบบต้องรวบรวม URL ทั้งหมดของเว็บเอง.
> หลักคิด: **sitemap.xml ∪ crawl เมนู** — sitemap ให้ความครบเชิงปริมาณ, เมนูให้ anchor text
> (สำคัญต่อ title score §3.2) และมักครบกว่า sitemap ในเว็บ IR จริง. ทั้งสองแหล่งเป็น evidence
> ไม่ใช่ทางเลือก — URL ที่เจอจากทั้งคู่คือ candidate คุณภาพสูงสุด.

**ขั้นตอน**

1. **Sitemap** — derive `<base>/sitemap.xml` (แพตเทิร์น `sitemapFor` เดิมของจอ compare) →
   reuse [`fetch_sitemap_urls`](../../Backend/app/services/sitemap.py) (รองรับ `sitemapindex`,
   follow redirects, cap `max_urls`/`max_sitemaps` อยู่แล้ว). ถ้า 404/พัง → อ่าน `robots.txt`
   หาบรรทัด `Sitemap:` ก่อน (เว็บจำนวนมากประกาศที่นั่น ไม่ใช่ path มาตรฐาน).
   **sitemap พังไม่ fail ทั้ง run** (ต่างจาก compare ที่ 502 — ที่นั่น sitemap คือ source of truth,
   ที่นี่เป็นแค่แหล่งหนึ่ง): ตกไปใช้ crawl อย่างเดียว + ติดธง `sitemap_missing` ใน response.
2. **Menu crawl** — `fetch_page(baseUrl)` → `links` ([`content.py`](../../Backend/app/services/content.py)
   กรอง same-host + ทำ absolute ให้แล้ว) = depth 1; BFS ต่อจนถึง `audit_crawl_depth`
   (default 2 — เมนู + หน้า landing ของหมวด พอครอบ IA ลึก 3–4 เพราะ nav ปรากฏทุกหน้า)
   จำกัด `audit_crawl_max_pages` หน้า. เก็บ **anchor text** ของลิงก์แรกที่ชี้ URL นั้น
   (จาก `_PageParser.links` — ต้องขยายให้เก็บ text คู่ href ด้วย ตอนนี้เก็บแต่ href).
3. **Normalize + union** — ตัด `#fragment` · ตัด trailing slash · dedupe; **same host เท่านั้น**
   (URL ใน sitemap ที่ชี้ host อื่นถูกทิ้ง — ถ้าเว็บ IR อยู่บน subdomain ให้ผู้ใช้ใส่ subdomain
   นั้นเป็น `baseUrl` ตรงๆ). คง query string ไว้ (หน้า dynamic บางหน้าแยกกันด้วย `?page=`).
4. **Output ต่อ URL**: `{url, sources: ["sitemap"|"menu"...], depth, anchor}` — `anchor` เป็น
   input ของ title score (§3.2), `sources`/`depth` ติดไปกับ evidence ของผลตรวจ (§5).
5. **แยกภาษา** — จัดกลุ่มด้วย path prefix `/th/`·`/en/` (หรือไม่มี prefix = ภาษา default)
   ป้อนการตรวจแยกภาษาใน §3.5.

**Early warning**: sitemap หาย **และ** หน้าแรกมีลิงก์ภายในผิดปกติน้อย (SPA ไม่มี SSR — §8)
→ ติดป้ายเตือนตั้งแต่ discovery ไม่ใช่ปล่อยให้ผลทั้ง run เป็น `missing` แบบงงๆ.

**ความปลอดภัย**: ทุก URL ที่ fetch (sitemap, robots, crawl) ผ่าน **SSRF guard เดียวกับ compare**
(งาน A7 — block private/loopback + redirect ไป internal) — ดู §6.

**Config ใหม่** (แพตเทิร์น `compare_*` ใน [`config.py`](../../Backend/app/config.py)):
`audit_crawl_depth: int = 2` · `audit_crawl_max_pages: int = 50` ·
`audit_discovery_max_urls: int = 2000` (ตาม `compare_max_urls`).

## 3. Matching engine — หา URL ของแต่ละรายการ

1. **รวบรวม URL จริงของเว็บ**: ผลจาก Sitemap Discovery (§3.0) — sitemap ∪ เมนู พร้อม anchor text.
2. **ให้คะแนน candidate ต่อ item**:
   - slug score: สัดส่วน `slug_keywords` ที่พบใน path (เช่น `/stock-quote` ↔ ["stock","quote"]).
   - title score: `difflib` ratio ระหว่าง `title_keywords` กับ `<title>`/`h1`/ข้อความ anchor ของเมนู.
   - บวก context: candidate ที่อยู่ใต้ section เดียวกัน (path ขึ้นต้นเหมือน item พี่น้องที่ match แล้ว)
     ได้แต้มเพิ่ม — แก้ปัญหาชื่อซ้ำข้ามหมวด (เช่น "Financial Highlights" มีทั้งใน IR Home และ §3.1,
     "IR Calendar" มีทั้ง §1 และ §5.4).
3. **ตัดสิน**: best ≥ 0.75 → `found` · 0.5–0.75 → `ambiguous` (โชว์ top-3 ให้คนเลือก แล้วจำเป็น
   `url_override` ใน template) · < 0.5 → `missing`.
4. `scope: "component"` ไม่หา URL เอง — ตรวจใน HTML ของหน้าแม่ (URL ที่ section หลัก match ได้)
   ด้วย `title_keywords` กับ heading/ข้อความ/`alt` ในหน้า.
5. เว็บสองภาษา (`/th/...`, `/en/...`): ตรวจแยกภาษา — รายงานต่อ item ต่อภาษา (checklist มีสถานะ
   TH/EN แยกอยู่แล้ว ตรงกัน).

## 4. Verification ต่อ kind

| kind | เกณฑ์ `found` สมบูรณ์ | เกณฑ์ `found_weak` | หมายเหตุ |
|---|---|---|---|
| `static` | หน้า 2xx + เนื้อหา > N chars + เจอ title_keyword | หน้า 2xx แต่เนื้อหาบาง/ไม่เจอ keyword | reuse `content.py` |
| `dynamic` | หน้า 2xx + เจอ **module marker** + (ลิสต์: รายการ ≥1) | หน้า 2xx แต่ไม่เจอ marker | marker default ต่อ module เช่น widget = container id/`<script src>` ของ SET widget; override ได้ราย item; **ข้อมูลใน widget = `needs_manual` เสมอ** (ไม่ใช้ headless ตามที่ตกลง) |
| `form` | หน้า 2xx + `<form>` + input ≥1 | มีหน้าแต่ไม่มี form | ไม่ submit จริง |
| `link_out` | เจอ anchor ออกนอก origin + probe ปลายทาง 2xx/3xx | เจอลิงก์แต่ปลายทางพัง | เช่น Prospectus → market.sec.or.th |
| `expected: hidden` | **ไม่**พบในเมนู/sitemap → `hidden_ok` | — | พบทั้งที่ต้องซ่อน → `hidden_violation` |

**Phase awareness**: request ระบุ `phase: "pre-ipo" | "post-ipo"` — โหมด pre-ipo รายการ Post-IPO
ที่หายไปรายงานเป็น `not_yet_required` (ไม่นับ fail). ตรง use case จริง: ตรวจรับเว็บก่อน IPO
ใช้ checklist ใบเดียวกับหลัง IPO ได้.

**ผลเกิน (extra)**: URL ในเว็บ (sitemap ∪ เมนู) ที่ไม่ match รายการใดเลย → ลิสต์ "เกิน checklist"
ให้คนกวาดตา — สมมาตรกับ `extraOnUat` ของ compare เดิม.

## 5. API + UI

**Backend** (แพตเทิร์นเดียวกับ compare — stateless, ไม่มี repositories):

```
POST /api/audit            { baseUrl, template, phase?, lang? ("th"|"en"|"both") }
  → 202-style เหมือน compare: ตอบ matching + ผลตรวจระดับหน้า (เร็ว)
POST /api/audit/deep       { pairs: [{itemId, url}] }   ← client stream เป็น batch
  → ตรวจ component/marker/link_out เชิงลึก (แพตเทิร์น DeepBatchIn เดิม — เลี่ยง proxy timeout)
POST /api/audit/import     { kind: "csv"|"ia", data }   → template JSON (adapter §1.1; รายงานปัญหา encoding/คอลัมน์ว่าง/OCR)
GET  /api/audit/export     { result, as: "csv"|"json"|"sitemap_xml"|"ia_mermaid" }
```

Response ต่อ item: `state` (found · found_weak · ambiguous · missing · hidden_ok ·
hidden_violation · not_yet_required · needs_manual · error) + `evidence`
(URL ที่ match, score, marker ที่เจอ, ภาษา) — ทุกคำตัดสินมีหลักฐานให้คนตรวจย้อนได้.

> **Generate mode** (กลับทิศ: ไม่มี template → crawl เว็บแล้วสร้าง IA diagram + AI classify
> Local→API) แยกเป็นเอกสารของตัวเอง → [sitemap-generate.md](sitemap-generate.md).

### 5.1 Output เป็น IA diagram (input รูปไหน → ออกรูปนั้นได้)

เพราะ checklist รับเข้าเป็น IA tree ได้ ผลตรวจก็ **ออกเป็น IA diagram เดียวกันได้** — node เดิม
แต่ระบายสีตาม state (เขียว=found · เหลือง=found_weak/ambiguous · แดง=missing · เทา=not_yet_required/
hidden_ok · ส้ม=needs_manual). ใช้ซ้ำ tree ของ template ไม่ต้องวาดใหม่:

- **Mermaid** (`ia_mermaid`) — render ได้ทันทีใน UI (มี mermaid อยู่แล้วในชุด artifact) + ฝังใน
  รายงาน .md; แต่ละ node ผูก `:::found`/`:::missing` เป็น classDef สี.
- **sitemap.xml** (`sitemap_xml`) — เฉพาะ node ที่ `found` + มี URL จริง → ส่งให้ลูกค้า/SEO ใช้ได้เลย.
- **CSV** — checklist เดิม + คอลัมน์ผลตรวจ (state, matched_url, score) เปิดใน Excel เทียบมือ.

นี่ปิด loop ที่ผู้ใช้ขอ: **ใส่ URL → ระบบไล่เว็บจริง → ออกมาเป็น IA diagram แบบเดียวกับที่
ShareInvestor ส่งมา แต่ระบายสีว่าอะไรมี/ขาด** — เทียบรูปต่อรูปกับต้นฉบับได้ทันที.

Config ใหม่ตามแพตเทิร์น `compare_*`: `audit_match_threshold`, `audit_ambiguous_threshold`,
`audit_max_items`, `audit_concurrency`, `audit_min_content_chars` + ชุด discovery (§3.0).

**Frontend**: จอใหม่ "Site Audit" ข้าง Compare Content (Workspace group) — reuse ภาษา UI เดิมทั้งชุด:
upload CSV/JSON → ตารางจัดกลุ่มตาม section + filter pills ต่อ state + progress แบบ batch
(`.cmp-skel` skeleton) + ปุ่ม export ผลกลับเป็น CSV (คอลัมน์เดิมของ checklist + คอลัมน์ผลตรวจ).
แถว `ambiguous` มี dropdown เลือก URL ที่ถูก → จำลง template (`url_override`) → รันซ้ำแม่นขึ้นเรื่อยๆ.

## 6. ความปลอดภัย + ลิมิต (ผูกกับงานที่วางไว้แล้ว)

- **SSRF guard เดียวกับ compare** (งาน A7 ใน improvement-plan): block private/loopback IP +
  redirect ไป internal — audit รับ URL จากผู้ใช้เหมือนกันทุกประการ ต้องใช้ guard ร่วมกัน.
- `require_perm("audit.run")` (เพิ่ม permission ใหม่ในชุด A1; ระหว่างที่ RBAC ยังไม่มา ใช้
  `get_current_user` ชั่วคราวแบบ compare).
- จำกัด 1 audit ค้างต่อ user (Redis key) — กันกดรัว.

## 7. ลำดับการสร้าง (เฟสย่อย)

| เฟส | ส่งมอบ | พึ่งพา |
|---|---|---|
| 1 | `/api/audit/import` (CSV→template) + `/api/audit` ระดับหน้า (match + probe + static verify) + จอ Audit แสดงผล/export | ไม่พึ่งอะไร — ทำได้ทันทีบน stack ปัจจุบัน |
| 2 | `/api/audit/deep` (component/marker/form/link_out) + ambiguous picker + สองภาษา | เฟส 1 |
| 3 | เก็บ template ใน DB + ประวัติการ audit (เทียบครั้งก่อน — regression ระหว่าง deploy) | ตาราง engine (improvement-plan B1/D) |
| 4 ⚪ | semantic match ด้วย LLM (เมื่อ agent engine มา): ให้ agent อ่านหน้า แล้วตัดสิน "เนื้อหาตรง topic ไหม" แทน keyword — แม่นกว่ามากกับเว็บไทย | engine เฟส C |

## 8. ข้อจำกัดที่ต้องบอกผู้ใช้ตรงๆ

- เว็บที่ render ทั้งเว็บด้วย JS (SPA ไม่มี SSR): HTML ดิบแทบว่าง → ผลส่วนใหญ่จะเป็น `found_weak`/
  `needs_manual`. ระบบตรวจจับได้ (text/HTML ratio ต่ำผิดปกติ) และจะติดป้ายเตือนทั้ง run.
- ความแม่นของ matching ขึ้นกับคุณภาพ keyword — รอบแรกของเว็บใหม่จะมี `ambiguous` ให้คนเคาะ
  แล้วระบบจำ (`url_override`); นี่คือ behavior ที่ตั้งใจ ไม่ใช่ bug.
- ตัวเลขใน widget (ราคาหุ้น ฯลฯ) ไม่ถูก verify — อยู่นอก scope ที่ตกลง (ไม่ใช้ headless browser).

## Pros / Cons / Impact

**Pros**: ใช้ infra compare เดิม ~70% (sitemap, fetch, probe, batch, config, UI pattern) —
ไม่มี dependency ใหม่; stateless เฟสแรกจึงไม่บล็อกกับงาน engine; template เป็น JSON เปิด
ใช้ซ้ำข้ามลูกค้า (IR site มาตรฐานเดียวกันเกือบทั้งตลาด).
**Cons**: keyword matching มี false positive/negative โดยธรรมชาติ — แก้ด้วย evidence +
ambiguous picker + (เฟส 4) LLM; dynamic widget ตรวจได้แค่ "มี" ไม่ใช่ "ถูกต้อง".
**Impact**: ได้เครื่องมือ QA ตรวจรับเว็บอัตโนมัติจาก checklist ใบเดิมที่ทีมใช้อยู่แล้ว —
และเมื่อ agent engine เสร็จ ฟีเจอร์นี้เป็น tool ตัวแรกๆ ที่ agent เรียกได้ (kind=`read`,
ปลอดภัยต่อ resume ตามนโยบาย risk-mitigation §1).
