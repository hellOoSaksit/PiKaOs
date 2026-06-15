# PiKaOs — รีวิวสถาปัตยกรรมระบบ + ความเสี่ยง

> เอกสารคำปรึกษา (advisory) อ่านคู่กับ [`system-design.md`](system-design.md) (พิมพ์เขียวเป้าหมาย),
> [`../CLAUDE.md`](../../CLAUDE.md) (กติกาโปรเจกต์) และ [`../README.md`](../../README.md).
> มุมมอง: รีวิว design ทั้งระบบอย่างวิพากษ์ — จุดแข็ง ช่องว่าง ความเสี่ยง และ decision ที่ควรทบทวน
> ทุกข้อกล่าวอ้างอิงจากโค้ดจริง ณ วันที่ตรวจ (2026-06-12). สถานะ: ✅ มีจริง · 🟡 ออกแบบไว้ · ⚪ อนาคต.

---

## 1. บทสรุปผู้บริหาร

`system-design.md` เป็นพิมพ์เขียวที่ **คุณภาพสูงและคิดมาดี** — เลือก arq + step-persistence,
HERMES แบบ reactive state-machine, multi-provider LLM adapter ล้วนเป็นตัวเลือกที่เหมาะกับสเกลตอนนี้
และมี decision log ที่อธิบาย "ทำไม" ครบ จุดที่ต้องเน้นคือ **ช่องว่างระหว่างสิ่งที่ออกแบบกับสิ่งที่สร้างจริงนั้นกว้างมาก**
และพิมพ์เขียวยัง **ไม่ครอบคลุมความเสี่ยงเชิงปฏิบัติหลายเรื่อง** ที่จะกัดเมื่อ engine เริ่มรันจริง

สถานะจริงโดยสรุป:

| ชั้น | สถานะจริง | หลักฐาน |
|---|---|---|
| Frontend | ✅ สมบูรณ์มาก — 32 screens, UI kit ครบ, i18n 5 packs | `Frontend/src/` |
| Auth | ✅ ใช้งานได้จริง — JWT + refresh ใน Redis + argon2 | `routers/auth.py` (login/refresh/logout/me/forgot-password) |
| Compare (outbound) | ✅ ใช้งานได้จริง | `routers/compare.py` + [`../COMPARE.md`](../features/compare.md) |
| Real-time | 🟡 scaffold เท่านั้น — broadcast ช่องเดียว | `routers/ws.py` (`CHANNEL = "pikaos:ws"`) |
| Agent engine / HERMES | 🟡 ออกแบบ ยังไม่มีโค้ดเลย | ไม่มี router/service/table/worker |
| RBAC ฝั่ง server | ⚪ หยาบ — role เดี่ยว | `deps.py:require_role` |
| RAG | ⚪ มีแต่ตาราง `documents` ที่ยังไม่ถูกใช้ | `models.py:Document` |

**ข้อสรุปสำคัญ 3 ข้อ:**
1. **ความเสี่ยงอันดับ 1 ไม่ใช่ที่ยังไม่ได้สร้าง แต่คือ "resume/replay กับ tool ที่มี side-effect"** — invariant
   ในพิมพ์เขียวบอกว่า "steps are idempotent" แต่ tool อย่าง CMD / HTTP POST / ส่ง LINE **ไม่ idempotent**
   การ replay หลัง worker ล่มจะยิงซ้ำ (§4.1).
2. **`ws.py` ปัจจุบันรั่วข้อมูลข้ามผู้ใช้** — ทุก client ที่ล็อกอินรับทุกข้อความบนช่องเดียว ต้องแก้ก่อนต่อ feature ใดๆ บน WS (§4.3).
3. **RBAC ยังบังคับฝั่ง client เท่านั้น** — เมื่อเพิ่ม endpoint จริง ระบบจะ "ปลอดภัยแค่ภาพ" จนกว่าจะมี `require_perm` ฝั่ง server (§4.2).

