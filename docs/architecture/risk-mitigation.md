# PiKaOs — Risk Mitigation Design (แนวทางลบความเสี่ยง)

> เอกสารออกแบบ (design) ตอบความเสี่ยงทุกข้อใน [`design-review.md`](design-review.md) —
> อ่านคู่กับ [`system-design.md`](system-design.md) (พิมพ์เขียวเป้าหมาย).
> ทุกข้อเสนออ้างโค้ดจริง ณ 2026-06-12. ครอบคลุม **P0 → P1 → P2 + quick wins**
> และจบด้วย build order ฉบับปรับแล้ว (§7).

---

## Current Understanding

- Engine (arq + `runs`/`run_steps`/`subtasks` + HERMES) **ยังไม่มีโค้ด** — ทุก design ในเอกสารนี้
  จึง "ออกแบบให้ถูกตั้งแต่ migration แรก" ได้โดยไม่ต้อง refactor ของเดิม.
- ของจริงที่มี: Auth (JWT+refresh), Compare, WS scaffold ช่องเดียว (`pikaos:ws`, token ใน query string),
  `require_role` หยาบใน `deps.py`, ตาราง `users`+`documents` (ไม่มี FK), สิทธิ์ละเอียด 25 ข้อ
  อยู่ฝั่ง client (`data-users.jsx`).
- arq เป็น **at-least-once** — ทุก design ด้านล่างตั้งอยู่บนสมมติฐานนี้ (job อาจรันซ้ำได้เสมอ).

---

## 1. [P0] Tool idempotency + 2-phase resume (review §4.1)

### Observation
พิมพ์เขียวบอก "steps are idempotent" แต่ tool ที่มี side-effect (HTTP POST, LINE, CMD) ไม่ใช่ —
worker ล่มหลังยิง tool แต่ก่อน persist ผล → resume แล้ว **ยิงซ้ำ**.

### Recommendation — เขียน step แบบ 2 เฟส + จัดประเภท tool

**(ก) Schema** — เพิ่มใน `run_steps`:

| คอลัมน์ | ความหมาย |
|---|---|
| `status` | `pending` \| `done` \| `failed` (LLM step เขียนทีเดียวเป็น `done`; tool step เริ่มที่ `pending`) |
| `idempotency_key` | `"{run_id}:{seq}"` — deterministic, สร้างก่อนยิง tool |

**(ข) จัดประเภท tool** — เพิ่ม `effect` ใน `tools_config.config`:

| effect | ตัวอย่าง | นโยบาย resume |
|---|---|---|
| `read` | HTTP GET, ค้น codex, อ่านไฟล์ | ยิงซ้ำได้เลย |
| `idempotent_write` | PUT/upsert, เขียนไฟล์ทับ key เดิม | ยิงซ้ำได้ + แนบ `idempotency_key` ให้ provider ที่รองรับ |
| `side_effect` | POST จ่ายเงิน, ส่ง LINE/Telegram, รัน CMD | **at-most-once** — ห้าม retry อัตโนมัติ |

**(ค) ลำดับการรัน tool step (2 เฟส)**

```
1. INSERT run_steps (kind='tool', status='pending', idempotency_key, content={intent})  ← ก่อนลงมือ
2. ยิง tool
3. UPDATE step → status='done', content+={result}   แล้วค่อย publish event
```

**(ง) Resume algorithm** (ตอน worker เปิด run ที่ค้าง `running`):

```
step สุดท้าย = done            → ต่อ loop ตามปกติ
step สุดท้าย = pending, effect=read|idempotent_write → ยิงใหม่ด้วย key เดิม
step สุดท้าย = pending, effect=side_effect           → run.status='waiting_input'
   + notification "tool X อาจรันไปแล้ว — ยืนยันผล/สั่งข้าม/สั่งยิงใหม่" (human-in-the-loop เดิมตาม §4 ของพิมพ์เขียว)
```

**(จ) ทดสอบแต่ต้น** — งานข้อ 1 ของ build order (stub LLM) ให้เพิ่ม **stub tool จำลอง side-effect**
(เขียนแถวลง table ทดสอบ) + test ฆ่า worker กลาง step แล้ว assert ว่า resume ไม่เขียนซ้ำ.

