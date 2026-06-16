# PiKaOs — Modularity / Extractable Systems (Modular Monolith · per-system footprint)

> **Decision-locked design** (2026-06-16) — เจ้าของเรื่อง "แยกแต่ละระบบออกไปลง local ต่อแผนกได้".
> คู่กับ [system-design](system-design.md) (§7 data model) · [knowledge-rag.md](knowledge-rag.md) (markdown/light).
> สถานะ: 🟡 **หลักการ locked · ER จัดตาม module แล้ว (baseline) · code ยังไม่ย้ายเข้า `modules/`** (ทำเป็นเฟส).

---

## 0. การตัดสินใจ (locked)

ทำเป็น **Modular Monolith** — codebase เดียว แต่แต่ละ "ระบบ" เป็น **module ที่อยู่ได้ด้วยตัวเอง** (bounded
context: มี models/migrations/routers/services/repos ของตัวเอง). เป้าหมาย use case: สร้างระบบ A เสร็จ →
ยกเฉพาะ module A + core ไปลงให้แผนกหนึ่งใช้ **local เบาๆ ไม่หนักเครื่อง** โดยไม่ต้องลากทั้ง monolith.

**ไม่แตก microservices** — ขัดกับ "เบา/ลงง่าย" (เพิ่ม network/ops/infra) และ over-engineering สำหรับสเกลนี้.

**Footprint = ต่อระบบ** (per-system): ระบบ stateless ไม่ต้องมี DB เลย; ระบบ stateful ใช้ Postgres-lite.

---

## 1. Modules (bounded contexts)

| Module | ตาราง/สถานะ | พึ่งอะไร | Footprint ตอนแยกลง local |
|---|---|---|---|
| **core** (identity · access · tenancy) | users · departments · user_departments · roles · permissions · role_perms · user_perms | — (ฐานของทุกอย่าง) | Postgres (เล็ก) — ทุก deployment ต้องมี |
| **engine** (agent-ops) | rooms · agents · quests · runs · run_steps | core | Postgres-lite (db+backend, worker) · Redis/MinIO = optional |
| **knowledge** (codex/เอกสาร) | documents (+ markdown ใน object store/ไฟล์) | core | Postgres-lite + ที่เก็บไฟล์ |
| **compare** (UAT vs Prod) | — **stateless** ([compare.md](../features/compare.md)) | core (auth) | **ไม่มี DB** — เบาสุด ยกไปได้เลย |
| **audit/sitemap** (designed) | — stateless | core (auth) | ไม่มี DB |

> **core เป็นฐานร่วม** — ทุก deployment มี core (auth/RBAC/แผนก). module อื่นพึ่ง core ได้ แต่ core ไม่พึ่งใคร.

---

## 2. กฎเหล็กของ modularity (extraction rules)

1. **FK ข้าม module ได้เฉพาะ → core เท่านั้น** (เช่น `agents.owner_id → users`, `*.department_id → departments`).
   FK ข้ามไป **module อื่นที่ไม่ใช่ core ห้าม** — ใช้ **soft reference** (เก็บ UUID เปล่า ไม่มี FK) แทน
   เพื่อยก module ออกได้โดยไม่ลาก schema ของ module อื่นมาด้วย.
   *(เหตุผลที่ deferring `subtasks` ในเฟส B ถูกต้อง: มันมี FK `brief_doc_id → documents` = engine→knowledge ข้าม module — เมื่อทำจริงในเฟส C ใช้ soft-ref.)*
2. **1 module = เจ้าของตารางของตัวเอง.** ไม่มี module ไหนเขียนตารางของ module อื่น (ผ่าน service interface เท่านั้น).
3. **core = least common denominator** — เล็กที่สุดเท่าที่ทุก module ต้องใช้ร่วม (auth/identity/แผนก). อย่ายัดของเฉพาะระบบลง core.
4. **stateless ต้อง stateless จริง** — compare/audit ห้ามแอบเขียน DB; ความเป็น stateless คือสิ่งที่ทำให้ยกไปลงเบาๆ ได้.
5. **เปิด/ปิด module ตอน deploy** — config `ENABLED_MODULES` คุมว่า build นี้โหลด router/worker job ของ module ไหน → แผนกได้เฉพาะที่ต้องใช้.

---

## 3. โครงโค้ดเป้าหมาย (code structure — ทำเป็นเฟส, ยังไม่ย้าย)

```
Backend/app/
  core/          identity · auth · rbac · tenancy · db · config · security   (ฐานร่วม)
  modules/
    engine/      models · migrations · routers · services · repositories ของ engine
    knowledge/   ...
    compare/     (stateless: routers · services เท่านั้น)
    audit/       ...
  main.py        โหลดเฉพาะ module ใน ENABLED_MODULES
```

ตอนนี้โค้ดยังเป็น flat (`app/services`, `app/routers`, `app/repositories`) — **ER จัดตาม module ก่อน
(เป็นพิมพ์เขียว); การย้ายโฟลเดอร์โค้ดเข้า `modules/` เป็นงานรีแฟกเตอร์เฟสถัดไป** (ทำทีละ module, เริ่มจาก
ตัว stateless ที่ย้ายง่ายสุด เช่น compare). แต่ละ module ใช้ §2 เป็นสัญญาตั้งแต่วันนี้ (อย่าสร้าง FK ข้าม non-core).

---

## 4. ผลต่อ ER / schema (ทำแล้ว — baseline)

- migration baseline (`0001_baseline`) จัดตารางเป็น **section ตาม module** (core → knowledge → engine);
  FK ข้าม module เข้า core เท่านั้น (ตาม §2.1) — ดู [system-design §7](system-design.md).
- เลื่อน `subtasks`/`tools_config`/`notifications` ไปเฟสที่ใช้จริง (ตัด FK ข้าม module + ตารางที่ยังไม่มีโค้ดแตะ).
- `stub_tool_writes` = test fixture ของ engine แยกเป็น migration ต่างหาก (ไม่ปน schema โดเมน).

## 5. Non-goals

- ❌ ไม่แตก microservices / ไม่มี service-to-service network call.
- ❌ ไม่ทำ DB แยกต่อ module ใน deployment เดียว (module ใช้ schema/DB เดียวกันได้ ขอแค่ FK ตามกฎ §2).
- ❌ ไม่ย้ายโค้ดเข้า `modules/` รวดเดียว — ทำทีละ module เมื่อพร้อม (กัน regression).