---

## 2. สิ่งที่ออกแบบได้ดี (เก็บไว้ อย่าเปลี่ยน)

- **arq บน Redis แทน Celery/Temporal** — เหมาะกับสเกลและ stack async อยู่แล้ว ไม่เพิ่ม infra; เหตุผลใน decision log ถูกต้อง.
- **Step-persistence ใน `run_steps`** — ให้ทั้ง worklog (ผลิตภัณฑ์) และ replay (เทคนิค) จากตารางเดียว เป็นการออกแบบที่ "ได้สองเด้ง".
- **HERMES = reactive state-machine** ที่ไม่ถือ worker ระหว่างรอลูก — เป็นแพตเทิร์นที่ถูกต้องสำหรับ orchestration ที่ทนรีสตาร์ท.
- **Multi-provider adapter ตั้งแต่ต้น** — แยก agent loop ออกจาก SDK ผู้ขาย ลดหนี้เทคนิคในอนาคต.
- **"Status ตั้งโดย AI/runner เท่านั้น"** เป็น product invariant ที่คมและช่วยกันบั๊กเรื่อง state.
- **เอกสาร design + ER diagram + build order** มีอยู่ก่อนเขียนโค้ด — ลดความเสี่ยง over-engineering และทำให้รีวิวแบบนี้เป็นไปได้.

---

## 3. ช่องว่าง "ออกแบบไว้ vs สร้างจริง" (reality check)

พิมพ์เขียวพูดถึงหลายสิ่งราวกับใกล้เสร็จ แต่ระดับ dependency ยังไม่เริ่ม จุดที่ควรรับรู้ตรงกัน:

| พิมพ์เขียวบอก | ความจริงในโค้ด | ผลกระทบ |
|---|---|---|
| "เพิ่ม arq worker (same image, different entrypoint)" | `requirements.txt` **ไม่มี `arq`**; compose ไม่มี service worker | งานข้อ 1 ของ build order ยังไม่เริ่มจริง |
| "LLM provider adapter: OpenAI · Anthropic · Local" | **ไม่มี SDK ผู้ขายใดใน requirements**; ไม่มี key ใน `config.py` | ต้องวาง secrets + adapter ก่อนทุกอย่าง |
| ตาราง `runs/run_steps/subtasks/agents/...` | มีแค่ `users` + `documents` (0001_init) | ต้องเขียน migration ใหม่ทั้งชุด |
| "per-quest WS channels" | `ws.py` เป็น broadcast ช่องเดียว `pikaos:ws` | ต้อง refactor ก่อน (และมีปัญหาความปลอดภัย §4.3) |
| RAG: `documents.embedding vector(1536)` | ตารางมีจริงแต่ **ไม่มีโค้ดอ่าน/เขียน**; ไม่มี lib embedding | placeholder ล้วน |
| RBAC ละเอียด (`PERMISSIONS`/`ROLE_PERMS`) | ฝั่ง server มีแค่ `require_role(*roles)` ใช้ `User.role` เดี่ยว | ช่องว่างความปลอดภัย §4.2 |

> ข้อเสนอ: ใน `system-design.md` ควรเพิ่มคอลัมน์สถานะให้ชัดว่าอะได "ออกแบบแต่ยังไม่มี dependency"
> เพื่อกันเข้าใจผิดว่าเหลือแค่ต่อสาย.

---

## 4. ความเสี่ยงเชิงสถาปัตยกรรม (เรียงตามความรุนแรง)

### 4.1 [P0] Resume/replay กับ tool ที่มี side-effect — ความถูกต้องของระบบ

พิมพ์เขียว §4 ระบุ invariant: *"on worker restart, a run stuck in `running` reconstructs its conversation
from `run_steps` and continues at the next step (steps are idempotent)."*

