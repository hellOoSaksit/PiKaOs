@echo off
rem ===========================================================
rem  PiKaOs launcher  (split 4-stack — the only way to run)
rem
rem  Flow:
rem    1) make sure the Docker engine is running
rem         - if not, start Docker Desktop and wait
rem         - if it still won't come up, run fix-docker.bat and wait
rem    2) bring up the 4 SEPARATE stacks (each its own compose project/network),
rem       in order so each is ready before the next needs it:
rem         data     (db, redis, minio)            -p pikaos-data
rem         backend  (FastAPI API, hot-reload)     -p pikaos-backend   (+ sim overlay)
rem         ai       (arq worker)                  -p pikaos-ai
rem         frontend (Vite dev server, hot-reload) -p pikaos-frontend
rem    3) open the app in the browser and exit
rem
rem  Stacks talk to each other over the host (host.docker.internal:<port>), like real
rem  separate servers. Stop everything with stop.bat. Watch logs in Docker Desktop, or:
rem    docker compose -p pikaos-frontend logs -f   (or pikaos-backend / pikaos-ai / pikaos-data)
rem ===========================================================
setlocal EnableExtensions
set "ROOT=%~dp0"
set "DD=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
set "DOCKER=%ProgramFiles%\Docker\Docker\resources\bin\docker.exe"
if not exist "%DOCKER%" set "DOCKER=docker"

title PiKaOS launcher
color 0B
echo.
echo   ===========================================================
echo.
echo        .:::.   P i K a O S   .:::.
echo        Agent-Ops Workspace launcher  (split 4-stack)
echo.
echo   ===========================================================
echo.

rem ---- 1. Docker preflight -----------------------------------
echo [1/3] Checking Docker engine...
"%DOCKER%" info >nul 2>&1
if %errorlevel%==0 (
  echo       Docker is already running.
  goto :dockerready
)

echo       Docker is not running - starting Docker Desktop...
if exist "%DD%" (
  start "" "%DD%"
) else (
  echo       Docker Desktop.exe not found - will try fix-docker.bat.
)
echo       Waiting for the engine...
call :waitdocker 45
if %errorlevel%==0 goto :dockerready

echo.
echo       Still not up - running fix-docker.bat (approve the UAC prompt)...
if exist "%ROOT%fix-docker.bat" (
  start "" "%ROOT%fix-docker.bat"
) else (
  echo       ERROR: fix-docker.bat not found next to start.bat.
)
echo       Waiting for Docker to recover...
call :waitdocker 150
if %errorlevel%==0 goto :dockerready

echo.
echo  *** Docker could not be started automatically. ***
echo  Check the Docker Desktop / fix-docker window - a reboot may be
echo  required if Windows features were just enabled. Then run start.bat again.
echo.
pause
exit /b 1

:dockerready
echo       Docker engine OK.
echo.

rem ---- 2. bring up the 4 stacks (order matters) --------------
pushd "%ROOT%"

echo [2/3] (1/4) data stack  (db, redis, minio)...
"%DOCKER%" compose -p pikaos-data -f deploy/docker-compose.data.yml up -d --wait
if %errorlevel% neq 0 (echo       ERROR: data stack failed to start. & popd & pause & exit /b 1)

echo       (2/4) backend stack (FastAPI + migrate/seed)...
"%DOCKER%" compose -p pikaos-backend -f deploy/docker-compose.backend.yml -f deploy/docker-compose.sim.yml up -d --build --wait backend
if %errorlevel% neq 0 (echo       ERROR: backend stack failed to start. & popd & pause & exit /b 1)

echo       (3/4) ai stack      (arq worker)...
"%DOCKER%" compose -p pikaos-ai -f deploy/docker-compose.ai.yml up -d --build
if %errorlevel% neq 0 (echo       WARNING: ai/worker stack failed to start - continuing.)

echo       (4/4) frontend stack (Vite dev server)...
"%DOCKER%" compose -p pikaos-frontend -f deploy/docker-compose.frontend.dev.yml up -d --build
if %errorlevel% neq 0 (echo       ERROR: frontend stack failed to start. & popd & pause & exit /b 1)

popd
echo       Waiting for the backend API (so the UI doesn't load before it's ready)...
call :waitbackend 90
if %errorlevel%==0 (echo       Backend API is ready.) else (echo       Backend not ready yet - opening anyway; reload the page in a moment.)
echo.

rem ---- 3. open the app + exit (logs are in Docker Desktop) ----
echo [3/3] Opening http://localhost:5173 ...
start "" "http://localhost:5173"
echo.
echo       All 4 stacks run in Docker. Stop them with stop.bat. Watch logs:
echo         docker compose -p pikaos-frontend logs -f   (or pikaos-backend / pikaos-ai / pikaos-data)
echo       You can close this window.
timeout /t 3 >nul
exit /b 0

rem ===========================================================
rem  :waitdocker <seconds>
rem    polls `docker info` every 2s; exits 0 when up, 1 on timeout
rem ===========================================================
:waitdocker
set /a _max=%~1
set /a _t=0
:wd_loop
"%DOCKER%" info >nul 2>&1
if %errorlevel%==0 exit /b 0
set /a _t+=2
if %_t% geq %_max% exit /b 1
<nul set /p "=."
timeout /t 2 >nul
goto :wd_loop

rem ===========================================================
rem  :waitbackend <seconds>
rem    polls the backend /api/health every 2s (curl --fail = 200 only);
rem    exits 0 when ready, 1 on timeout
rem ===========================================================
:waitbackend
set /a _bmax=%~1
set /a _bt=0
:wb_loop
curl -fsS -m 2 -o nul http://127.0.0.1:8000/api/health >nul 2>&1
if %errorlevel%==0 exit /b 0
set /a _bt+=2
if %_bt% geq %_bmax% exit /b 1
<nul set /p "=."
timeout /t 2 >nul
goto :wb_loop
