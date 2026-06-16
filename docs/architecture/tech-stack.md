# PiKaOs — Tech Stack (ปัจจุบัน + เป้าหมาย + นโยบาย)

> เอกสารอ้างอิง stack ทั้งระบบ: อะไรใช้อยู่จริง (เวอร์ชันจาก lockfile/requirements ณ 2026-06-12),
> อะไรกำลังจะเพิ่ม, และนโยบายการเลือก/อัปเกรด dependency.
> อ่านคู่กับ [`system-design.md`](system-design.md) (สถาปัตยกรรม) ·
> [`improvement-plan.md`](../process/improvement-plan.md) (แผนปรับปรุง) · [`../CLAUDE.md`](../../CLAUDE.md) (กติกา).

---

## 1. Stack ปัจจุบัน ✅ (ตามไฟล์จริง)

### Frontend — `Frontend/package.json`

| ชั้น | ของจริง | เวอร์ชัน |
|---|---|---|
| UI runtime | React + ReactDOM | ^18.3.1 |
| Build/dev | Vite + @vitejs/plugin-react | ^5.4.11 / ^4.3.4 |
| Dependency อื่น | **ไม่มีเลย** | — |

จุดเด่นที่ตั้งใจ: **zero-dependency UI** — ไม่มี router / state lib / component lib / CSS framework.
ทุกอย่างทำเอง: UI kit ใน `src/components/ui/` (~30 components), i18n เองผ่าน `import.meta.glob`,
ธีมด้วย CSS tokens (`styles.css`), navigation เป็น state ภายใน `App.jsx`.
Dev proxy: `/api`, `/ws` → `127.0.0.1:8000` (timeout 120s เพื่อรองรับ compare — `vite.config.js`).

### Backend — `Backend/requirements.txt` (pin ตายตัวทุกตัว)

| ชั้น | ของจริง | เวอร์ชัน |
|---|---|---|
| Runtime | Python (slim image) | 3.12 |
| Web | FastAPI + uvicorn[standard] | 0.137.1 / 0.49.0 |
| DB | SQLAlchemy[asyncio] + asyncpg + Alembic + pgvector | 2.0.51 / 0.31.0 / 1.18.4 / 0.4.2 |
| Validation | pydantic + pydantic-settings | 2.13.4 / 2.14.1 |
| Auth | PyJWT + argon2-cffi | 2.13.0 / 25.1.0 |
| Cache/queue base | redis (asyncio) | 5.3.1 |
| Object storage | minio | 7.2.20 |
| HTTP client / tests | httpx · pytest · pytest-asyncio | 0.28.1 / 8.4.2 / 0.26.0 |

> เวอร์ชันอัปเดต minor/patch ครั้งล่าสุด: 2026-06-16 (คงเมเจอร์เดิมทุกตัวตาม §3.5; React 18/Vite 5 ไม่แตะ).

### Infrastructure — `docker-compose.yml`

| Service | Image | หมายเหตุ |
|---|---|---|
| db | `pgvector/pgvector:pg16` | Postgres 16 + pgvector, healthcheck `pg_isready` |
| redis | `redis:7-alpine` | refresh tokens / denylist / (อนาคต: arq + pub/sub) |
| minio | `minio/minio:latest` | ⚠️ tag `latest` — ดู §4 นโยบาย pin |
| backend | build `./Backend` | entrypoint: `alembic upgrade head` → seed → uvicorn |

Frontend ไม่อยู่ใน compose — รันผ่าน `start.bat` (กติกา CLAUDE.md §0).

---

## 2. Stack ที่จะเพิ่ม 🟡 (ตาม decision log ใน system-design.md §3)