ปัญหา: **LLM call เป็น idempotent ได้ก็จริง แต่ tool call ที่มี side-effect ไม่ใช่** — ถ้า worker ล่ม
*หลัง* ยิง `HTTP POST`/`ส่ง LINE`/`รัน CMD` แต่ *ก่อน* persist `tool_result` การ resume จะ **ยิงซ้ำ**
(จ่ายเงินซ้ำ ส่งข้อความซ้ำ สร้างไฟล์ซ้ำ).

ข้อเสนอ:
- บันทึก step เป็น **2 เฟส**: เขียน `tool_call` (intent + `idempotency_key`) *ก่อน* ลงมือ แล้วค่อยเขียน `tool_result`.
  ตอน resume ถ้าเจอ `tool_call` ที่ไม่มี `tool_result` → **อย่ายิงใหม่ตาบอด**: ตัดสินตามชนิด tool.
- จัดประเภท tool เป็น **safe-to-retry** (read/idempotent) vs **at-most-once** (side-effect). อย่างหลังให้แนบ
  `idempotency_key` ส่งไปกับ provider ที่รองรับ หรือ mark เป็น `needs_human_confirm` แทนการ retry อัตโนมัติ.
- เอกสารควรพูดถึง **at-least-once vs exactly-once** ของ arq ให้ชัด (arq เป็น at-least-once).

### 4.2 [P0] RBAC บังคับฝั่ง client เท่านั้น — ความปลอดภัย

`deps.py` มี `require_role(*roles)` ที่เทียบ `user.role` เดียว แต่โมเดลสิทธิ์จริงของผลิตภัณฑ์อยู่ฝั่ง frontend
(`data-users.jsx`: `PERMISSIONS`, `ROLE_PERMS_SEED`, `user_perms` override). แปลว่าตอนนี้ **สิทธิ์ละเอียดทั้งหมดเป็นแค่ UX**
— ผู้ใช้ที่เรียก API ตรงๆ ข้ามได้หมด. ความเสี่ยงนี้ยังไม่ระเบิดเพราะ endpoint ที่ปกป้องข้อมูลจริงยังไม่มี
แต่จะกลายเป็นช่องโหว่ทันทีที่เพิ่ม CRUD ของ agents/quests/documents.

ข้อเสนอ: เลื่อน §10 (RBAC server-side) **ขึ้นมาก่อน** การเปิด endpoint เขียนข้อมูลตัวแรก ไม่ใช่ไว้ท้าย build order.
ทำ `require_perm("quest.create")` เป็น dependency และให้ `/api/auth/me` คืน effective permission set.

### 4.3 [P0] WebSocket รั่วข้อมูลข้ามผู้ใช้ + token ใน URL — ความปลอดภัย/ความเป็นส่วนตัว

`ws.py` ตอนนี้: subscribe ช่องเดียว `pikaos:ws` แล้ว **relay ทุกข้อความให้ทุก client**. เมื่อเริ่ม publish
event ของ run/quest จริง ผู้ใช้ A จะเห็น worklog ของผู้ใช้ B. นอกจากนี้ token ส่งผ่าน **query string** (`?token=...`)
ซึ่งมักถูก log โดย proxy/เซิร์ฟเวอร์.

ข้อเสนอ:
- ย้ายไป **per-quest channel** (`quest:<id>`) ตามที่ §6 ออกแบบ — แต่ต้องเพิ่ม **authorization**: ตรวจว่า user
  มีสิทธิ์เห็น quest นั้นก่อน subscribe (ไม่ใช่แค่ authenticated).
- ส่ง token ผ่าน **subprotocol header** หรือข้อความแรกหลัง connect แทน query string; ถ้าเลี่ยงไม่ได้ ให้ใช้ token อายุสั้นแบบใช้ครั้งเดียวสำหรับ WS.
- เพิ่ม **history replay on subscribe**: client ที่เปิดกลางคันต้องโหลด `run_steps` ที่ผ่านมา ไม่งั้น timeline หาย (ดู §4.6).

