@echo off
rem ===========================================================
rem  PiKaOs Desktop — DEV launcher (HOT RELOAD)
rem
rem  Runs the desktop shell against the LIVE Frontend Vite dev server, so
rem  editing Frontend\src\** updates the running window instantly — no rebuild.
rem
rem  Flow:
rem    1) start the Docker engine if needed
rem    2) bring up backend + frontend-DEV (Vite HMR) from docker-compose.dev.yml
rem    3) wait for the Vite dev server (http://localhost:5173)
rem    4) launch Electron via `electron-vite dev`:
rem         - renderer hot-reloads through Vite (VITE_DEV_SERVER_URL)
rem         - main/preload hot-reload through electron-vite's watcher
rem
rem  First run only: the backend prints a one-time SETUP CODE to its logs
rem  (rotates on every restart) — read it with:
rem    docker compose -f deploy\docker-compose.dev.yml logs backend
rem  paste it into the FirstRun screen, then open mode holds across restarts.
rem
rem  Stop the containers with stop.bat (Electron closes with its window).
rem  For a packaged/prod-path run (app://pikaos, no HMR) use the normal build.
rem ===========================================================
setlocal EnableExtensions
set "ROOT=%~dp0"
set "DD=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
set "DOCKER=%ProgramFiles%\Docker\Docker\resources\bin\docker.exe"
if not exist "%DOCKER%" set "DOCKER=docker"
set "COMPOSE=%ROOT%deploy\docker-compose.dev.yml"

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
  echo       Waiting for the engine (up to ~90s)...
  for /l %%i in (1,1,45) do (
    "%DOCKER%" info >nul 2>&1 && goto dockerup
    timeout /t 2 >nul
  )
  echo       Docker still not up - try fix-docker.bat, then re-run this.
  pause & exit /b 1
)
:dockerup
echo       Docker engine OK.

rem ---- 2. Backend + frontend DEV (HMR) ----------------------
echo [2/4] Starting backend + frontend (Vite HMR)...
"%DOCKER%" compose -f "%COMPOSE%" up -d backend frontend
if errorlevel 1 ( echo       compose up failed. & pause & exit /b 1 )

rem ---- 3. Wait for the Vite dev server ----------------------
echo [3/4] Waiting for Vite dev server (http://localhost:5173)...
for /l %%i in (1,1,40) do (
  curl -s -o nul http://localhost:5173 && goto viteup
  timeout /t 2 >nul
)
echo       Vite did not come up - check: docker compose -f deploy\docker-compose.dev.yml logs frontend
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

echo.
echo   Electron closed. Containers keep running - stop them with stop.bat.
endlocal