| งาน | ตัวเลือกที่ตัดสินใจแล้ว | เหตุผลย่อ | เพิ่มเมื่อ (เฟสใน improvement-plan) |
|---|---|---|---|
| Job queue / worker | **arq** | ใช้ Redis เดิม, async-native, เบากว่า Celery, Temporal เกินจำเป็น | B |
| LLM SDKs | `openai` · `anthropic` (official SDK) + local ผ่าน OpenAI-compatible endpoint | multi-provider adapter; ห่อใต้ `llm` interface เดียว — **ตรวจเวอร์ชัน SDK ล่าสุด ณ วันติดตั้ง** | B–C |
| Rate limiting | token-bucket บน Redis (เขียนเอง ~50 บรรทัด) | ไม่คุ้มเพิ่ม lib เพื่อ pattern เดียว | C |
| Structured logging | stdlib `logging` + JSON formatter | ยังไม่ต้อง OTel จนกว่าจะมีหลาย service | B |
| Embeddings | provider ผ่าน adapter เดียวกัน; **มิติเดียวของแพลตฟอร์ม + คอลัมน์ `embedding_model`** | ไม่ผูกมิติกับ OpenAI ([risk-mitigation §5.3](risk-mitigation.md)) | E |

**สิ่งที่ตั้งใจ "ไม่เพิ่ม"** (ตัดสินใจแล้ว อย่าหยิบเข้าโดยไม่ทบทวนเอกสารนี้):
Celery/Temporal (overkill) · Kafka/RabbitMQ (Redis pub/sub พอ) · ORM อื่น/Prisma ·
GraphQL (REST + WS พอ) · frontend framework เพิ่ม (Next/Redux/Tailwind — ขัด zero-dependency +
design tokens เดิม) · Casbin/OPA (RBAC โมเดลตรงๆ ใน Postgres พอ).

---

## 3. ความเสี่ยงของ stack ปัจจุบัน + คำแนะนำ

### 3.1 `passlib` ไม่มีการดูแลต่อ (สำคัญสุดในหมวดนี้)
**Observation**: `passlib` 1.7.4 ออกตั้งแต่ 2020 และโปรเจกต์หยุดนิ่ง — ใช้ได้กับ Python 3.12 วันนี้
แต่เป็นหนี้ที่ครบกำหนดเมื่ออัปเกรด Python ครั้งถัดไป.
**Recommendation**: ย้ายไปเรียก **`argon2-cffi` ตรงๆ** (lib ที่ passlib ห่ออยู่แล้ว — มีใน image อยู่แล้ว)
จุดแก้มีจุดเดียวคือ `security.py` (`hash_password`/`verify_password`) ซึ่งเป็นชั้น abstraction ที่ถูกออกแบบไว้ดีแล้ว.
**Impact**: hash เดิมเป็น argon2id มาตรฐาน → verify ได้ต่อเนื่อง ไม่ต้อง reset รหัสผ่าน. งาน ~ครึ่งวัน (เฟส A).

### 3.2 `minio:latest` ไม่ pin
ภาพ `latest` ทำให้ `docker compose pull` วันใดวันหนึ่งได้พฤติกรรมใหม่โดยไม่ตั้งใจ.
→ pin เป็น tag รุ่น (เลือกรุ่น ณ วันแก้) ให้เหมือน db/redis ที่ pin แล้ว (เฟส A — หนึ่งบรรทัด).

### 3.3 Frontend ไม่มี lint / test / typecheck เลย
`package.json` มีแค่ dev/build/preview. โค้ด ~30k บรรทัด JSX ที่พึ่ง `npm run build` เป็น compile check เดียว.
**Recommendation** (เรียงคุ้มก่อน): (1) **ESLint + react-hooks plugin** — จับ hook-order/dependency bug
ซึ่งเป็น bug class หลักของ React ที่ build ไม่จับ; (2) **Vitest** เฉพาะ `src/lib/` + `src/data/`
(ฟังก์ชัน pure: i18n fallback 4 ชั้น, `resolvePerms`, `simulateRun`, iso math) — ไม่ต้อง test component ก่อน;
(3) TypeScript = ⚪ อนาคต, ค่อยทำแบบ incremental (`checkJs` + JSDoc ก่อน) ถ้าทีมโต.
**Cons**: เพิ่ม devDependencies ~5 ตัว — ยังคง runtime zero-dependency ตามปรัชญาเดิม.

