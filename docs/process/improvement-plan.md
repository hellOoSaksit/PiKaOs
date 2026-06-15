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
| A2 | **WS refactor**: first-message auth (token ออกจาก URL) · per-quest channel + authz · snapshot/backfill | risk-mitigation §3 |
| A3 | Migration `0002`: FK `documents.owner_id` → users | risk-mitigation §6.1 |
| A4 | ✅ **เสร็จ (2026-06-15)** Boot asserts (prod): jwt_secret/cookie_secure/seed_password/minio_secret ≠ default → ตายตอนบูต (`config.production_violations` + `main.lifespan`, `tests/test_config.py`) | risk-mitigation §5.4 |
| A5 | 🟡 Pin `minio` image ✅ (digest, docker-compose.yml) · ⬜ ย้าย `passlib` → `argon2-cffi` ใน `security.py` (เสี่ยง hash เดิม — ทำพร้อม test login) | tech-stack §3.1–3.2 |
| A6 | **CI** (GitHub Actions): `npm run build` + ESLint(ใหม่) + `pytest` + grep กติกา component-first | tech-stack §3.3–3.4 |

**เกณฑ์ตรวจรับ (Definition of Done)**
- เรียก API เขียนข้อมูลโดยไม่มี perm → 403 พร้อม `missing permission: <key>` (test ครอบ).
- ผู้ใช้ B subscribe quest ของ A ที่ตนไม่มีสิทธิ์ → 4403; token ไม่ปรากฏใน access log ของ proxy.
- `pytest` เขียว + CI เขียวบน PR; boot ด้วย `ENVIRONMENT=production` + secret default → ตายทันทีพร้อมข้อความชัด.
- Login เดิมทั้ง 6 user ใช้ได้ต่อ (hash argon2id เดิม verify ผ่าน lib ใหม่).

**ความเสี่ยงของเฟส**: RBAC seed ฝั่ง client/server ไม่ตรงกัน (email `@guildos.io` เดิม) —
กำหนดให้ **server เป็น source of truth, map ด้วย `username`** ตั้งแต่ A1.

---

## เฟส B — Engine core (stub LLM — ยังไม่จ่ายเงินจริง)

**เป้าหมาย**: โครง engine ที่ถูกต้องครบ (queue, persistence, resume, quota, timeout) พิสูจน์ด้วย stub
ก่อนต่อ LLM จริง — แยก "ความเสี่ยง engine" ออกจาก "ความเสี่ยง provider".

| # | งาน |
|---|---|
| B1 | Migration ตาราง engine ครบชุด: `departments` + `user_departments` (m:n) + `agents/rooms/quests/runs/run_steps/subtasks/tools_config/notifications` พร้อม `department_id` บน scopable tables + FK/UNIQUE/index ตาม risk-mitigation §4.4 + [system-design §7.1](../architecture/system-design.md#71-department-scoping-) |
| B2 | arq worker เป็น service ใหม่ใน compose (image เดิม, command `arq`) |
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
