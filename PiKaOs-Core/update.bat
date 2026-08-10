@echo off
rem ===========================================================
rem  PiKaOs SERVER CORE updater  (server-core-update spec §5)
rem
rem    update.bat [core-vX.Y.Z] [--force]
rem      no tag  -> the highest core-v* tag fetched from origin
rem      old tag -> a rollback; it is the same flow in the other direction
rem      --force -> proceed even though a plugin declares an incompatible
rem                 coreVersion. It cannot override a target that is not a
rem                 release tag at all.
rem
rem  Steps: fetch -> resolve target -> preflight the installed plugins
rem  (in-container) -> keep the :pre-update image -> checkout -> render
rem  compose -> build -> up -> poll /api/version until it answers with the
rem  NEW version -> on any failure from the checkout on: check the old ref
rem  back out, restore the image, up again (auto-rollback).
rem
rem  Logs to update.log; update.lock refuses concurrent runs.
rem  This updates the SERVER. The Electron desktop app updates itself.
rem ===========================================================
setlocal EnableExtensions

rem ---- 0. re-exec from a staged copy --------------------------
rem  The checkout below rewrites this very file whenever the updater itself
rem  changed between the two versions -- and cmd.exe reads a running .bat
rem  incrementally, BY BYTE OFFSET, so it would resume mid-line inside the new
rem  file and run whatever happened to land there. The copy lives outside the
rem  work tree, where git cannot reach it. PIKAOS_UPDATE_ROOT is both the
rem  "already staged" flag and the repo location the copy has to be told about.
if defined PIKAOS_UPDATE_ROOT goto :staged
set "PIKAOS_UPDATE_ROOT=%~dp0"
set "_SELF=%TEMP%\pikaos-update-%RANDOM%%RANDOM%.bat"
copy /y "%~f0" "%_SELF%" >nul
if errorlevel 1 (
  echo   ERROR: could not stage the updater in %TEMP%.
  exit /b 1
)
call "%_SELF%" %*
set "_RC=%errorlevel%"
del "%_SELF%" >nul 2>&1
exit /b %_RC%

:staged
set "ROOT=%PIKAOS_UPDATE_ROOT%"
pushd "%ROOT%"
set "LOG=%ROOT%update.log"
set "LOCK=%ROOT%update.lock"
set "DOCKER=%ProgramFiles%\Docker\Docker\resources\bin\docker.exe"
if not exist "%DOCKER%" set "DOCKER=docker"
set "COMPOSE="%DOCKER%" compose -p pikaos -f deploy\docker-compose.generated.yml"

title PiKaOS server updater
echo.
echo   ===========================================================
echo        .:::.   P i K a O S   .:::.
echo        Server Core updater
echo   ===========================================================
echo.

rem ---- 1. one at a time ---------------------------------------
if exist "%LOCK%" (
  echo   Another update is already running ^(update.lock exists^).
  echo   If you are sure none is, delete %LOCK% and try again.
  exit /b 1
)
echo running> "%LOCK%"
call :log ==== update started %DATE% %TIME% ====

rem ---- 2. arguments -------------------------------------------
set "TARGET="
set "FORCE=0"
:args
if "%~1"=="" goto :argsdone
if /I "%~1"=="--force" (
  set "FORCE=1"
) else (
  if not defined TARGET set "TARGET=%~1"
)
shift
goto :args
:argsdone

rem ---- 3. the engine and the stack have to be up --------------
rem  The preflight runs inside the RUNNING backend (it reads the manifests of
rem  the plugins installed right now), so a stopped stack is not a compat
rem  failure -- it is a different problem, and saying so keeps `exec`'s exit 1
rem  from being read as "incompatible plugins" below.
"%DOCKER%" info >nul 2>&1
if errorlevel 1 (
  call :fail "the Docker engine is not running - start Docker Desktop first"
  exit /b 1
)
for /f "delims=" %%c in ('%COMPOSE% ps -q backend 2^>nul') do set "_UP=%%c"
if not defined _UP (
  call :fail "the PiKaOs stack is not running - start it first"
  exit /b 1
)

rem ---- 4. a dirty work tree cannot be checked out -------------
rem  Refused here, with the reason, rather than 8 steps later as a mystery
rem  checkout failure that drags a rollback behind it. Untracked files are
rem  fine (-uno): the generated compose file and the installed plugins are.
for /f "delims=" %%d in ('git status --porcelain -uno') do set "_DIRTY=1"
if defined _DIRTY (
  call :fail "the checkout has local modifications - commit or stash them first"
  exit /b 1
)

rem ---- 5. fetch, then resolve the target ----------------------
call :log fetching tags from origin
git fetch --tags --force origin
if errorlevel 1 (
  call :fail "git fetch failed - check the network and the remote"
  exit /b 1
)

