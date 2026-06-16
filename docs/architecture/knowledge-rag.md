# PiKaOs — Knowledge / Document Storage (Markdown-as-truth · pgvector = rebuildable cache)

> **Decision-locked design** (2026-06-16) — เจ้าของเรื่อง "เก็บเอกสาร/ความรู้ทั้งระบบ".
> ขยายจาก [system-design §8](system-design.md) (Knowledge/RAG) · [risk-mitigation §5.3](risk-mitigation.md)
> (embedding dim) · [improvement-plan เฟส E](../process/improvement-plan.md). อ้างโค้ดจริง ณ 2026-06-16.
> สถานะ: 🟡 **design เสร็จ — ตัวเก็บ (markdown) ทำได้เลย, ชั้น vector ยังไม่ implement** (เฟส E).

---

## 0. การตัดสินใจ (locked) — "Hermes + Obsidian (markdown)"

ระบบความรู้ของ PiKaOs ใช้ **markdown เป็นแหล่งความจริง (source of truth)** ไม่ใช่ vector DB.
เหตุผลตรงโจทย์ "ระบบสำคัญ วางแล้วไม่กลับมาแก้บ่อย" → ให้ค่ากับ **ความทนทาน + ดูแลน้อย**:

- markdown = plain text, ไม่มี vendor, อ่านออก/แก้มือได้, version ได้, อายุเป็นสิบปี, ดูแล ~0.
- vector = ต้องเลี้ยง (re-embed ตอนแก้, model ถูก deprecate, มิติเปลี่ยน → re-index ทั้งคลัง) → ผิดโจทย์ถ้าเป็น **แกน**.

**pgvector ไม่ถูกทิ้ง** — แต่เป็น **ดัชนีเสริมที่ derived จาก markdown และทิ้ง/สร้างใหม่ได้** เปิดเมื่อการค้นเริ่มเจ็บจริง (§4).

### กฎเหล็ก (the one rule that makes it last)
> **Rebuild เดินทางเดียว: `markdown → vector` เท่านั้น — ห้ามมีข้อมูลสำคัญอยู่เฉพาะใน vector.**

ผลคือ vector พัง = แค่ rebuild จาก markdown, ระบบไม่ตาย, ไม่มี data loss. นี่คือสิ่งที่ทำให้ "วางแล้วลืมได้".

---

## 1. สามชั้น — แยกที่เก็บตามชนิดข้อมูล (อย่ายัดทุกอย่างลงที่เดียว)

| ชั้น | ข้อมูลแบบไหน | ที่เก็บ | สถานะใน PiKaOs |
|---|---|---|---|
| **1. Structured** | deadline · task · quiz score · log · run_steps · RBAC | **Postgres** | ✅ มีแล้ว (`runs`/`run_steps`/`users`/`quests`…) |
| **2. Documents (ความจริง)** | notes · Ref `.md` · ไฟล์ดิบ (md/pdf/img/log) | **markdown + MinIO** | ✅ infra พร้อม ([`storage.py`](../../Backend/app/storage.py) · [`documents`](../../Backend/app/models.py)) |
| **3. Semantic index** | "ดึง context ที่เกี่ยวกับงานนี้" (RAG) | **pgvector** (derived) | 🟡 scaffold ([`Document.embedding`](../../Backend/app/models.py)) ยังไม่ใช้ — เฟส E |

> structured data **ห้ามเก็บใน vector** (ค้น exact/filter/aggregate ไม่ได้) — นั่นคืองานของ Postgres.

---

## 2. โครงไฟล์ vault (markdown convention)

ไฟล์จริงอยู่ใน **MinIO** (bucket `pikaos`), metadata + scoping อยู่ใน [`documents`](../../Backend/app/models.py)
(`object_key` ชี้ไฟล์ · `kind` md/pdf/img/log · `owner_id` · `department_id`). โครง key แบบ Hermes
(subject-centric) แต่ผูก tenancy ของ PiKaOs:

```
subjects/<department-or-subject>/
  uploads/     ไฟล์ดิบที่อัปโหลด (pdf/รูป/log)
  notes/       <subject>_<topic>_notes.md      ← extract เต็ม (ไม่ summarize)
  research/    <topic>.md                       ← synthesis (สรุปได้)
  SUBJECT.md   inventory: ไฟล์ที่ logged + วันที่ + tag
```

- **1 ไฟล์ = 1 object** ใน MinIO + 1 แถวใน `documents`. ไม่กระจาย metadata ลงที่อื่น.
- **scoping**: ทุก query/retrieval กรองด้วย `department_id` (single-org/หลายแผนก — [system-design §7.1](system-design.md))
  + perm ของ owner. markdown ไม่ใช่ public-by-default.