### Alternative Options
- **Temporal/Durable execution** — exactly-once ระดับ framework. Overkill ตอนนี้ (ตรง decision log เดิม).
- **Transactional outbox** — เขียน intent + งานใน transaction เดียว. ดีขึ้นอีกขั้น แต่ 2 เฟส + จัดประเภทพอสำหรับสเกลนี้.

### Pros / Cons
- ➕ แก้ความถูกต้องของระบบด้วย schema 2 คอลัมน์ + กติกา 1 หน้า; ใช้ Postgres ที่มีอยู่.
- ➖ tool side_effect ที่ค้างต้องรอคนยืนยัน (ช้าลง) — เป็น trade-off ที่ถูกต้องสำหรับเงิน/ข้อความจริง.

### Impact
เปลี่ยน §4 invariant จาก "steps are idempotent" → "steps are **replay-safe**: LLM ยิงซ้ำได้,
tool ตัดสินตาม effect class". ต้องเขียนนโยบายนี้กลับเข้า `system-design.md` §4 ก่อนเริ่มโค้ด engine.

---

## 2. [P0] RBAC server-side (review §4.2)

### Observation
`deps.py:require_role(*roles)` เทียบ `user.role` เดี่ยว; สิทธิ์ละเอียด 25 ข้อ (`agent.create` …
`audit.view`) อยู่ใน `data-users.jsx` ฝั่ง client เท่านั้น → เรียก API ตรงข้ามได้หมด.

### Recommendation — ย้าย permission model ขึ้น server **ก่อน endpoint เขียนข้อมูลตัวแรก**

**(ก) ตาราง** (migration เดียว): `roles(key PK, name_th, name_en, system)` ·
`permissions(key PK, grp)` · `role_perms(role_key FK, perm_key FK)` ·
`user_perms(user_id FK, perm_key FK, allow bool)` — override รายคนแบบ allow/deny ตรงกับ
`USER_PERMS_SEED` ฝั่ง client. Seed จากค่าใน `data-users.jsx` ผ่าน `scripts/seed.py` (idempotent ตามแพตเทิร์นเดิม).

**(ข) Dependency**:

```python
def require_perm(perm: str):
    async def _checker(user = Depends(get_current_user), db = Depends(get_db)):
        if perm not in await get_effective_perms(db, user):   # role_perms ∪ allow − deny
            raise HTTPException(403, f"missing permission: {perm}")
        return user
    return _checker
# ใช้: @router.post("/agents", dependencies=[Depends(require_perm("agent.create"))])
```

**(ค) Effective perms** cache ใน Redis `perms:<user_id>` (TTL สั้น เช่น 60s) + ลบ key เมื่อแก้
role/override — แลกความสดใหม่กับการไม่ join 3 ตารางทุก request.

**(ง) `/api/auth/me`** คืน `permissions: [...]` — frontend เลิกคำนวณเองจาก seed, เหลือแค่ render
ตามชุดที่ server ส่งมา (ค่อยลบ `resolvePerms` ฝั่ง client เมื่อย้ายเสร็จ). ระวัง drift ที่ review §6.4 ชี้:
seed email ฝั่ง client เป็น `@guildos.io` — ให้ server เป็น source of truth, map ด้วย `username`.

### Alternative Options
- **Casbin / OPA** — engine นโยบายภายนอก. เกินจำเป็น: โมเดลคือ role→perms + override ตรงๆ.
- **ยัด perms ลง JWT** — ลด query แต่สิทธิ์ค้างจน token หมดอายุ + token บวม. ใช้ DB+cache ดีกว่า.

### Pros / Cons
- ➕ ปิดช่องโหว่ก่อนมี endpoint จริง; โมเดลตรงกับ UI ที่ออกแบบไว้แล้ว 1:1; ไม่มี dependency ใหม่.
- ➖ เพิ่มงานก่อนได้ feature (1 migration + 1 dependency + seed) — ราคาถูกกว่าตามแก้ทีหลังมาก.