if not defined TARGET for /f "delims=" %%t in ('git tag -l "core-v*" --sort=-v:refname') do (
  if not defined TARGET set "TARGET=%%t"
)
if not defined TARGET (
  call :fail "no core-v* tags found on origin"
  exit /b 1
)
git rev-parse --verify --quiet "%TARGET%^{commit}" >nul
if errorlevel 1 (
  call :fail "unknown target %TARGET%"
  exit /b 1
)

rem  Where a failure puts the server back: the branch if we are on one, else
rem  the tag we are standing on, else the bare commit.
set "REVERT="
for /f "delims=" %%b in ('git symbolic-ref -q --short HEAD 2^>nul') do set "REVERT=%%b"
if not defined REVERT for /f "delims=" %%t in ('git describe --tags --exact-match 2^>nul') do set "REVERT=%%t"
if not defined REVERT for /f "delims=" %%c in ('git rev-parse HEAD') do set "REVERT=%%c"
call :log target=%TARGET%  revert-point=%REVERT%  force=%FORCE%

rem ---- 6. preflight: would this bump strand a plugin? ---------
rem  Exit 2 = the target is not a Core release at all (a branch, a glob, a
rem  typo). --force deliberately does NOT cover that: it overrides a judgement
rem  about plugins, not a nonsense target. The shape rule itself lives in
rem  app/core/core_update.py so this script never grows a second copy of it.
echo   Checking installed plugins against %TARGET%...
%COMPOSE% exec -T backend python -m app.core.update_preflight %TARGET%
if errorlevel 2 (
  call :fail "%TARGET% is not a Core release tag"
  exit /b 1
)
if errorlevel 1 (
  if "%FORCE%"=="0" (
    call :fail "preflight found incompatible plugins - rerun with --force to override"
    exit /b 1
  )
  call :log preflight overridden with --force
)

rem ---- 7. keep the running image for an instant rollback ------
for /f "delims=" %%i in ('%COMPOSE% images -q backend 2^>nul') do "%DOCKER%" tag %%i pikaos-backend:pre-update
call :log tagged the running backend image as pikaos-backend:pre-update

rem ---- 8. switch the source over and rebuild ------------------
echo   Switching to %TARGET%...
git checkout --quiet "%TARGET%"
if errorlevel 1 (
  call :fail "checkout %TARGET% failed"
  exit /b 1
)
python Backend\scripts\render_compose.py
if errorlevel 1 (call :rollback "compose render failed" & exit /b 1)
%COMPOSE% build
if errorlevel 1 (call :rollback "build failed" & exit /b 1)
%COMPOSE% up -d
if errorlevel 1 (call :rollback "the new stack failed to start" & exit /b 1)

rem ---- 9. health: /api/version must answer with the NEW one ---
rem  Matched as a regex because cmd's `find` cannot carry an escaped quote --
rem  `.` stands in for the quotes and `[^0-9]` keeps 0.3.0 from matching
rem  0.3.01. 24 tries x 5s = 2 minutes, which covers a cold start + migrations.
set "WANT=%TARGET:core-v=%"
set "WANTRE=%WANT:.=\.%"
echo   Waiting for the server to come back on %WANT%...
set /a TRIES=0
:poll
set /a TRIES+=1
curl -fsS -m 3 http://127.0.0.1:8000/api/version 2>nul | findstr /r /c:"version.:.%WANTRE%[^0-9]" >nul
if not errorlevel 1 goto :healthy
if %TRIES% GEQ 24 (call :rollback "the server never came back on %WANT%" & exit /b 1)
<nul set /p "=."
timeout /t 5 /nobreak >nul
goto :poll

:healthy
echo.
call :log ==== UPDATED to %TARGET% ====
echo   The PiKaOs server is now on %TARGET%.
echo   Restart the desktop app to pick up the new frontend.
del "%LOCK%" >nul 2>&1
exit /b 0

rem ===========================================================
rem  :rollback <reason>  - put the server back on %REVERT%.
rem    Falls THROUGH into :fail, which is what releases the lock. Keep them
rem    in this order.
rem ===========================================================
:rollback
call :log ROLLBACK: %~1
git checkout --quiet "%REVERT%"
python Backend\scripts\render_compose.py
"%DOCKER%" tag pikaos-backend:pre-update pikaos-backend:latest >nul 2>&1
%COMPOSE% up -d --no-build
call :log ==== ROLLED BACK to %REVERT% ====
echo.
echo   FAILED: %~1
echo   The server was put back on %REVERT%. See update.log.

:fail
if not "%~1"=="" call :log FAILED: %~1
del "%LOCK%" >nul 2>&1
exit /b 1

rem ===========================================================
rem  :log <message>  - to update.log and to the console
rem ===========================================================
rem  The space before >> is load-bearing: a message ending in a digit
rem  (`force=0>>`) would otherwise be parsed as a stream-redirect handle.
:log
echo %DATE% %TIME%  %* >> "%LOG%"
echo   %*
goto :eof
