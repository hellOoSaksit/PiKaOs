# PiKaOs — Session Handoff Prompt (วางในแชตใหม่เพื่อทำงานต่อ)

> คัดลอกบล็อก "PROMPT" ด้านล่างทั้งก้อนไปวางเป็นข้อความแรกของ session ใหม่.
> ส่วนที่เหลือของไฟล์นี้คือ "สถานะงาน" ที่ prompt อ้างถึง — อัปเดตเมื่อจบงานสำคัญทุกครั้ง.

---

## PROMPT (คัดลอกตั้งแต่บรรทัดนี้ลงไป)

```
ตอบไทย. You are the System Design Assistant for PiKaOS — a Thai-first multi-agent
"agent-ops" workspace. กระชับ ตรงประเด็น ลดคำฟุ่มเฟือย ตามสไตล์ผู้ใช้.

บทบาท: อ่านเอกสารใน /docs ให้ครบก่อนให้คำแนะนำ วิเคราะห์สถาปัตยกรรม ชี้ความเสี่ยง
เสนอทางเลือกพร้อมข้อดี/ข้อเสีย/ผลกระทบ ไม่เดาเมื่อเอกสารไม่พอ — บอกว่าขาดอะไร.
ทุกข้อเสนออ้างโค้ดจริง. เก็บเอกสารสถาปัตยกรรมไว้ใน /docs.

โฟลเดอร์โปรเจกต์: C:\Users\tixnop\Documents\PiKaOs  (เลือกโฟลเดอร์นี้ก่อนเริ่ม)

ทำก่อนตอบคำถามแรกเสมอ (ลูปเต็มอยู่ใน docs/process/playbook.md):
1. อ่าน docs/process/session-handoff.md (ไฟล์นี้) — ส่วน "สถานะงาน": ทำอะไรไปแล้ว/ค้างอะไร.
2. อ่าน docs/process/playbook.md (วิธีทำงาน) + docs/process/lessons.md (อย่าทำผิดซ้ำ).
3. อ่าน CLAUDE.md — โดยเฉพาะ "Task router" บนสุด → เปิดเฉพาะ .md เจ้าของเรื่องที่ router ชี้.
   อย่าอ่านทั้ง /docs (เปลือง token + หลงทาง).

งานปัจจุบัน: <เติมก่อนวาง เช่น "implement เฟส A1 RBAC" / "เขียน compare-hardening.md">.
อ่าน "สถานะงาน" ด้านล่างก่อน แล้วถามหนึ่งคำถามถ้ายังกำกวม ก่อนลงมือ.
```

## PROMPT (จบ)

---

## สถานะงาน (อัปเดต: 2026-06-16)

> **[2026-06-16] ประเมินทุกระบบ (read-only) + ตัดสินใจ resilience:** สำรวจ FE/BE/infra ครบ —
> FE สุก (~19k บรรทัด, จุดอ่อนเดียว: ไม่มี CI/lint/test), BE foundation แกร่ง (auth/RBAC/compare/SSRF)
> แต่ **engine ยังเป็น 0 บรรทัด**. เพิ่ม **A7 (SSRF, ที่หายจากตาราง) · A8 (multi-worker+restart) ·
> A9 (graceful degradation)** ใน [improvement-plan](improvement-plan.md) — กันล้มแบบคุ้ม ไม่แตก
> microservices. แก้ [CLAUDE.md](../../CLAUDE.md) §4 ที่ค้าง (บอก RBAC ยัง client-side ทั้งที่ A1 เสร็จ).
> คอขวด = I/O ไม่ใช่ CPU → เร่งด้วยขนาน/queue ไม่ใช่ optimize เลข.
>
> **[2026-06-15] docs แยกตามหน้าที่:** เพิ่ม `process/playbook.md` (รูปแบบการทำงาน/แนวทาง) +
> `process/lessons.md` (ประสบการณ์ + decision log — รวม "อย่าทำผิดซ้ำ" ที่เคยอยู่ใน PROMPT มาไว้ที่เดียว);
> [docs/README.md](../README.md) เขียนใหม่เป็น router แยก 4 หน้าที่; CLAUDE.md มี **Task router** บนสุด +
> แยก Room §1.7 → [features/room-3d.md](../features/room-3d.md). CLAUDE.md = 300 บรรทัดพอดี (ชนเพดาน §8).
>
> โครงเดิม: `architecture/` · `features/` · `process/` + index (COMPARE.md → `features/compare.md`;
> CLAUDE.md + README.md คงอยู่ root — **ห้ามย้าย**). ลิงก์ตรวจแล้ว 0 broken.

### เอกสารใน /docs

| ไฟล์ | เนื้อหา | สถานะ |
|---|---|---|
| `architecture/system-design.md` | พิมพ์เขียว engine/HERMES/WS/data model + build order | ✅ patch ตรง risk-mitigation |
| `architecture/design-review.md` | รีวิววิพากษ์ + ความเสี่ยง P0–P2 | ✅ (มีก่อนแล้ว) |
| `architecture/risk-mitigation.md` | design แก้ความเสี่ยง 15/15 + build order ปรับแล้ว | ✅ |
| `architecture/tech-stack.md` | stack จริง + ที่จะเพิ่ม + นโยบาย dependency | ✅ |
| `process/improvement-plan.md` | แผน 6 เฟส A–F + เกณฑ์ตรวจรับ | ✅ |
| `features/compare.md` | Compare UAT vs Prod (ย้ายจาก /COMPARE.md) | ✅ ใช้งานจริง |
| `features/checklist-audit.md` | ฟีเจอร์ตรวจเว็บตาม checklist (adapters/matching/verify/IA output) + §3.0 Discovery | ✅ design เสร็จ ยังไม่ implement |
| `features/sitemap-generate.md` | Generate mode: URL → IA diagram (tree builder/classifier/AI Local→API/export) — CLAUDE.md §2.7 ชี้มาที่นี่ | ✅ design เสร็จ ยังไม่ implement (เฟส G1–G3) |
| `features/checklist-templates/ir-website-standard.json` | TIPAK CSV — flat 73 items | ✅ (topic_th ว่าง: re-export UTF-8) |
| `features/checklist-templates/esg-website-standard.json` | SEAFCO PDF IA — tree 159 nodes | ✅ (vision-read: สอบทานต้นฉบับ) |
| `features/checklist-templates/corporate-website-standard.json` | WD emmx — tree 173 nodes/10 เมนู | ✅ สร้างแล้ว (`verified:false` — DFS-reconstruct, รอสอบทาน MindMaster) |

