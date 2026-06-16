# docs/ — แผนที่เอกสาร PiKaOs (อ่านไฟล์นี้ก่อนเสมอ)

> Index สำหรับคน + AI: เอกสารไหนเป็นเจ้าของเรื่องอะไร อ่านลำดับไหน.
> กติกาโปรเจกต์ (บังคับ) อยู่ที่ [`../CLAUDE.md`](../CLAUDE.md) — ไม่อยู่ในโฟลเดอร์นี้.
> ภาพรวมโปรเจกต์: [`../README.md`](../README.md).

เอกสารแยกตาม **4 หน้าที่** — เปิดเฉพาะที่ต้องใช้ (ประหยัด token + ไม่หลงทาง):

| หน้าที่ | บ้านของมัน |
|---|---|
| **อยู่ตรงไหน** (สถานะ ส่งต่อข้าม session) | [`process/session-handoff.md`](process/session-handoff.md) |
| **ทำงานยังไง** (รูปแบบ/แนวทาง) | [`process/playbook.md`](process/playbook.md) |
| **เคยเจอ/ตัดสินใจอะไร** (ประสบการณ์) | [`process/lessons.md`](process/lessons.md) |
| **สร้างอะไร** (พิมพ์เขียว + ฟีเจอร์) | [`architecture/`](architecture) · [`features/`](features) |

## ลำดับการอ่านเมื่อเริ่ม session ใหม่ (ขั้นต่ำ — อย่าอ่านเกิน)

1. [`process/session-handoff.md`](process/session-handoff.md) — สถานะ: ทำอะไรไปแล้ว / ค้างอะไร / prompt ตั้งต้น
2. [`process/playbook.md`](process/playbook.md) + [`process/lessons.md`](process/lessons.md) — วิธีทำงาน + อย่าทำผิดซ้ำ
3. [`../CLAUDE.md`](../CLAUDE.md) — กติกา (hard rules) + **Task router** บนสุด ชี้ไป .md เจ้าของเรื่อง
4. ที่เหลือ **เฉพาะที่ router/ตารางด้านล่างชี้** ตามงานที่จะทำ

## architecture/ — ระบบเป้าหมาย + ความเสี่ยง + stack

| ไฟล์ | เป็นเจ้าของ | อ่านเมื่อ |
|---|---|---|
| [`system-design.md`](architecture/system-design.md) | พิมพ์เขียว engine: arq worker · agent loop · HERMES · WS · data model/ER · build order | จะแตะ engine/WS/schema ใดๆ |
| [`design-review.md`](architecture/design-review.md) | รีวิววิพากษ์พิมพ์เขียว — ความเสี่ยง P0–P2 (resume/side-effect, RBAC, WS leak) | ก่อนตัดสินใจสถาปัตยกรรม |
| [`risk-mitigation.md`](architecture/risk-mitigation.md) | design แก้ความเสี่ยงครบ 15 ข้อ + build order ฉบับปรับ — **อ่านก่อนสร้าง engine** | ก่อนเขียนโค้ด engine ทุกบรรทัด |
| [`tech-stack.md`](architecture/tech-stack.md) | stack จริง (เวอร์ชัน) + ที่จะเพิ่ม + นโยบาย dependency ("ไม่เพิ่มอะไร" ก็เขียนไว้) | จะเพิ่ม/อัปเกรด dependency |
| [`knowledge-rag.md`](architecture/knowledge-rag.md) | เก็บเอกสาร/ความรู้ทั้งระบบ — **decision-locked: markdown = ความจริง · pgvector = cache ทิ้งได้** (Hermes+Obsidian) + โครง vault + เกณฑ์เปิด vector | จะแตะ document storage / RAG / codex |

## features/ — ฟีเจอร์รายตัว (1 ไฟล์ = 1 ฟีเจอร์)

| ไฟล์ | เป็นเจ้าของ | สถานะ |
|---|---|---|
| [`room-3d.md`](features/room-3d.md) | Room 3D: Three.js scene + procedural avatars + life-sim (2 renderers/1 data model · `guildos.rooms.v2`) — CLAUDE.md §1.7 ชี้มาที่นี่ | ✅ ใช้งานจริง |
| [`compare.md`](features/compare.md) | Compare UAT vs Production (`/api/compare*` + จอ Compare Content) — ฟีเจอร์ outbound ตัวเดียว | ✅ ใช้งานจริง |
| [`compare-hardening.md`](features/compare-hardening.md) | ความเสี่ยง compare/audit (SSRF P0 · authz/rate-limit P1 · robustness) + design การแก้ — **อ่านก่อนเปิดสู่ผู้ใช้จริง** | 🟡 design เสร็จ |
| [`checklist-audit.md`](features/checklist-audit.md) | Audit เว็บตาม checklist: input adapters (CSV/IA/emmx/PDF) · Discovery §3.0 · matching · verification · IA output | 🟡 design เสร็จ |
| [`sitemap-generate.md`](features/sitemap-generate.md) | Generate mode: URL → IA diagram (tree builder · module/component classifier · AI Local→API · export) | 🟡 design เสร็จ (G1–G3) |
| [`checklist-templates/`](features/checklist-templates) | template JSON ที่แปลงจากไฟล์ลูกค้าจริง (TIPAK/SEAFCO/WD) | ⚠️ WD ติด `verified:false` |

ความสัมพันธ์: compare → เป็นฐาน infra ของ → checklist-audit → ซึ่ง generate ใช้ Discovery+legend ร่วม.
CLAUDE.md §2.6–2.7 ชี้มาที่หมวดนี้.

## process/ — แผนงาน + การส่งต่อ

| ไฟล์ | เป็นเจ้าของ | อ่านเมื่อ |
|---|---|---|
| [`session-handoff.md`](process/session-handoff.md) | สถานะงานล่าสุด + prompt ตั้งต้น session ใหม่ — **อัปเดตทุกครั้งที่จบงานสำคัญ** | เริ่ม/จบทุก session |
| [`playbook.md`](process/playbook.md) | รูปแบบการทำงาน + แนวทาง: ลูป 1 รอบ · ลำดับตัดสินใจ · การตรวจ · วินัย commit/เอกสาร · สไตล์ | เริ่มทุก session / ไม่แน่ใจว่าควรทำงานยังไง |
| [`lessons.md`](process/lessons.md) | ประสบการณ์ + decision log: ตัดสินใจที่ล็อกแล้ว · กับดักที่เจอจริง · ความเสี่ยงรู้แล้วยังไม่แก้ | ก่อนแตะเรื่องที่อาจเคยตัดสินใจ/พลาดไว้ |
| [`improvement-plan.md`](process/improvement-plan.md) | แผนแม่บทเฟส A–F (hardening → engine → HERMES → ย้ายข้อมูล → RAG → prod) + เกณฑ์ตรวจรับต่อเฟส | เลือกงานถัดไป / เช็คลำดับพึ่งพา |

## กติกาของโฟลเดอร์นี้

- 1 ไฟล์ = 1 เรื่อง มีเจ้าของชัด; เรื่องใหม่ใหญ่พอ → ไฟล์ใหม่ในหมวดที่ตรง + อัปเดต index นี้
  ใน commit เดียวกัน (กติกา CLAUDE.md §6.7–6.8).
- เอกสารอ้างโค้ดจริงด้วยลิงก์ relative (`../../Backend/...`) — แก้โครงสร้างแล้วต้องไล่ลิงก์.
- root มีแค่ `CLAUDE.md` (Claude Code อ่านจาก root เท่านั้น) + `README.md` (GitHub) —
  **ห้ามย้ายสองไฟล์นี้เข้า docs/**.
