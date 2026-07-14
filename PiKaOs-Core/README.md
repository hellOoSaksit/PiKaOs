# PiKaOs Core

**A Thai-first agent-ops workspace** — a desktop application for operating AI agents with
identity & access control, observability, and an auditable trail.

Core is the **zero-datastore kernel**: health, config, plugin lifecycle, settings, storage
seams, and the MCP catalog. Everything else — identity/RBAC, AI runtime, datastores
(Postgres/Redis/MinIO), chat — arrives as **plugins** from sibling repos, linked in by
`link-plugins.sh`. The UI is an **Electron desktop shell** (`Desktop/`) whose renderer
(`Desktop/Frontend/`) is served over `app://pikaos` when packaged; there is no web UI.

## Repository layout

| Path | What it is |
|---|---|
| `Backend/` | FastAPI kernel (API, plugin loader, build-merge scripts) |
| `Desktop/` | Electron shell (main/preload) + `Desktop/Frontend/` — the Vite+React renderer |
| `deploy/` | Compose bases (`dev`/`prod`) — `render_compose.py` merges enabled tool-plugin fragments into `docker-compose.generated.yml` |
| `link-plugins.sh` | Copies enabled sibling-plugin code into the tree (build state, gitignored) |
| `start.bat` / `stop.bat` | Windows: bring the Docker backend stack up / down |
| `start-desktop-dev.bat` | Windows: backend + Vite HMR + Electron dev shell |

## Prerequisites

- **Docker** — Docker Desktop (Windows) or docker + compose plugin (Linux)
- **Python 3.12** (host tooling: render scripts)
- **Node 22** (renderer + desktop builds)

## Install & first run

1. **Env** — copy the template and adjust if needed (dev defaults work out of the box):

   ```bash
   cp Backend/.env.example Backend/.env
   ```

   This is the only dev env file (backend + datastores + AI-provider fallbacks).
   For production, fill `deploy/.env.prod.example` → strong secrets (the backend refuses
   to boot in `ENVIRONMENT=production` with dev defaults).

2. **Link plugins** — copy enabled plugin code in from the sibling repos:

   ```bash
   ./link-plugins.sh auth postgres redis    # or no args = all discoverable
   python Backend/scripts/render_requirements.py --only auth,postgres,redis
   ```

3. **Start the server stack**

   - **Windows:** double-click `start.bat` (Docker preflight → render compose → build + up + health-wait).
   - **Linux:**

     ```bash
     python Backend/scripts/render_compose.py
     docker compose -p pikaos -f deploy/docker-compose.generated.yml up -d --build --wait
     ```

4. **Open the desktop app** — `start-desktop-dev.bat` (dev/HMR, see below), or a packaged build.

5. **First run** — with auth enabled and zero users, the backend prints a one-time **SETUP
   CODE** to its logs and the app shows the **create-first-admin** screen:

   ```bash
   docker compose -p pikaos -f deploy/docker-compose.generated.yml logs backend | grep -iE -A2 "setup required|no users yet"
   ```

   Enter the code + choose the owner's username/password. There are **no default
   credentials**. (Dev stacks that set `SEED_DEV_USERS=1` seed demo users instead.)

## Desktop dev (HMR) vs packaged

`start-desktop-dev.bat` runs: backend (Docker) → Vite dev server on the host
(`http://localhost:5173`) → `electron-vite dev`. Manual equivalent — two gotchas matter:

```bash
# 1) renderer dev server
cd Desktop/Frontend && npm run dev
# 2) desktop shell against it — in another terminal:
cd Desktop
unset ELECTRON_RUN_AS_NODE            # if set, Electron runs as plain Node: no window ever opens
VITE_DEV_SERVER_URL=http://localhost:5173 npx electron-vite dev
```

**Packaged path:** build the renderer (`cd Desktop/Frontend && npx vite build`), then
`cd Desktop && npx electron-vite build && npx electron-builder`. The bundle serves
`Desktop/Frontend/dist` over `app://pikaos` (never `file://`); `VITE_DEV_SERVER_URL` must be
unset.

## Stop · logs · reset

```bash
stop.bat                       # Windows — containers down, volumes kept
stop.bat --volumes             # …and wipe data volumes
docker compose -p pikaos -f deploy/docker-compose.generated.yml logs -f backend
# Linux: the same compose commands directly (down / down -v / logs)
```

## Troubleshooting

**Docker engine won't start (Windows).**
1. Start Docker Desktop and wait for "Engine running".
2. Still down → restart the service: `net stop com.docker.service && net start com.docker.service` (admin), or restart WSL: `wsl --shutdown` then reopen Docker Desktop.
3. **Kill hung Docker processes**, then restart Docker Desktop: from an admin PowerShell/terminal —
   ```powershell
   taskkill /f /im "Docker Desktop.exe" /im com.docker.backend.exe /im com.docker.build.exe /im com.docker.cli.exe /im dockerd.exe /im vpnkit.exe
   wsl --shutdown
   net start com.docker.service
   ```
   then relaunch Docker Desktop.
4. **WSL backend stuck / outdated** → `wsl --update`, then reopen Docker Desktop. Confirm Docker Desktop **Settings → General → "Use WSL 2 based engine"** is enabled.
5. First-ever run → ensure virtualization is enabled in BIOS/UEFI and the Windows features **WSL2** + **Virtual Machine Platform** are on (`wsl --install`; reboot).

**Linux once-per-machine setup** (docker without sudo):
```bash
sudo systemctl enable --now docker
sudo usermod -aG docker "$USER"   # then log out/in (or `newgrp docker`)
```

**Vite/Electron opens nothing** → `ELECTRON_RUN_AS_NODE` is set in your shell; unset it.

**Backend unhealthy after up** → `docker compose -p pikaos -f deploy/docker-compose.generated.yml logs backend`; a fresh clone missing `Backend/.env` fails the preflight in `start.bat` with instructions.

## Documentation

Internal architecture/process docs are maintained separately (private). This README is the
public overview + install guide.