### 3.4 ไม่มี CI
กติกา "pre-ship checks" ใน CLAUDE.md §1.1 (grep `<select>`, build, pytest) เป็น manual ล้วน.
→ GitHub Actions 1 ไฟล์: `npm run build` + ESLint + `pytest` (spin compose ใน job) + grep กติกา component-first.
ทำให้กติกาใน CLAUDE.md กลายเป็นของที่เครื่องบังคับ ไม่ใช่ความจำคน (เฟส A).

### 3.5 เวอร์ชันหลักที่ "ยังไม่ต้องรีบอัปเกรด"
React 18 / Vite 5 / SQLAlchemy 2 / Pydantic 2 / Postgres 16 ล้วนเป็น major ที่ถูกต้องและยังได้รับการดูแล —
**อย่าอัปเกรด major พร้อมงาน engine** (แยก PR เสมอ). React 19 / Vite รุ่นถัดไป: รอจนเฟส A–C จบ
แล้วค่อยประเมินเป็นงานแยก เพราะ UI kit เขียนเองทั้งหมด การ migrate ต้อง regression ด้วยตา
(ยังไม่มี component test).

---

## 4. นโยบาย dependency (ใช้ตัดสินใจครั้งถัดไป)

1. **เพิ่ม lib ใหม่ต่อเมื่อ** แก้ปัญหาที่ (ก) เขียนเองแพงกว่า 1 วัน และ (ข) เป็น core path ที่ lib
   ทำได้ถูกต้องกว่า (crypto, SDK ผู้ขาย, migration). pattern เล็ก (rate-limit, lock) เขียนเองบน Redis/Postgres.
2. **Pin แบบเดิมให้คงเส้นคงวา**: backend pin ตายตัว (ดีอยู่แล้ว) · frontend ใช้ caret + lockfile (ยอมรับได้) ·
   **docker image ห้าม `latest`** (แก้ minio).
3. **อัปเกรดเป็นงานแยกเสมอ** — PR เดียวต่อ 1 major, รัน full check; ห้ามพ่วงใน PR feature.
4. **SDK ผู้ขาย LLM**: ตรวจเวอร์ชัน + breaking changes ณ วันติดตั้งจริง (decision log ระบุ
   "verify each SDK when implementing") — ห้าม copy เวอร์ชันจากเอกสารนี้ไปใช้โดยไม่เช็ค.
5. ทุกการเพิ่ม/ถอด dependency → อัปเดตเอกสารนี้ใน commit เดียวกัน (กติกา CLAUDE.md §6.7).

---

## 5. ภาพรวม runtime topology (เป้าหมายเมื่อครบทุกเฟส)

```
Windows host (start.bat)
 ├─ Vite dev server :5173 ── proxy /api,/ws ──▶ backend
 └─ Docker
     ├─ backend (FastAPI, uvicorn) :8000 ─┬─▶ db (pg16 + pgvector) :5432
     ├─ worker (arq — image เดียวกับ backend, entrypoint ต่าง) ──┤
     │       └─▶ LLM providers (OpenAI / Anthropic / local OpenAI-compatible)
     ├─ redis :6379  (refresh/denylist · arq queue · pub/sub quest:<id> · rate-limit buckets)
     └─ minio :9000/9001  (bucket pikaos: md/img/log/pdf + tool outputs ใหญ่)
```

การเพิ่ม worker = service ใหม่ใน compose ที่ `build: ./Backend` เดิม + `command: arq app.worker.WorkerSettings`
— ไม่มี image/ภาษา/ฐานข้อมูลใหม่ทั้งระบบ ซึ่งคือจุดแข็งหลักของ design นี้.
