# PiKaOs — Improvement Plan (แผนปรับปรุงระบบเดิม → ระบบจริง)

> แผนแม่บทยกระดับ PiKaOs จาก "UI สมบูรณ์ + backend auth" → "agent-ops platform ที่รันจริง
> ปลอดภัย ทดสอบได้ และดูแลต่อได้". แบ่งเป็น **เฟส A–F** แต่ละเฟสมีเป้าหมาย / งาน / เกณฑ์ตรวจรับ
> ชัดเจน — จบเฟสแล้วระบบต้อง "ดีขึ้นและใช้ได้จริง" ทุกครั้ง ไม่มีสภาวะครึ่งๆ กลางๆ.
> อ้างอิง: [`system-design.md`](../architecture/system-design.md) (สถาปัตยกรรม + build order §11) ·
> [`risk-mitigation.md`](../architecture/risk-mitigation.md) (design แก้ความเสี่ยง) · [`tech-stack.md`](../architecture/tech-stack.md).
> ไม่ประเมินเป็นวัน/สัปดาห์ — ยังไม่ทราบขนาดทีม; เรียงเป็นลำดับพึ่งพา (dependency order) แทน.

---

## ภาพรวมเฟส

```
A. Hardening & รากฐาน ──▶ B. Engine core ──▶ C. HERMES + Tools ──▶ D. ย้ายข้อมูล F→B
   (ทำได้ทันที)             (stub LLM)          (multi-agent จริง)      (เลิก localStorage)
                                  └────────────▶ E. Knowledge/RAG ─┐
                                                                    ▼
                                                  F. Production readiness
```

กติกาคุมทุกเฟส: ทุก endpoint ใหม่ประกาศ `require_perm` ตั้งแต่เกิด (หลังเฟส A) ·
schema ใหม่มาพร้อม FK/index ([risk-mitigation §4.4](../architecture/risk-mitigation.md)) ·
อัปเดต docs ใน commit เดียวกับโครงสร้างที่เปลี่ยน (CLAUDE.md §6.7).

---

## เฟส A — Hardening & รากฐาน (เริ่มได้ทันที ไม่พึ่งอะไร)

**เป้าหมาย**: ปิดช่องโหว่ที่รู้แล้วทั้งหมด + วางเครื่องมือคุณภาพ ก่อนเขียน engine บรรทัดแรก.

| # | งาน | อ้างอิง |
|---|---|---|
| A1 | ✅ **เสร็จ (2026-06-15)** RBAC server-side: ตาราง `roles/permissions/role_perms/user_perms` (migration `0002_rbac`) + seed จาก `data-users.jsx` + `deps.require_perm` + `rbac_service` (effective perms + Redis cache `perms:<id>`) + `/me`/login คืน `permissions[]` · `tests/test_rbac.py` (8 passed) | risk-mitigation §2 |
| A2 | 🟡 **บางส่วน (2026-06-16)** first-message auth (token ออกจาก URL) ✅ + per-user channel (เลิก global cross-user leak) ✅ + subscribe/unsubscribe protocol ✅ · `tests/test_ws.py` (6) · **per-quest authz + run_steps snapshot/backfill เลื่อนเฟส B** (ต้องมีตาราง quests/run_steps) | risk-mitigation §3 |
| A3 | ✅ **เสร็จ (2026-06-16)** Migration `0003_documents_owner_fk`: FK `documents.owner_id → users` **ON DELETE SET NULL** + index `ix_documents_owner_id` (ตารางว่าง = ฟรี) · ยืนยันด้วย `\d documents` + 74 tests เขียว | risk-mitigation §4.4 |
| A4 | ✅ **เสร็จ (2026-06-15)** Boot asserts (prod): jwt_secret/cookie_secure/seed_password/minio_secret ≠ default → ตายตอนบูต (`config.production_violations` + `main.lifespan`, `tests/test_config.py`) | risk-mitigation §5.4 |
| A5 | ✅ **เสร็จ (2026-06-16)** Pin `minio` (digest) · `passlib` → `argon2-cffi==25.1.0` ใน `security.py` — hash argon2id เดิม verify ผ่าน (login 6 user เดิมโอเค, 80 tests เขียว, crypt deprecation warning หายแล้ว) | tech-stack §3.1–3.2 |
| A6 | ✅ **เสร็จ (2026-06-16)** CI `.github/workflows/ci.yml`: frontend `npm run lint` (`eslint.config.js` — react-hooks rules-of-hooks=error, ที่เหลือ warn; ผ่าน 0 errors) + `npm run build` + component-first grep · backend `docker compose up` + `pytest`. รัน Actions จริงตอน push | tech-stack §3.3–3.4 |
| A7 | ✅ **เสร็จ (2026-06-15)** SSRF guard: `net_guard.py` (บล็อก private/loopback + allowlist + httpx hook) ผูกกับ compare/audit · `tests/test_net_guard.py` | compare-hardening §1–2 |
| A8 | **Process model + กันล้ม (เพิ่ม 2026-06-16)**: รัน API หลาย worker (`gunicorn -k uvicorn.workers.UvicornWorker -w N` หรือ `uvicorn --workers`) + `restart: unless-stopped` ทุก service ใน compose — 1 request พิษ/leak ไม่ลากทั้ง API ตาย | — |
| A9 | **Graceful degradation (เพิ่ม 2026-06-16)**: Redis ล่ม → perms อ่าน DB ตรง (ข้าม cache); MinIO ล่ม → เฉพาะ feature ไฟล์ error ไม่ใช่ 500 ทั้งระบบ — ใส่ timeout + try/catch ต่อ dependency ใน `redis_client`/`storage` | — |

