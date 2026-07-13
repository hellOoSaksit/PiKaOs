@echo off
rem ===========================================================
rem  PiKaOs Desktop — DEV launcher (HOT RELOAD)
rem
rem  Runs the desktop shell against a LIVE Frontend Vite dev server, so
rem  editing Frontend\src\** updates the running window instantly — no rebuild.
rem
rem  Vite runs ON THE HOST, not in Docker. There is no `frontend` service any more:
rem  PiKaOs is a desktop app, its renderer is loaded by Electron (over
rem  VITE_DEV_SERVER_URL here, app://pikaos when packaged), and a container could
rem  serve neither without pretending to be a browser. Docker still owns the backend.
rem
rem  Flow:
rem    1) start the Docker engine if needed
rem    2) bring up the backend from docker-compose.dev.yml
rem    3) start Vite on the host in its own window, wait for http://localhost:5173
rem       (vite.config.js proxies /api to 127.0.0.1:8000 by default — the published
rem        backend port — so no VITE_PROXY_TARGET is needed off the compose network)
rem    4) launch Electron via `electron-vite dev`:
rem         - renderer hot-reloads through Vite (VITE_DEV_SERVER_URL)
rem         - main/preload hot-reload through electron-vite's watcher
rem
rem  First run only: the backend prints a one-time SETUP CODE to its logs
rem  (rotates on every restart) — read it with:
rem    docker compose -f deploy\docker-compose.dev.yml logs backend
rem  paste it into the FirstRun screen, then open mode holds across restarts.
rem
rem  Closing Electron also closes the Vite window. Stop the backend with stop.bat.
rem  For a packaged/prod-path run (app://pikaos, no HMR) build Frontend\dist first
rem  and launch Electron with VITE_DEV_SERVER_URL unset.
rem ===========================================================
setlocal EnableExtensions
set "ROOT=%~dp0"
set "DD=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
set "DOCKER=%ProgramFiles%\Docker\Docker\resources\bin\docker.exe"
if not exist "%DOCKER%" set "DOCKER=docker"
set "COMPOSE=%ROOT%deploy\docker-compose.dev.yml"
set "VITE_TITLE=PiKaOs Vite (dev server)"

title PiKaOS Desktop DEV (hot reload)
color 0B
echo.
echo   ===========================================================
echo        P i K a O S   Desktop  -  DEV  (hot reload)
echo   ===========================================================
echo.

rem ---- 1. Docker preflight -----------------------------------
echo [1/4] Checking Docker engine...
"%DOCKER%" info >nul 2>&1
if errorlevel 1 (
  echo       Docker not ready - starting Docker Desktop...
  if exist "%DD%" start "" "%DD%"
  echo       Waiting for the engine ^(up to ~90s^)...
  for /l %%i in (1,1,45) do (
    "%DOCKER%" info >nul 2>&1 && goto dockerup
    timeout /t 2 >nul
  )
  echo       Docker still not up - try fix-docker.bat, then re-run this.
  pause & exit /b 1
)
:dockerup
echo       Docker engine OK.

rem ---- 2. Backend (Docker) -----------------------------------
echo [2/4] Starting backend...
"%DOCKER%" compose -f "%COMPOSE%" up -d backend
if errorlevel 1 ( echo       compose up failed. & pause & exit /b 1 )

rem ---- 3. Vite dev server on the host ------------------------
echo [3/4] Starting Vite on the host (http://localhost:5173)...
if not exist "%ROOT%Frontend\node_modules" (
  echo       Installing Frontend deps first run...
  pushd "%ROOT%Frontend" & call npm ci & popd
)
start "%VITE_TITLE%" /min cmd /c "cd /d ""%ROOT%Frontend"" && npm run dev"
for /l %%i in (1,1,40) do (
  curl -s -o nul http://localhost:5173 && goto viteup
  timeout /t 2 >nul
)
echo       Vite did not come up - look at the "%VITE_TITLE%" window for the error.
pause & exit /b 1
:viteup
echo       Vite dev server OK.

rem ---- 4. Launch Electron with hot reload --------------------
rem  Clear ELECTRON_RUN_AS_NODE (if set, Electron runs as plain Node and the
rem  GUI never opens - "Cannot read properties of undefined").
echo [4/4] Launching Electron (hot reload)...
set "ELECTRON_RUN_AS_NODE="
set "VITE_DEV_SERVER_URL=http://localhost:5173"
cd /d "%ROOT%Desktop"
if not exist "node_modules" (
  echo       Installing Desktop deps first run...
  call npm ci
)
call npx electron-vite dev

rem ---- Electron closed: take the Vite dev server down with it ----
rem (kill by PORT, not window title - npm/vite retitle their console, so a
rem  WINDOWTITLE filter silently matches nothing and leaks node on :5173)
powershell -NoProfile -Command "Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }" >nul 2>&1

echo.
echo   Electron closed, Vite stopped. The backend keeps running - stop it with stop.bat.
endlocal
