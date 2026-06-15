# Lessons — ประสบการณ์ บทเรียน และ decision log

> หน่วยความจำข้ามแชตของโปรเจกต์: "เคยตัดสินใจอะไรไว้ / เคยพลาดตรงไหน / อย่าทำผิดซ้ำ".
> เปิดก่อนเริ่มงานที่เกี่ยวข้อง (ดูลูปใน [`playbook.md`](playbook.md)). เจอบทเรียนใหม่ → บันทึกที่นี่ในรอบเดียวกัน.

## A. การตัดสินใจที่ล็อกแล้ว (decision log)

ฟอร์แมต: **[วันที่] เรื่อง → ที่ตกลง · เพราะ · เอกสารเจ้าของ**

- **[2026-06-12] Multi-tenancy = องค์กรเดียว หลายแผนก** → ใส่ `department_id` ทุก scopable table
  **ตั้งแต่ migration แรก** · เพราะย้อนเติมทีหลังเจ็บกว่ามาก · [system-design §7.1](../architecture/system-design.md#71-department-scoping-).
- **Dynamic widget ตรวจแค่ marker + ติดธง manual** → **ไม่ใช้ headless browser** · เพราะต้นทุน/ความเปราะ
  ไม่คุ้มกับงาน compare/audit · [compare.md](../features/compare.md), [checklist-audit.md](../features/checklist-audit.md).
- **Compare = stateless** → ไม่มี DB ไม่มี `repositories/` layer · เพราะ Production sitemap เป็น source of truth
  อยู่แล้ว · [compare.md](../features/compare.md).
- **Compare parse HTML ด้วย stdlib เท่านั้น** → ไม่เพิ่ม dependency · เพราะนโยบาย dependency เข้ม
  ([tech-stack §4](../architecture/tech-stack.md)) · [compare.md §6](../features/compare.md).
- **Room: data model แช่แข็ง** → `guildos.rooms.v2` (`floor[]`/`struct[]`/`objects[]`) + `FURN` keys/footprints/`draw3d`
  ห้ามเปลี่ยน · เพราะป้อน 2 renderer พร้อมกัน · [room-3d.md](../features/room-3d.md).

## B. ความน่าเชื่อถือของ input (กฎที่ได้จากของจริง)

- **ไฟล์ต้นฉบับ IA แบบ structured (emmx/drawio/xmind) เชื่อถือได้** — แต่ **PDF/รูป ต้องให้คนสอบทานเสมอ**
  (vision-read มีพลาด). ตัวอย่าง: `corporate-website-standard.json` (WD emmx) ยัง `verified:false`
  เพราะ DFS-reconstruct จาก binary รอสอบทานกับ MindMaster — ดู [session-handoff.md](session-handoff.md).
- CSV ภาษาไทยเสียได้ (encoding) → re-export UTF-8 ก่อนแปลง.

## C. ความเสี่ยงที่รู้แล้ว ยังไม่แก้ (อย่าลืม ก่อนขึ้น prod)

- ✅ **[P0] SSRF — แก้แล้ว (2026-06-15, A7)** ใน [`net_guard.py`](../../Backend/app/services/net_guard.py)
  (upfront 400 + event hook กัน redirect). คงเหลือ DNS-rebinding (pin IP). **ใช้ guard เดียวกันนี้ตอนทำ audit Discovery.**
- **[P1]** compare/audit ยังไม่มี permission + ไม่มี rate-limit ต่อผู้ใช้ → รอ A1 (RBAC).
- รายละเอียด + design การแก้ครบ → [compare-hardening.md](../features/compare-hardening.md).
- **Stack hardening**: ✅ [2026-06-15] `minio` pin by digest แล้ว (docker-compose.yml) + ✅ A4 boot asserts
  (prod ที่ใช้ secret default → ตายตอนบูต, `config.production_violations()` + main.lifespan).
  คงค้าง: `passlib` → `argon2-cffi` (เสี่ยง hash เดิม verify ไม่ผ่าน — ทำตอนแตะ security.py พร้อม test login),
  frontend lint/test/typecheck, CI — [tech-stack §3](../architecture/tech-stack.md).
- รายการเต็ม + ลำดับแก้: [risk-mitigation.md](../architecture/risk-mitigation.md) (15 ข้อ) ·
  [improvement-plan.md](improvement-plan.md) (เฟส A–F).

## D. กับดักเฉพาะจุด (เปิดเอกสารเจ้าของก่อนแตะ)

- **Compare** — proxy timeout 120s (deep mode ต้อง stream เป็น batch); GET fallback โหลด body เต็ม → [compare.md §6](../features/compare.md).
- **Room 3D** — ไม่มี tone mapping (ACES/Neutral ทำสีซีด); shadow camera ต้อง fit room bounds ไม่งั้นห้องใหญ่ไม่มีเงา;
  shared geos/mats **ห้าม dispose** → [room-3d.md](../features/room-3d.md).
- **i18n** — string ใหม่ใส่ `en-formal` + `th-formal` ก่อน; pack อื่น inherit ผ่าน fallback 4 ชั้น (CLAUDE.md §1.2).
- **Screen barrels** — แก้ที่ module ไม่ใช่ barrel; ใช้ `wt`/`st` ร่วม อย่า re-declare (CLAUDE.md §1.6).