> **คอขวดจริงคือ I/O ไม่ใช่ CPU** (ประเมิน 2026-06-16): "เร็วกว่า" = ขนานงาน I/O + ปลด blocking
> ไม่ใช่ optimize อัลกอริทึม (BE มีงาน CPU แค่ argon2 ซึ่งห้ามเร่ง). ของหนักจริง (LLM/engine) แยกเป็น
> **arq worker** ตั้งแต่เกิด → ดูเฟส B (B2); A8/A9 คือกันล้มของ API เดิมที่ทำได้ทันที **โดยไม่แตก
> microservices** (over-engineer สำหรับองค์กรเดียว — ดู §7.1 single org/many depts).

**เกณฑ์ตรวจรับ (Definition of Done)**
- เรียก API เขียนข้อมูลโดยไม่มี perm → 403 พร้อม `missing permission: <key>` (test ครอบ).
- ผู้ใช้ B subscribe quest ของ A ที่ตนไม่มีสิทธิ์ → 4403; token ไม่ปรากฏใน access log ของ proxy.
- `pytest` เขียว + CI เขียวบน PR; boot ด้วย `ENVIRONMENT=production` + secret default → ตายทันทีพร้อมข้อความชัด.
- Login เดิมทั้ง 6 user ใช้ได้ต่อ (hash argon2id เดิม verify ผ่าน lib ใหม่).
- (A8/A9) `docker compose stop redis` แล้ว login ที่ token ยังไม่หมดอายุ ยังเรียก API อ่านได้ (perms fallback DB);
  ฆ่า 1 worker ระหว่างมี request → request อื่นไม่ร่วง.

**ความเสี่ยงของเฟส**: RBAC seed ฝั่ง client/server ไม่ตรงกัน (email `@guildos.io` เดิม) —
กำหนดให้ **server เป็น source of truth, map ด้วย `username`** ตั้งแต่ A1.

---

## เฟส B — Engine core (stub LLM — ยังไม่จ่ายเงินจริง)

**เป้าหมาย**: โครง engine ที่ถูกต้องครบ (queue, persistence, resume, quota, timeout) พิสูจน์ด้วย stub
ก่อนต่อ LLM จริง — แยก "ความเสี่ยง engine" ออกจาก "ความเสี่ยง provider".