### Impact
ย้าย §10 ของพิมพ์เขียวจากท้าย build order มาเป็น **ขั้นตอน 0** (ดู §7). ทุก endpoint ใหม่หลังจากนี้
ประกาศสิทธิ์ของตัวเองด้วย `require_perm` — กลายเป็นกติกาใน CLAUDE.md §2.2 (recipe เพิ่ม endpoint).

---

## 3. [P0] WebSocket: per-quest channel + authz + token ไม่อยู่ใน URL (review §4.3)

### Observation
`ws.py` ตอนนี้ subscribe ช่องเดียว `pikaos:ws` แล้ว relay ทุกข้อความให้ทุก client ที่ล็อกอิน
(ผู้ใช้ A เห็นของ B) และรับ token ทาง `?token=...` ซึ่งติด log ของ proxy.

### Recommendation — refactor เป็น subscribe-protocol เดียวจบ

**(ก) Handshake** — เปิด `/ws` โดยไม่มี token ใน URL; **ข้อความแรก** ต้องเป็น
`{"type":"auth","token":"<access JWT>"}` ภายใน 5s ไม่งั้นปิด 4401. (ทางเลือก: ส่งผ่าน
`Sec-WebSocket-Protocol` — แต่ first-message ง่ายกว่าและไม่ชน proxy.)

**(ข) Subscribe + authorize**:

```
client → {"type":"subscribe","quest_id":"..."}
server → ตรวจสิทธิ์: user เป็น owner/สมาชิก room ของ quest (หรือมี perm "quest.view.any")
       → ผ่าน: subscribe Redis "quest:<id>" + ตอบ {"type":"subscribed","quest_id",...}
       → ไม่ผ่าน: {"type":"error","code":4403}
```
หนึ่ง socket subscribe หลาย quest ได้ (เก็บ set ต่อ connection); `unsubscribe` ปลด channel.

**(ค) History replay + gap detection** — ทุก event ที่ publish มี `(run_id, seq)`.
ตอน `subscribed` server ส่ง snapshot: `run_steps` ล่าสุด N แถวจาก Postgres (เรียง `seq`).
client เห็น seq กระโดด → ขอ `{"type":"backfill","run_id","from_seq"}`. ทำให้เปิดหน้ากลางคัน
timeline ไม่หาย และทนทั้ง WS หลุด/reconnect.

**(ง) Payload ใหญ่** (review §6.5) — event บน WS จำกัด ~32KB; ผล tool ใหญ่เก็บ MinIO
แล้วใส่ `object_key` ใน event แทนเนื้อ.

### Alternative Options
- **SSE แทน WS** — ง่ายกว่าเรื่อง auth header แต่ทางเดียว; human-in-the-loop ต้องการสองทาง → คง WS.
- **Ticket แบบใช้ครั้งเดียว** (`POST /ws-ticket` → ticket อายุ 30s ใน URL) — ใช้ได้ถ้า client
  ส่ง first-message ไม่สะดวก; เป็น fallback ที่ยอมรับได้.

### Pros / Cons
- ➕ ปิดทั้งการรั่วข้ามผู้ใช้และ token-in-URL ในการ refactor เดียว; ตรง §6 ของพิมพ์เขียวอยู่แล้ว แค่เพิ่ม authz+replay.
- ➖ client (`Frontend/src/lib/`) ต้องเขียน WS helper ใหม่ (auth→subscribe→backfill) — งานฝั่งหน้าเว็บเพิ่ม.

### Impact
ต้องทำ **ก่อน** publish event แรกจาก engine — ไม่งั้น feature แรกที่ขึ้น WS คือ feature ที่รั่ว.
แก้ `ws.py` ตอนนี้กระทบศูนย์เพราะยังไม่มี consumer จริง.

---

## 4. [P1] ความถูกต้องของ engine — ออกแบบพร้อม schema แรก

### 4.1 Quota race (review §4.4)
**Recommendation**: บังคับที่ Postgres ด้วย conditional update —
`UPDATE users SET used = used + :n WHERE id=:uid AND (quota IS NULL OR used + :n <= quota) RETURNING used`
ได้ 0 แถว → quota เกิน → run จบ `failed("quota_exceeded")`. เรียก **ก่อน** LLM call ด้วยค่าประมาณ
แล้ว reconcile ด้วยยอดจริงหลังจบ step (บวก/ลบส่วนต่าง).
*Alternative*: จองใน Redis `DECRBY` — เร็วกว่าแต่เพิ่ม source of truth ที่สอง; เริ่มที่ Postgres พอ
(จำนวน run พร้อมกันต่อ user ยังน้อย). *Impact*: กันลูก HERMES หลายตัวเจาะโควตาทะลุ.