### 4.4 [P1] โควต้า token แข่งกัน (quota race) — ความถูกต้อง/ต้นทุน

`users` มี `quota`/`used` และ §4 บอกว่า loop มี bound ด้วยโควต้า. แต่ถ้าผู้ใช้คนเดียวมีหลาย run พร้อมกัน
(HERMES สร้างลูกหลายตัว) การอ่าน `used` แล้วบวกทีหลังจะ **แข่งกันจนทะลุโควต้า**.

ข้อเสนอ: ใช้ **atomic reservation** — จองโควต้าใน Redis (`DECRBY`) ก่อนเริ่ม step แล้ว reconcile กับยอดจริงหลังจบ;
หรือ `UPDATE ... SET used = used + :n WHERE used + :n <= quota RETURNING` ใน Postgres เพื่อกันด้วย DB constraint.

### 4.5 [P1] HERMES finalize แข่งกัน (double-finalize) — ความถูกต้อง

`hermes_advance` ถูก enqueue ต่อการจบของลูกแต่ละตัว และเช็ค "ลูกทุกตัว terminal แล้วหรือยัง" ถ้าลูกหลายตัวจบ
ใกล้กัน หลาย `hermes_advance` จะเห็น "ครบแล้ว" พร้อมกัน → enqueue `hermes_finalize` ซ้ำ.

ข้อเสนอ: ทำ transition เป็น atomic — `UPDATE runs SET status='finalizing' WHERE id=:id AND status='running' RETURNING`
ผู้ที่ได้แถวกลับเท่านั้นที่ enqueue finalize; หรือใช้ Redis lock ต่อ orchestration. กติกานี้ควรเขียนลง §5 ให้ชัด.

### 4.6 [P1] Cancel/timeout แบบ "ระหว่าง step" ไม่พอ — ความถูกต้อง/ต้นทุน

§4 บอก cancel เช็ค"ระหว่าง step". แต่ LLM call หรือ tool ที่ค้างนานจะ **ยกเลิกกลางคันไม่ได้** และกินเวลา/เงินต่อ.

ข้อเสนอ: เพิ่ม **timeout ต่อ step** (LLM และ tool แยกกัน) + ยกเลิก task จริงเมื่อเกิน; เพิ่ม **max wallclock ต่อ run**.
ระบุค่า default ใน `config.py` (มีแพตเทิร์น compare_* เป็นแบบอย่างดีอยู่แล้ว).

### 4.7 [P1] Data integrity — ยังไม่มี FK/cascade

`Document.owner_id` เป็น `UUID` เปล่า **ไม่มี ForeignKey** ไป `users` (ดู `models.py`/`0001_init`). ตารางที่วางแผน
(`runs.parent_run_id`, `subtasks.deps[]`, `child_run_id`, ฯลฯ) มีความสัมพันธ์ซับซ้อนกว่า ถ้าไม่ตั้ง FK + `ON DELETE`
จะเกิด orphan rows และ worklog ชี้ run ที่หายไป.

ข้อเสนอ: นิยาม FK + นโยบาย cascade/`SET NULL` ให้ครบในตารางใหม่; พิจารณา self-FK ของ `runs.parent_run_id`
และ index บน `(run_id, seq)` ของ `run_steps`, `(orch_run_id)` ของ `subtasks`. `deps[]` ที่เป็น array อ้าง subtask
ภายในเดียวกัน — ควรมี check/validation เพราะ FK array บังคับยาก.

### 4.8 [P2] Observability ของ agent loop — ยังไม่ถูกพูดถึงเลย

พิมพ์เขียวไม่มีส่วน tracing/metrics/logging. ระบบ multi-agent ที่ fan-out จะ **ดีบักยากมากถ้าไม่มี trace**
(run ไหนเรียก tool อะไร ใช้ token เท่าไร ใช้เวลาตรงไหน).