| # | งาน |
|---|---|
| B1 | ✅ **เสร็จ (2026-06-16)** Migration `0004_engine` + ORM models: `departments` + `user_departments` (m:n) + `agents/rooms/quests/runs/run_steps/subtasks/tools_config/notifications` + `documents.department_id`. FK/UNIQUE/index ตาม §4.4 (run_steps UNIQUE(run_id,seq)+CASCADE · runs self-FK CASCADE · agent/quest/room/dept SET NULL) — ยืนยันด้วย `\d` + 81 tests. **Seed แผนก/CRUD ไว้เฟส D.** [system-design §7.1](../architecture/system-design.md#71-department-scoping-) |
| B2 | ✅ **เสร็จ (2026-06-16)** `worker` service ใน compose (image เดิม, `command: arq app.worker.WorkerSettings`, restart: unless-stopped) + `app/worker.py` (WorkerSettings + `ping` job) · `arq==0.28.0` · ยืนยัน enqueue→worker→result=`pong` + 81 tests |
| B3 | `agent_runner.run` loop: 2-phase tool steps + effect class + resume + atomic quota + per-step timeout (config ใหม่ใน `config.py`) |
| B4 | **Stub LLM provider** (script ตอบตามลำดับ) + **stub side-effect tool** (เขียนแถว table ทดสอบ) |
| B5 | Per-step event → Redis `quest:<id>` → WS (ต่อกับ A2) — worklog timeline ขึ้นจอจริง |
| B6 | Test harness worker: รัน job ตรงใน pytest-asyncio + assert ลำดับ `run_steps` |
| B7 | Structured logging: ทุกบรรทัดใน worker มี `run_id`/`parent_run_id`/`quest_id` |

**เกณฑ์ตรวจรับ**
- ฆ่า worker กลาง side-effect tool → resume เข้า `waiting_input` **ไม่ยิงซ้ำ** (test B6 บังคับ).
- ฆ่า worker กลาง LLM step → resume ต่อจาก step ล่าสุดได้ conversation เดิม.
- user quota พอดีเส้น: run ที่สอง fail `quota_exceeded`; ยอด `used` ตรงกับผลรวม `run_steps.tokens`.
- เปิดหน้า quest กลางคัน → timeline ครบ (snapshot + backfill ทำงาน).
- Cancel run ระหว่าง LLM stream → จบใน < 5s.

---

## เฟส C — HERMES + LLM จริง + Tools

**เป้าหมาย**: multi-agent จริง provider จริง ภายใต้เพดานที่คุมได้.

| # | งาน |
|---|---|
| C1 | LLM adapter จริง: OpenAI · Anthropic · Local (ตรวจ SDK เวอร์ชัน ณ วันทำ) + normalize tool-use + streaming |
| C2 | Rate-limit ต่อ provider (Redis token-bucket) + backoff + `llm_max_concurrency_per_provider` |
| C3 | `hermes_plan/advance/finalize`: DAG validate (acyclic, in-orch) + cap children/depth + atomic finalize |
| C4 | `POST /quests/{id}/dispatch` + `Idempotency-Key` + brief doc ต่อ subtask |
| C5 | Tools subsystem เฟสแรก: HTTP API + Webhook (effect class บังคับใน config) — **เลื่อน CMD/PowerShell ไปหลังออกแบบ sandbox** (system-design §9) |
| C6 | Human-in-the-loop: `waiting_input` → notification card → ตอบแล้ว resume |

**เกณฑ์ตรวจรับ**
- Quest จริง 1 ใบ → HERMES แตก ≥2 subtasks ข้าม agent ≥2 ตัว → finalize สังเคราะห์ผล — ดูได้สดบน UI.
- ลูก 2 ตัวจบพร้อมกัน (test จำลอง) → finalize **ครั้งเดียว**.
- ปิด provider หนึ่ง (mock 429) → backoff ทำงาน, ไม่มี run fail เพราะ rate-limit ภายใน N retry.
- กดรัว dispatch 5 ครั้ง + key เดิม → run เดียว.

**ความเสี่ยง**: ต้นทุน LLM ระหว่าง dev — ตั้ง quota ต่ำให้ dev users + ใช้ local model (Ollama) เป็น default ใน dev.

---

## เฟส D — ย้ายข้อมูล Frontend → Backend (เลิกพึ่ง localStorage)

**เป้าหมาย**: ของจริงทั้งหมด (agents, rooms, quests, workflows, RBAC UI) อ่าน/เขียนผ่าน API —
localStorage เหลือแค่ cache/preference. *เริ่มได้ขนานกับ C หลัง B1 เสร็จ (ตารางมีแล้ว).*

| # | งาน |
|---|---|
| D1 | CRUD `agents/rooms/quests` (router→service→repo ตาม CLAUDE.md §2.1–2.2, ทุกตัวมี `require_perm`) |
| D2 | Frontend: เปลี่ยน `data.jsx`/`office-data.jsx` loaders → `api.js` (จอเดิม ไม่แตะ UI) — ทำทีละ aggregate, มี fallback seed เมื่อ offline |
| D3 | ย้าย RBAC admin UI (จอ roles/permissions เดิม) → เรียก API จริงจาก A1 |
| D4 | Workflows/tool-runs → ตาราง + API (แทน `data-workflows.jsx` seed) |
| D5 | Audit log จริง: เขียน `audit` ฝั่ง server จาก service layer (แทน `AUDIT_SEED`) |

**เกณฑ์ตรวจรับ**
- ล้าง localStorage ทั้งหมด → refresh → ข้อมูลครบจาก API (ยกเว้น preference เช่น theme/lang).
- สองเบราว์เซอร์เห็นการแก้ agent/room ตรงกัน (ผ่าน refetch หรือ WS event).
- viewer role: ทุกปุ่มเขียนถูกซ่อน **และ** API ปฏิเสธจริง (ทดสอบทั้งสองชั้น).

**ความเสี่ยง**: เฟสนี้แตะจอเยอะ — ทำทีละ aggregate + barrel pattern เดิม (CLAUDE.md §1.6), ห้าม big-bang.

---

## เฟส E — Knowledge / RAG

**เป้าหมาย**: codex จริง — เอกสารใน MinIO ถูก embed และถูกดึงเป็น context ของ agent.

| # | งาน |
|---|---|
| E1 | **ตัดสินใจ embedding model + มิติ** (ก่อน ingest แถวแรก — เปลี่ยนทีหลัง = re-embed ทั้งคลัง) + เพิ่มคอลัมน์ `embedding_model` | 
| E2 | Ingestion pipeline (arq job): upload → extract (md/pdf/log; OCR = ⚪ หลังสุด) → chunk → embed → pgvector |
| E3 | Retrieval ใน `agent_runner` step 1: top-k ตาม agent's room/quest scope + perm ของ owner |
| E4 | UI codex เดิมต่อ API: อัปโหลด เห็นสถานะ ingest ค้นหา |

**เกณฑ์ตรวจรับ**: อัปโหลด `.md` ใหม่ → ภายใน 1 นาที agent ตอบโดยอ้างเนื้อหานั้นได้;
ลบเอกสาร → หายจาก retrieval (ไม่มี orphan vector).

---

## เฟส F — Production readiness

**เป้าหมาย**: รันให้คนอื่นใช้ได้โดยไม่ต้องมี dev เฝ้า.

| # | งาน |
|---|---|
| F1 | Deploy topology จริง: reverse proxy + HTTPS + `cookie_secure=True` + frontend build เสิร์ฟ static |
| F2 | Backup: `pg_dump` ตามรอบ + MinIO bucket versioning/replication + ซ้อม restore จริง 1 ครั้ง |
| F3 | Observability ขั้นสอง: metrics ต่อ provider/tool (latency, tokens, error rate) + dashboard จาก `run_steps` |
| F4 | Security pass: ทบทวน checklist risk-mitigation §5.4 ทั้งหมด + dependency audit + ออกแบบ sandbox CMD/PowerShell (เซสชันแยก) ถ้าจะเปิด tool ชนิดนี้ |
| F5 | Load test เบื้องต้น: N quests พร้อมกัน — ดู queue depth, DB pool, WS fan-out |

**เกณฑ์ตรวจรับ**: restore จาก backup สำเร็จบนเครื่องเปล่า; ไม่มี secret default ใน prod;
dashboard ตอบได้ว่า "เมื่อวานใช้กี่ token ต่อ provider".

---

## คำถามที่ต้องตอบก่อนถึงเฟสนั้นๆ (ตัดสินใจช้าสุดที่ยังไม่เจ็บ)

| คำถาม | ต้องตอบก่อน | ค่าเริ่มต้นถ้าไม่ตอบ |
|---|---|---|
| **Multi-tenancy** — หลายองค์กรไหม? | ✅ **ตอบแล้ว (2026-06-12): องค์กรเดียว หลายแผนก** | `department_id` ทุก scopable table ตั้งแต่ B1 ([system-design §7.1](../architecture/system-design.md#71-department-scoping-)) |
| Embedding model + มิติ | E1 | มิติกลางของแพลตฟอร์ม + `embedding_model` ต่อแถว |
| CMD/PowerShell tool รันที่ไหน (host ผู้ใช้ vs container server) | F4 / ก่อนเปิด tool ชนิดนี้ | ไม่เปิดใช้จนกว่าจะออกแบบ sandbox |
| Retry N ของ subtask ที่ fail | C3 | N=2 → partial finalize |

---

## วิธีใช้แผนนี้

ทำตามลำดับ A → B → C (D ขนานกับ C ได้หลัง B1; E หลัง B; F หลังทุกอย่าง).
จบแต่ละเฟส: รัน "เกณฑ์ตรวจรับ" ทั้งหมดของเฟส + อัปเดตป้ายสถานะใน `system-design.md`
(🟡→✅) + ทบทวนเอกสารนี้ว่าเฟสถัดไปยังถูกลำดับอยู่. ถ้าพบงานใหม่ระหว่างทาง:
เพิ่มเข้าเฟสที่ตรง dependency ไม่ใช่ "ทำเลยเพราะกำลังผ่าน".
