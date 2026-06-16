# PiKaOs

A Thai-first multi-agent **agent-ops** workspace — a Vite + React SPA over a FastAPI service
(auth, API, WebSocket), with Postgres · Redis · MinIO, all in Docker.

> 📖 **Documentation lives in a separate repo:** **[PiKaOs-docs](https://github.com/hellOoSaksit/PiKaOs-docs)**
> — architecture, features, process, and the design guide. This repo keeps only this slim README.

## Run it

The whole stack runs in Docker. On Windows, double-click **`start.bat`** — it ensures the Docker
engine is up, runs `docker compose up -d --build` (Postgres · Redis · MinIO · backend · worker ·
frontend), and opens the browser at **http://localhost:5173**. Watch logs in Docker Desktop (or
`docker compose logs -f <service>`).

## ⬇️ Download — Website Compare (standalone)

A self-contained build of just the **Compare** feature (UAT vs Production content comparison) —
no login, no nav, stateless backend. It lives in its own repo: **[PiKaOS-Standalone](https://github.com/hellOoSaksit/PiKaOS-Standalone)**.

- **Latest release:** **[Website Compare v0.1](https://github.com/hellOoSaksit/PiKaOS-Standalone/releases/tag/website-compare-v0.1)**
- **Direct download:** [`PikaOS-Compare-v0.1.zip`](https://github.com/hellOoSaksit/PiKaOS-Standalone/releases/download/website-compare-v0.1/PikaOS-Compare-v0.1.zip)

Unzip → `cd PikaOS-Compare` → `docker compose up -d --build` (or `start-compare.bat`) → http://localhost:5173.

## Layout

| Folder | What it is |
|---|---|
| [`Frontend/`](Frontend) | Vite + React SPA (the UI) |
| [`Backend/`](Backend) | FastAPI service (auth, API, WS) |
| [`design-system/`](design-system) | static design deliverables (HTML) |
| [`docker-compose.yml`](docker-compose.yml) | Postgres · Redis · MinIO · backend · worker · frontend |