### 4.2 Double-finalize ของ HERMES (review §4.5)
**Recommendation**: transition เป็น atomic —
`UPDATE runs SET status='finalizing' WHERE id=:orch AND status='running' RETURNING id`
เฉพาะ `hermes_advance` ที่ได้แถวกลับเท่านั้นที่ enqueue `hermes_finalize`. เขียนกติกานี้ลง §5
ของพิมพ์เขียว. *Alternative*: Redis lock ต่อ orchestration — ชิ้นส่วนเพิ่มโดยไม่จำเป็น เพราะแถว `runs`
เป็น lock ธรรมชาติอยู่แล้ว. *Impact*: ลูกหลายตัวจบพร้อมกัน → finalize ครั้งเดียวเสมอ.

### 4.3 Timeout ต่อ step / ต่อ run (review §4.6)
**Recommendation**: เพิ่มใน `config.py` (ตามแพตเทิร์น `compare_*` เดิม):

```python
run_llm_step_timeout_s: float = 120.0    # ต่อ LLM call
run_tool_step_timeout_s: float = 60.0    # ต่อ tool call (tool ระบุ override ใน config ได้)
run_max_wallclock_s: int = 3600          # ทั้ง run
run_max_steps: int = 50
```
ห่อ step ด้วย `asyncio.timeout`; หมดเวลา → step `failed("timeout")` (tool ค้างถือเป็น `pending`
ที่ไม่มีผล → เข้านโยบาย §1ง). cancel เช็คทั้งระหว่าง step **และ** ผ่าน task cancellation ระหว่าง LLM stream.
*Impact*: run ค้างไม่กินเงิน/เวลาไม่จำกัด; cancel ตอบสนองเร็วขึ้นจากระดับ step → ระดับวินาที.

### 4.4 FK + index + cascade (review §4.7)
**Recommendation** — นิยามใน migration ของตาราง engine ชุดแรกเลย:

| FK | นโยบาย |
|---|---|
| `documents.owner_id → users` | `SET NULL` (ปิดหนี้เดิม — ตารางยังว่าง ทำตอนนี้ฟรี) |
| `runs.parent_run_id → runs` (self) | `CASCADE` (ลบ orchestration → ลูกหาย) |
| `runs.agent_id / quest_id` | `SET NULL` (run เป็นประวัติ อย่าหายตาม agent) |
| `run_steps.run_id → runs` | `CASCADE` + **UNIQUE(run_id, seq)** (กัน seq ชนตอน resume) |
| `subtasks.orch_run_id → runs` | `CASCADE`; `child_run_id` → `SET NULL` |
| `notifications.run_id → runs` | `SET NULL` |

Index: `run_steps(run_id, seq)` (ได้จาก UNIQUE) · `subtasks(orch_run_id)` · `runs(quest_id, status)` ·
`notifications(user_id, read)`. `subtasks.deps[]` บังคับด้วย FK ไม่ได้ → validate ใน `hermes_plan`
(ทุก dep ต้องเป็น subtask ใน orchestration เดียวกัน + ไม่มี cycle — ทำ topological check ตอนเขียน DAG).
*Impact*: ไม่มี orphan rows; replay/worklog ชี้ของที่มีจริงเสมอ.

---

## 5. [P2] ก่อนขึ้น production

### 5.1 Observability (review §4.8)
เพิ่มหัวข้อ "Observability" ใน `system-design.md`: log ทุกบรรทัดใน worker มี
`run_id`/`parent_run_id`/`quest_id` (structured logging — `logging` + JSON formatter พอ ยังไม่ต้อง OTel);
metric ต่อ provider/tool: latency, tokens, error rate (เริ่มจากตาราง `run_steps` ที่มี `tokens`+`created_at`
อยู่แล้ว — query ได้เลย ไม่ต้องมี stack ใหม่); ค่อยเพิ่ม OpenTelemetry เมื่อมีหลาย service จริง.