### ความเสี่ยง "ออกแบบแล้ว ยังไม่ลงโค้ด" (ลำดับใน improvement-plan)
- **เฟส A (เริ่มได้ทันที)**: RBAC server-side · WS refactor (token ออกจาก URL + per-quest authz) ·
  FK `documents.owner_id` · boot asserts prod secrets · pin minio · passlib→argon2-cffi · CI.
- ✅ **A7 SSRF guard เสร็จแล้ว (2026-06-15)** → [`net_guard.py`](../../Backend/app/services/net_guard.py) +
  [`tests/test_net_guard.py`](../../Backend/tests/test_net_guard.py) (38 passed locally; live-server auth test รันใน docker).
  คงเหลือ DNS-rebinding (pin IP).
- ✅ **A4 boot asserts + minio pin เสร็จแล้ว (2026-06-15)** → `config.production_violations()` + `main.lifespan`
  (prod + secret default → ตายตอนบูต) · [`tests/test_config.py`](../../Backend/tests/test_config.py) ·
  `docker-compose.yml` pin minio by digest.
- ✅ **A1 RBAC server-side เสร็จแล้ว (2026-06-15)** → migration `0002_rbac` (4 ตาราง) · `repositories/rbac.py` ·
  `services/rbac_service.py` (effective perms + Redis cache) · `deps.require_perm` · `/me`+login คืน `permissions[]` ·
  seed RBAC ใน `scripts/seed.py` · [`tests/test_rbac.py`](../../Backend/tests/test_rbac.py) (8 passed, 51 รวมในเครื่อง).
  **ต้อง restart backend container** ให้ migration+seed รัน. คงค้างเฟส A: A2 WS (P0 token-in-URL ✅ + per-user channel + protocol;
  per-quest authz + backfill → เฟส B), A5 passlib→argon2 (เสี่ยง login), A6 CI
  (✅ A3 FK · A7 SSRF · A8 multi-worker/restart · A9 graceful degradation — เสร็จ 2026-06-16; migration ล่าสุด `0003`).
- **ถัดไปแนะนำ**: ผูก `require_perm("compare.run")` + rate-limit ที่ compare (compare-hardening §2 ปลดล็อกแล้ว) หรือ A3 FK (เล็ก).
- **เฟส B**: engine core + arq + 2-phase resume + atomic quota + timeout.
- ✅ **ตอบแล้ว (2026-06-12): multi-tenancy = องค์กรเดียว หลายแผนก** → `department_id` ทุก scopable table
  ตั้งแต่ migration แรก (design: [system-design §7.1](../architecture/system-design.md#71-department-scoping-)). เฟส B1 พร้อมเริ่มด้านนี้.

### ความเสี่ยง Compare/Sitemap
✅ **[2026-06-15] เขียนลงไฟล์แล้ว** → [features/compare-hardening.md](../features/compare-hardening.md)
(SSRF P0 + design guard เฟส A7 · authz/rate-limit P1 · robustness P2/P3) — อ้างโค้ดจริงครบ ยังไม่ implement.

### ฟีเจอร์ Audit ("ใส่ URL → ตรวจขาด/เกินตาม checklist → ออกเป็น IA")
- Design ครบใน `checklist-audit.md` ยังไม่ implement.
- เฟส 1 (stateless, ทันที): `/api/audit/import` (CSV+IA) · `/api/audit` ระดับหน้า · จอ Audit + export.
- **Sitemap Discovery** ✅ ลงไฟล์แล้วเป็น §3.0 ใน checklist-audit.md (sitemap ∪ crawl เมนู,
  robots.txt fallback, anchor text → title score, SSRF guard ร่วม A7, config `audit_crawl_*`).
  หมายเหตุ implement: `_PageParser` ต้องขยายให้เก็บ anchor text คู่ href (ตอนนี้เก็บแต่ href).

### ไฟล์ต้นฉบับ checklist ที่ผู้ใช้ส่ง (uploads/)
- `20250327-TIPAK-IR-Checklist(...).csv` — IR, ภาษาไทยเสีย.
- `20260506-SEAFCO-FSTE-ESG-Sitemap.pdf` — ESG IA, PDF รูปภาพ.
- `WD-Sitemap-Template.emmx` — Corporate IA, Edraw MindMaster (binary page.bin; แกะ string ได้ โครงไม่แม่น).

### งานถัดไป (เลือก)
1. แปลง WD emmx ให้เสร็จ + สอบทานโครงกับผู้ใช้.
2. docs/features/compare-hardening.md (ย้ายความเสี่ยง compare + SSRF guard design).
3. implement เฟส A1 (RBAC) หรือ A7 (SSRF) — งานปลอดภัยเริ่มได้ทันที.
4. implement เฟส 1 ของ audit.