- markdown แก้ใน Obsidian (คน) หรือ agent เขียน (เครื่อง) ได้ทั้งคู่ — ไฟล์เดียวกัน, ความจริงเดียว.

> **ไม่รันแอป Obsidian บนเซิร์ฟเวอร์** — ใช้แค่ *แพทเทิร์น markdown vault*; คนเปิดดู/แก้ใน Obsidian ฝั่ง client ได้.

---

## 3. ชั้น 3 — pgvector เป็น cache (เปิดทีหลัง, ไม่ใช่ตอนนี้)

### เปิดเมื่อไหร่ (เกณฑ์ — YAGNI, อย่าทำก่อนเจ็บ)
เปิดชั้น vector **ก็ต่อเมื่อ** ข้อใดข้อหนึ่งจริง:
1. เอกสาร > ~50–100 ไฟล์ จน grep/path หาไม่เจอ, **หรือ**
2. agent ต้อง "ดึงเรื่องที่เกี่ยวข้องเอง" ข้ามหลายไฟล์/หลายแผนก, **หรือ**
3. ต้องการ ranking/ความใกล้เคียงเชิงความหมาย (ไม่ใช่ exact match)

ก่อนถึงเกณฑ์ → markdown + grep + filter ใน Postgres พอ.

### ออกแบบให้ทิ้งได้ (เมื่อเปิด — เฟส E)
- **chunk ตาม heading ของ markdown** (notes เขียนเป็นหัวข้ออยู่แล้ว → ตัดตามนั้น) — ไม่ตัดมั่ว.
- **embedding model + dim ตัดสินใจก่อน ingest แถวแรก** (เปลี่ยนทีหลัง = re-embed ทั้งคลัง) →
  เพิ่มคอลัมน์ `embedding_model` ใน `documents`, มิติเดียวทั้งแพลตฟอร์ม ([risk-mitigation §5.3](risk-mitigation.md)).
  เลิก hardcode `Vector(1536)` ที่ผูก OpenAI.
- **re-embed ตอนไฟล์เปลี่ยน** (hook ที่ ingest job) · **ลบเอกสาร → ลบ vector** (ไม่มี orphan — เกณฑ์ตรวจรับเฟส E).
- **rebuild command เดียว**: ลบ index ทั้งก้อนแล้วสร้างใหม่จาก markdown ได้เสมอ (พิสูจน์กฎเหล็ก §0).

### Retrieval (เฟส E3)
`agent_runner` step 1 ดึง top-k จาก pgvector **กรองด้วย agent's room/quest scope + `department_id` + perm ของ owner**
ก่อนใส่เป็น context — retrieval ที่ข้าม scope = data leak.

---

## 4. Non-goals (สิ่งที่ "ไม่ทำ" — กันการเดินผิด)

- ❌ **ไม่ลง Vector DB ตัวใหม่** (Pinecone/Weaviate/Chroma) — มี **pgvector ในสแตกแล้ว** (db = `pgvector/pgvector:pg16`); ตัวที่สองคือ infra ซ้ำซ้อนที่ต้องเลี้ยง.
- ❌ **ไม่ทำชั้น vector ก่อนเจ็บ** — ดู §3 เกณฑ์.
- ❌ **ไม่เก็บ structured data (ตาราง/วันที่/สถานะ) ใน vector** — Postgres.
- ❌ **ไม่ให้ข้อมูลอยู่เฉพาะใน vector** — markdown เป็นความจริงเสมอ (กฎเหล็ก §0).

---

## 5. ผลต่อโค้ด/แผนที่มีอยู่

- [`Document.embedding Vector(1536)`](../../Backend/app/models.py) = scaffold เดิม → เฟส E1 เปลี่ยนเป็นมิติแพลตฟอร์ม + เพิ่ม `embedding_model`.
- [system-design §8](system-design.md) + build order step 6 (RAG) = ปลายทาง implement; doc นี้ล็อก "ตัวเก็บเป็น markdown" ที่เดิมเขียนกว้างไว้.
- [improvement-plan เฟส E](../process/improvement-plan.md) (E1 model/dim · E2 ingest · E3 retrieval · E4 UI) = แผน implement เมื่อถึงเกณฑ์ §3.
- ตัวเก็บ markdown (ชั้น 2) **ทำได้เลยไม่ต้องรอ vector** — pipeline อัปโหลด → MinIO → `documents` row.
