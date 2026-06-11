@echo off
rem ===========================================================
rem  PiKaOs launcher
rem
rem  Flow:
rem    1) make sure the Docker engine is running
rem         - if not, start Docker Desktop and wait
rem         - if it still won't come up, run fix-docker.bat and wait
rem    2) bring up the backend infra (Postgres+pgvector, Redis, MinIO, API)
rem         via `docker compose up -d --build`
rem    3) open ONE Windows Terminal window with multiple TABS
rem         Frontend - dev  |  Backend  |  Docker  |  Shell
rem       (tabs, not several separate windows)
rem
rem  Requires Windows Terminal (wt.exe) - built into Windows 11.
rem ===========================================================
setlocal EnableExtensions
set "ROOT=%~dp0"
set "DD=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
set "DOCKER=%ProgramFiles%\Docker\Docker\resources\bin\docker.exe"
if not exist "%DOCKER%" set "DOCKER=docker"

title PiKaOs launcher
echo ===========================================================
echo  PiKaOs launcher
echo ===========================================================
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

rem ---- 2. bring up backend infrastructure --------------------
echo [2/3] Starting backend infra (Postgres+pgvector, Redis, MinIO, API)...
pushd "%ROOT%"
docker compose up -d --build
popd
echo       Waiting for the backend API (so the UI doesn't load before it's ready)...
call :waitbackend 90
if %errorlevel%==0 (echo       Backend API is ready.) else (echo       Backend not ready yet - opening anyway; reload the page in a moment.)
echo.

rem ---- 3. open the app in Windows Terminal tabs --------------
echo [3/3] Opening Windows Terminal tabs...
where wt >nul 2>nul
if errorlevel 1 goto :nowt

rem  -w pikaos = reuse one named window (re-running adds tabs, not windows).
rem  Tabs that target the repo root use "%ROOT%." - the trailing dot avoids a
rem  backslash right before the closing quote, which wt would misread.
rem  The Frontend tab calls Frontend\dev.bat (a real file) instead of an inline
rem  command - wt mis-parses & and () inside cmd /k, which stopped the dev server.
wt -w pikaos new-tab --title "Frontend - dev" -d "%ROOT%Frontend" cmd /k "%ROOT%Frontend\dev.bat" ; new-tab --title "Backend" -d "%ROOT%." cmd /k "docker compose logs -f backend" ; new-tab --title "Docker" -d "%ROOT%." cmd /k "docker compose ps" ; new-tab --title "Shell" -d "%ROOT%." cmd /k "echo PiKaOs shell - run git / npm here"

echo       Launched. You can close this window.
timeout /t 3 >nul
exit /b 0

:nowt
echo       Windows Terminal (wt.exe) not found - falling back to a single window.
call "%ROOT%Frontend\dev.bat"
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