### 5.2 Rate-limit ต่อ LLM provider (review §4.9)
Token-bucket ใน Redis ต่อ provider (`ratelimit:openai` …) เช็คใน adapter ก่อนยิง + exponential backoff
เมื่อเจอ 429. เพิ่ม `llm_max_concurrency_per_provider` ใน config (ลอกแพตเทิร์น `compare_max_concurrency`).
HERMES จำกัด fan-out: `hermes_max_children: int = 10`, `hermes_max_depth: int = 1` (ลูกไม่ spawn หลานในเฟสแรก
— ตรง review §5 ที่แนะให้จำกัด DAG ก่อนเปิดกว้าง).

### 5.3 Embedding dim (review §5)
เลิก hardcode `vector(1536)` ผูก OpenAI: เพิ่มคอลัมน์ `embedding_model: str` ใน `documents`
และเลือก **มิติเดียวของแพลตฟอร์ม** (เช่น 1024) แล้วให้ provider ที่รองรับ Matryoshka/dimension-reduce
ส่งมาที่มิตินั้น; provider ที่ลดมิติไม่ได้ → truncate+normalize ใน pipeline. บันทึกเหตุผลใน §8 ของพิมพ์เขียว.
ทำ **ก่อน** ingest เอกสารจริง — เปลี่ยนมิติทีหลังคือ re-embed ทั้งคลัง.

### 5.4 Secrets + prod checklist (review §6.1)
- Boot assert ใน `main.py`: `environment == "production"` → `jwt_secret` ต้องไม่ใช่ default,
  `cookie_secure=True`, `seed_password` ต้องไม่ใช่ `pikaos123`. ตายตั้งแต่ start ดีกว่ารั่วเงียบๆ.
- Provider API keys เป็น **platform-level ใน env** (`OPENAI_API_KEY`, `ANTHROPIC_API_KEY`,
  `LOCAL_LLM_BASE_URL`) อ่านผ่าน `config.settings` เท่านั้น (กติกาเดิมของ CLAUDE.md §2.1) —
  per-agent key เป็น ⚪ อนาคตเมื่อมี multi-tenant; **ห้ามอยู่ใน prompt/DB**.
- Idempotency key ระดับ API (review §6.2): `POST /quests/{id}/dispatch` รับ header
  `Idempotency-Key`; เก็บใน Redis `dispatch:<quest>:<key>` TTL 24h → คืน `run_id` เดิมแทน dispatch ซ้ำ.

---

## 6. Quick wins — ทำได้ทันที ไม่ต้องรอ engine

1. **`documents.owner_id` FK** — migration `0002` เพิ่ม ForeignKey (ตารางว่าง = ฟรี).
2. **Boot assert prod secrets** (§5.4) — ~10 บรรทัดใน `main.py`.
3. **คอลัมน์สถานะใน `system-design.md`** — ติดป้าย "🟡 designed, no dependency yet" ให้ arq/LLM SDK/RAG
   กันเข้าใจผิดว่าเหลือแค่ต่อสาย (review §3).
4. **แก้ `ws.py` ตาม §3** — ตอนนี้ไม่มี consumer จริง แก้ได้โดยกระทบศูนย์; ทำก่อนใครต่อ feature บน WS.

---

## 7. Build order ฉบับปรับแล้ว (แทน §11 เดิม)

| # | งาน | ลบความเสี่ยง |
|---|---|---|
| 0 | **RBAC server-side** (ตาราง+`require_perm`+seed+`/me`) + quick wins ข้อ 1–3 | §2, §6 |
| 1 | **WS refactor**: first-message auth · per-quest channel + authz · replay/backfill | §3 |
| 2 | **Engine core**: migration ตาราง engine (FK/index/UNIQUE ตาม §4.4) · arq worker ใน compose · loop กับ **stub LLM + stub side-effect tool** · 2-phase steps + resume (§1) · quota update (§4.1) · timeouts (§4.3) | §1, §4 |
| 3 | **LLM adapter** (OpenAI·Anthropic·Local) + rate-limit/backoff (§5.2) + boot assert keys | §5.2, §5.4 |
| 4 | **HERMES** จำกัด fan-out/depth + atomic finalize (§4.2) + dispatch idempotency key | §4.2, §5.4 |
| 5 | **Tools subsystem** — handler ตาม effect class (§1ข) + sandbox (ออกแบบ session แยกตามพิมพ์เขียว §9) | §1 |
| 6 | **RAG** — ตัดสินใจ embedding dim ก่อน ingest (§5.3) | §5.3 |
| 7 | **Observability** ขั้น structured logging ตั้งแต่ข้อ 2; metrics/OTel ก่อน prod | §5.1 |

