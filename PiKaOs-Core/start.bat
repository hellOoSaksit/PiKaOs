@echo off
rem ===========================================================
rem  PiKaOs launcher  (single generated compose — the only way to run)
rem
rem  Flow:
rem    1) make sure the Docker engine is running
rem         - if not, start Docker Desktop and wait
rem         - if it still won't come up, run fix-docker.bat and wait
rem    2) render deploy\docker-compose.generated.yml: the kernel base
rem       (backend + frontend) merged with every ENABLED tool plugin's
rem       compose.fragment.yml (Backend\scripts\render_compose.py —
rem       kernel-redesign.md §3, install-time compose generation)
rem    3) bring up the ONE generated stack, -p pikaos
rem    4) open the app in the browser and exit
rem
rem  All services share one compose network now (backend/frontend/worker/
rem  db/redis/minio reach each other by service name — no host.docker.internal).
rem  Stop everything with stop.bat. Watch logs:
rem    docker compose -p pikaos -f deploy\docker-compose.generated.yml logs -f
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
echo        Agent-Ops Workspace launcher
echo.
echo   ===========================================================
echo.

rem ---- 1. Docker preflight -----------------------------------
echo [1/4] Checking Docker engine...
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

pushd "%ROOT%"

rem ---- env preflight (point at setup instructions instead of failing cryptically) ----
set "MISSING="
if not exist "Backend\.env" set "MISSING=1"
if not exist ".env.ai" set "MISSING=1"
if not exist "Frontend\.env" set "MISSING=1"
if defined MISSING (
  echo       Missing an env file - copy Backend\.env.example / .env.ai.example / Frontend\.env.example
  echo       to their real names first.
  popd
  pause
  exit /b 1
)

rem ---- 2. render the compose file (base + enabled tool fragments) ----
echo [2/4] Rendering docker-compose.generated.yml...
python Backend\scripts\render_compose.py
if %errorlevel% neq 0 (
  echo       ERROR: render_compose.py failed.
  popd & pause & exit /b 1
)
echo.

rem ---- 3. bring up the ONE generated stack ------------------------
echo [3/4] Starting the stack (build + wait for health)...
"%DOCKER%" compose -p pikaos -f deploy\docker-compose.generated.yml up -d --build --wait
if %errorlevel% neq 0 (
  echo       ERROR: stack failed to start.
  "%DOCKER%" compose -p pikaos -f deploy\docker-compose.generated.yml logs
  popd & pause & exit /b 1
)

popd
echo       Waiting for the backend API (so the UI doesn't load before it's ready)...
call :waitbackend 90
if %errorlevel%==0 (echo       Backend API is ready.) else (echo       Backend not ready yet - opening anyway; reload the page in a moment.)
echo.

rem ---- 4. open the app + exit (logs are in Docker Desktop) ----
echo [4/4] Opening http://localhost:5173 ...
start "" "http://localhost:5173"
echo.
echo       The stack runs in Docker. Stop it with stop.bat. Watch logs:
echo         docker compose -p pikaos -f deploy\docker-compose.generated.yml logs -f
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
