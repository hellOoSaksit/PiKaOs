# GuildOS — Phase 0 · Beta-Sitemap

**Version 0.1 · Sitemap · Beta**

A vertical slice of the GuildOS **"Sitemap Match" (ตรวจไซต์แมพ)** feature: train a
terminology vocabulary per category (IR / WD / IR+WD…), crawl a URL, and match the
page's terms to our canonical sitemap terms — even when the wording differs but the
meaning is the same. Produces a 3-state report (ครบ / ไม่ชัด / ขาด) with evidence links.

> `_design_extract/ai-company/` is the AI-design handoff bundle and is **UI reference
> only — never edited**. Spec: `project/SITEMAP.md` + `project/SYSTEM_DESIGN.md`.

## Stack

| Layer | Tech | Version |
|---|---|---|
| Runtime | Python | 3.14 |
| Backend | **FastAPI** (Starlette · Uvicorn) | 0.136 |
| ORM / migrations | **SQLAlchemy** · Alembic | 2.0.50 · 1.18 |
| DB | **PostgreSQL** (pgvector image) | 16 |
| DB driver | psycopg | 3.3 |
| Validation | Pydantic · pydantic-settings | 2.13 |
| Crawl | **lxml** (+ httpx) | 6.1 |
| Match | **rapidfuzz** (`token_set_ratio`) | 3.14 |
| Excel | **openpyxl** / CSV | 3.1 |
| Frontend | **React** · **Vite** · **TypeScript** | 19 · 8 · 6 |
| Build plugin | @vitejs/plugin-react | 6 |

Exact pins: backend → `backend/requirements.txt`; frontend → `frontend/package.json`.

## Run it (Windows · one click)

```bat
setup.bat   :: first time only — venv + pip install + npm install + .env
run.bat     :: starts Postgres, then opens API + Web as Windows Terminal tabs
stop.bat    :: stops the Postgres container
```

`run.bat` opens **two tabs** in one Windows Terminal window (API · Web). If Windows
Terminal isn't installed it falls back to two separate console windows. Requires
Docker Desktop running.

## Run it (manual)

```bash
# 1. Postgres (pgvector image, ready for later RAG phases)
docker compose up -d postgres

# 2. Backend
cd backend
python -m venv .venv && . .venv/Scripts/activate    # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --port 8000           # http://localhost:8000/docs

# 3. Frontend
cd ../frontend
npm install
npm run dev                                          # http://localhost:5173
```

Backend seeds the base IR/WD vocabulary + the IR+WD combined category on first run.
`GET /health/db` proves the DB connection (Phase 0 DoD).

## Tests

```bash
cd backend && pytest          # matcher + excel parser (no DB needed)
```

## API (prefix `/sitemap`)

| Method | Path | Purpose |
|---|---|---|
| GET/POST/DELETE | `/categories` `/categories/{key}` | category CRUD (base = hide; combined = read-only) |
| GET | `/vocab/{cat}` | effective terms (unions sources for derived categories) |
| POST | `/vocab/{cat}/terms` · PATCH/DELETE `/terms/{id}` | term edits |
| POST/DELETE | `/terms/{id}/aliases` `/terms/{id}/aliases/{text}` | alias edits |
| POST | `/scan` | **crawl + match** → 3-state report |
| GET/POST/DELETE | `/train` | Excel/CSV upload → merge into vocab |
| GET/DELETE | `/log` | audit log |
| GET | `/health/db` | health (root level) |