ข้อเสนอ: เพิ่มส่วน "Observability" — `run_id`/`parent_run_id` เป็น correlation id ใน log ทุกบรรทัด,
นับ metric ต่อ provider/tool (latency, tokens, error rate), และพิจารณา OpenTelemetry รอบ agent loop. `run_steps`
ให้ trace เชิงธุรกิจอยู่แล้ว ขาดแค่ระดับ infra.

### 4.9 [P2] ต้นทุน/rate-limit ต่อผู้ให้บริการ LLM — ยังไม่ถูกพูดถึง

ทั้ง deep-compare และ agent loop เป็นงาน fan-out. ถ้าไม่มี **global rate-limit ต่อ provider** จะชน 429/โดน throttle
หรือบิลพุ่ง. ข้อเสนอ: เพิ่ม token-bucket ต่อ provider ใน Redis + backoff ใน adapter; กำหนด concurrency ceiling
ระดับแพลตฟอร์ม (มีแพตเทิร์น `compare_max_concurrency` ให้ลอกได้).

---

## 5. Decision ที่ควรทบทวน (challenge decision log)

| Decision เดิม | ความเห็น | ข้อเสนอ |
|---|---|---|
| `documents.embedding vector(1536)` | hardcode มิติของ OpenAI text-embedding — **ขัดกับจุดยืน multi-provider** (local/ผู้ขายอื่นมิติต่างกัน) | เก็บ `embedding_model` + `dim` ต่อแถว; หรือเลือก dim เดียวแล้ว normalize ทุก provider เข้าห่ามัน; ระบุเหตุผลใน §8 |
| Streaming = "per-step events" | เหมาะตอนนี้ แต่ UX worklog แบบ live ผู้ใช้จะอยากเห็น token ไหล | คงไว้ก่อน แต่ออกแบบ event schema ให้ **เผื่อ token-delta** ภายหลังโดยไม่ต้อง breaking change |
| arq at-least-once | ถูกต้องสำหรับ throughput แต่ชนกับ §4.1 (side-effect) | ระบุชัดว่า delivery เป็น at-least-once และผูกกับนโยบาย idempotency tool |
| "HERMES multi-agent ตั้งแต่ต้น" | เห็นด้วยเชิงผลิตภัณฑ์ แต่เพิ่มความซับซ้อน race (§4.5) | เริ่มด้วย DAG ที่จำกัด fan-out/ความลึก + นโยบาย failure ก่อนเปิดกว้าง |
| Stub LLM ในงานข้อ 1 | ดีมาก (แยกความเสี่ยง engine ออกจาก provider) | คงไว้ และเพิ่ม "stub tool" ที่จำลอง side-effect เพื่อทดสอบ resume (§4.1) แต่ต้น |
| RBAC ไว้ท้าย build order (§11 ข้อ 6) | เสี่ยง — endpoint เขียนข้อมูลมาก่อน | ดัน RBAC server-side มาก่อน endpoint เขียนตัวแรก (§4.2) |

---

## 6. เรื่องที่พิมพ์เขียวยังไม่กล่าวถึงเลย (ควรเพิ่มหัวข้อ)

1. **Secrets management** — §9/§12 ตั้งคำถามเรื่อง API key แต่ยังไม่มีคำตอบ. ตอนนี้ `jwt_secret` default เป็น
   `"change-me-in-.env"` และ `cookie_secure=False`. ต้องมีเช็คลิสต์ prod (บังคับ secret จริง, cookie secure,
   ที่เก็บ provider key ไม่อยู่ใน prompt).
2. **Idempotency keys ระดับ API** — `POST /quests/{id}/dispatch` ควรรับ idempotency key กัน dispatch ซ้ำจากการกดรัว/รีไทร.
3. **กลยุทธ์ทดสอบ worker async** — `tests/` ปัจจุบันยิง live server (ดีสำหรับ routers) แต่ agent loop/HERMES
   ต้องการ test harness ที่รัน arq job ตรงๆ + fake provider + assert `run_steps`. ควรเขียนแนวทางไว้.