หลักการเรียง: **ความปลอดภัย (0–1) มาก่อน feature; ความถูกต้องของ engine (2) ออกแบบลง schema แรก
ไม่ใช่ตามแก้; ของแพง (3–4) มาหลังมี harness ทดสอบจาก stub.**

### กลยุทธ์ทดสอบ worker (review §6.3)
test harness รัน arq job ตรงๆ (เรียก coroutine ของ job ใน pytest-asyncio ไม่ผ่าน queue) + fake LLM
provider (คืน script ของ tool_use/ข้อความตามลำดับที่กำหนด) + assert ลำดับ `run_steps` ใน DB.
เคสบังคับ: ฆ่ากลาง tool side_effect → resume ต้องเข้า `waiting_input` ไม่ยิงซ้ำ (§1จ);
ลูก 2 ตัวจบพร้อมกัน → finalize ครั้งเดียว (§4.2); quota พอดีเส้น → run ที่สองต้อง fail.

---

## 8. สิ่งที่ยังตัดสินใจไม่ได้จากเอกสารที่มี (ต้องการข้อมูล/เซสชันเพิ่ม)

- **Sandbox ของ CMD/PowerShell tool** — พิมพ์เขียว §9 ระบุ "designed in a later session" — ยังเป็นจริง;
  ต้องการ requirement ว่ารันบนเครื่องผู้ใช้ (Windows host) หรือใน container ฝั่ง server ก่อนจะออกแบบได้.
- **Multi-tenancy** (review §6.6) — ✅ **ตอบแล้ว (2026-06-12): องค์กรเดียว หลายแผนก** (ไม่ใช่ multi-org).
  แทน `workspace_id` ด้วย `department_id` เป็นมิติ scoping/visibility — ลงใน migration แรกของ engine
  (build order ข้อ 2). user↔dept = **many-to-many** (`user_departments`, 1 user หลายแผนก).
  Design: [system-design §7.1](system-design.md#71-department-scoping-).
- **นโยบาย retry/escalation ของ subtask ที่ fail ซ้ำ** (พิมพ์เขียว §12) — เริ่มที่ retry N=2 แล้ว
  finalize แบบ partial ตามพิมพ์เขียว แต่ค่าจริงควรยืนยันกับเจ้าของ product.

---

## Impact (ภาพรวม)

ทั้งหมดนี้ **ไม่รื้อ decision ใดในพิมพ์เขียว** — arq, step-persistence, reactive HERMES, multi-provider
adapter คงเดิมทุกข้อ. สิ่งที่เปลี่ยนคือ (1) ลำดับ build (ความปลอดภัยขึ้นก่อน), (2) invariant เรื่อง resume
ถูกนิยามใหม่ให้ตรงความจริงของ at-least-once, (3) schema แรกของ engine เกิดมาพร้อม FK/UNIQUE/timeout/quota
guard แทนที่จะตามเติม. ราคาที่จ่ายคือเริ่มเห็น feature ช้าลง ~2 ขั้น (งาน 0–1) แลกกับ engine ที่
ปลอดภัยและถูกต้องตั้งแต่ commit แรก — ถูกกว่าตามแก้ตอนมันรันเงินจริงหลายเท่า.

> ขั้นถัดไป: ถ้าเห็นด้วย ผม patch `system-design.md` (§4 invariant, §5 atomic finalize, §6 WS, §11 build order)
> ให้สอดคล้องกับเอกสารนี้ได้เลย — และตอบคำถาม multi-tenancy (§8) ก่อนเริ่มงานข้อ 2.
