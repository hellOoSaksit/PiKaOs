# Playbook — รูปแบบการทำงาน + แนวทางที่ repo นี้

> "ทำงานที่ PiKaOs ยังไงให้ถูกทาง" — กระบวนการ ไม่ใช่กฎเนื้อหา (กฎอยู่ [`../../CLAUDE.md`](../../CLAUDE.md)).
> เป้าของไฟล์นี้: เปิดแชตใหม่แล้วทำงานต่อได้เลย ไม่หลงทาง ไม่เผา token.

## 1. ลูปการทำงาน 1 รอบ (ทำตามนี้ทุกครั้ง)

1. **อ่านสถานะ** → [`session-handoff.md`](session-handoff.md) ส่วน "สถานะงาน": ทำอะไรไปแล้ว / ค้างอะไร.
2. **อ่านกฎ + เส้นทาง** → [`../../CLAUDE.md`](../../CLAUDE.md) (โดยเฉพาะ **Task router** บนสุด) →
   เปิดเฉพาะ .md เจ้าของเรื่องที่ router ชี้. **อย่าอ่านทั้ง docs/** — เปลือง token + หลงทาง.
3. **เช็กบทเรียน** → [`lessons.md`](lessons.md): เรื่องนี้เคยตัดสินใจ/พลาดไว้ไหม. ถ้าเคย ทำตามนั้น.
4. **ลงมือ** — แก้ที่ module เจ้าของเรื่อง (ไม่ใช่ barrel), อ้างโค้ดจริง, ไม่เดา.
5. **ตรวจ** → §3 ด้านล่าง.
6. **อัปเดตเอกสารใน commit เดียวกัน** → §4. ถ้างานสำคัญ: อัปเดต `session-handoff.md` + (ถ้ามีบทเรียนใหม่) `lessons.md`.

## 2. ก่อนเขียนโค้ด — ตัดสินใจตามลำดับ

- **Frontend component** → CLAUDE.md §1.1 decision order: reuse → extend → create ใหม่ครบสเต็ป. ห้าม hand-roll.
- **Backend endpoint** → CLAUDE.md §2.1 layering + §2.2 recipe. SQL อยู่ `repositories/` เท่านั้น.
- **ฟีเจอร์ใหญ่** → อ่าน .md เจ้าของเรื่องใน [`../features/`](../features) ให้จบก่อน (room-3d / compare / sitemap / audit).
- **สถาปัตยกรรม/engine/schema** → อ่าน [`../architecture/`](../architecture) (risk-mitigation **ก่อนเขียน engine ทุกบรรทัด**).
- **ไม่มั่นใจว่าเอกสารพอไหม** → บอกว่าขาดอะไร **อย่าเดา** (กฎทองของโปรเจกต์นี้).

## 3. การตรวจ (verify)

- Frontend: `npm run build` (compile check) — รันได้. **ห้าม** สตาร์ท dev server เอง (CLAUDE.md §0 — `start.bat` เท่านั้น).
- Backend: `docker compose exec backend pytest`.
- ต้องรันแอปจริง → ขอให้ผู้ใช้เปิด `start.bat`.

## 4. วินัยเอกสาร + commit

- **แก้โครงสร้าง/พฤติกรรม/dependency → อัปเดตเอกสารใน commit เดียวกัน** (CLAUDE.md §6.7). เอกสารค้างคือหนี้.
- 1 ไฟล์ = 1 เรื่อง มีเจ้าของ; เรื่องใหญ่พอ → ไฟล์ใหม่ในหมวดที่ตรง + เพิ่มบรรทัดใน [`../README.md`](../README.md).
- CLAUDE.md ≤ 300 บรรทัด (hard rule §8): ล้นเมื่อไร → ดึงไป topic .md เหลือ pointer.
- เอกสารอ้างโค้ดด้วยลิงก์ relative; แก้โครงแล้วไล่ลิงก์ให้ครบ (0 broken).

## 5. สไตล์การสื่อสาร + รูปแบบงานเอกสาร

- ตอบไทย กระชับ ตรงประเด็น ลดคำฟุ่มเฟือย. ทุกข้อเสนออ้างโค้ดจริง.
- เอกสารวิเคราะห์ใช้รูปแบบ: **Current Understanding → Observation → Recommendation →
  Alternative Options → Pros / Cons → Impact**. เขียน prose ไม่ใช่ bullet เว้นแต่จำเป็น.
- เสนอทางเลือกพร้อม **ข้อดี/ข้อเสีย/ผลกระทบ** เสมอ — ไม่ฟันธงเดี่ยวโดยไม่บอกทางเลือก.

## 6. สิ่งที่ "อย่าทำ" (สรุปสั้น — รายละเอียด/เหตุผลอยู่ [`lessons.md`](lessons.md))

- อย่ารัน dev server เอง · อย่า hand-roll UI primitive · อย่าเขียน SQL นอก `repositories/` ·
  อย่าแตะ data model ของ room (`guildos.rooms.v2`) · อย่าเพิ่ม dependency โดยไม่เช็กนโยบาย ([tech-stack §4](../architecture/tech-stack.md)) ·
  อย่าเชื่อ IA จาก PDF/รูปโดยไม่ให้คนสอบทาน.