4. **Migration ของ RBAC จาก client → server** — ข้อมูล seed อยู่ใน `data-users.jsx`; ต้องมีแผนย้ายให้ค่าตรงกัน
   (สังเกต seed email เป็น `@guildos.io` ของเดิม — ระวัง drift ระหว่าง frontend slug `u_<username>` กับ server).
5. **Backpressure/ขนาด event** — ถ้า tool คืนผลใหญ่ (เช่น HTML จาก compare/render สูงสุด ~1.5MB) อย่ายัดลง WS/`run_steps`
   ทั้งก้อน — เก็บลง MinIO แล้วอ้าง object key.
6. **Multi-tenancy/isolation** — ปัจจุบันยังไม่มีแนวคิด workspace/tenant; ถ้าจะมีหลายองค์กร ควรตัดสินใจ scope
   ของ agents/quests/documents ต่อ tenant ตั้งแต่ออกแบบ schema.

---

## 7. ข้อเสนอแนะแบบจัดลำดับ

**P0 — แก้/ตัดสินใจก่อนเขียน engine แม้แต่บรรทัดแรก**
- เขียนนโยบาย **idempotency ของ tool + resume 2 เฟส** ลง §4 (4.1).
- ดัน **RBAC server-side** (`require_perm`) มาก่อน endpoint เขียนข้อมูลตัวแรก (4.2).
- รีแฟกเตอร์ **WS เป็น per-quest + authz + token ไม่อยู่ใน URL** ก่อนต่อ feature WS ใดๆ (4.3).

**P1 — ออกแบบให้ครบตอนวาง schema/loop**
- Atomic quota reservation (4.4) · atomic HERMES transition กัน double-finalize (4.5) ·
  timeout ต่อ step/run (4.6) · FK + index + cascade ในตารางใหม่ (4.7).

**P2 — เพิ่มก่อนขึ้น production**
- Observability/tracing รอบ agent loop (4.8) · global rate-limit ต่อ provider (4.9) ·
  decouple embedding dim จาก provider (§5) · prod secrets checklist (§6.1).

**Quick wins (ทำได้ทันที ต้นทุนต่ำ)**
- เพิ่มคอลัมน์สถานะ "ออกแบบแต่ยังไม่มี dependency" ใน `system-design.md` (§3).
- ตั้ง `cookie_secure=True` ผ่าน env ใน prod และเพิ่ม assert ว่า `jwt_secret != "change-me-in-.env"` ตอน boot ใน `environment=production`.
- เพิ่ม `ForeignKey` ให้ `documents.owner_id` ใน migration ถัดไป (ปิดหนี้ integrity ตั้งแต่ตารางยังว่าง).

---

## 8. สรุป

พิมพ์เขียวแข็งแรงพอจะลงมือได้เลย — ตัวเลือกเทคโนโลยีเหมาะสมและมีเหตุผลรองรับ. งานที่ควรทำต่อ **ไม่ใช่การรื้อ design
แต่คือการอุดความเสี่ยงเชิงปฏิบัติ 3 จุด (resume/side-effect, RBAC server-side, WS isolation) ก่อนเริ่มสร้าง engine**
และเพิ่มหัวข้อที่ยังขาด (observability, rate-limit, secrets, idempotency). ทำตามลำดับ P0 → P1 → P2 จะได้ระบบที่
**ถูกต้องและปลอดภัยตั้งแต่ commit แรกของ engine** แทนที่จะตามแก้ทีหลังเมื่อมันรันเงินจริงและข้อมูลจริงแล้ว.

> ขั้นถัดไปที่แนะนำ: ถ้าเห็นด้วยกับ P0 ทั้งสามข้อ ผมช่วยร่าง **มาตรา §4.1 (idempotency/resume) และ §6 (WS)
> เวอร์ชันปรับปรุง** เพื่อแก้กลับเข้า `system-design.md` ได้เลย.
