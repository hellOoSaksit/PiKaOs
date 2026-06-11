@echo off
rem ===========================================================
rem  fix-docker.bat  -  restart Docker Desktop cleanly (Windows)
rem
rem  Fixes the common "Docker Desktop won't start / engine not
rem  running" cases:
rem    - com.docker.service stopped       -> starts it
rem    - hung Docker processes            -> kills them
rem    - WSL2 backend in a bad state      -> wsl --shutdown
rem    - required Windows features off    -> enables them (reboot)
rem  Then launches Docker Desktop and waits until the engine
rem  answers `docker info`.
rem
rem  Just double-click it. It will ask for Administrator (UAC).
rem ===========================================================
setlocal EnableExtensions

rem ---- self-elevate to Administrator -------------------------
net session >nul 2>&1
if %errorlevel% neq 0 (
  echo Requesting Administrator privileges...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs" >nul 2>&1
  exit /b
)

title Fix Docker Desktop
set "DD=%ProgramFiles%\Docker\Docker\Docker Desktop.exe"
set "DOCKER=%ProgramFiles%\Docker\Docker\resources\bin\docker.exe"
if not exist "%DOCKER%" set "DOCKER=docker"

echo ===========================================================
echo  Fix Docker Desktop
echo ===========================================================
echo.

rem ---- 1. check required Windows features --------------------
echo [1/6] Checking Windows features (WSL / Virtual Machine Platform)...
set "NEEDREBOOT="
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-WindowsOptionalFeature -Online -FeatureName VirtualMachinePlatform).State"`) do set "VMP=%%i"
for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-WindowsOptionalFeature -Online -FeatureName Microsoft-Windows-Subsystem-Linux).State"`) do set "WSLF=%%i"
echo       VirtualMachinePlatform = %VMP%
echo       WSL                    = %WSLF%
if /i not "%VMP%"=="Enabled" (
  echo       Enabling VirtualMachinePlatform...
  dism /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart >nul
  set "NEEDREBOOT=1"
)
if /i not "%WSLF%"=="Enabled" (
  echo       Enabling Windows Subsystem for Linux...
  dism /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart >nul
  set "NEEDREBOOT=1"
)
if defined NEEDREBOOT (
  echo.
  echo  *** A required feature was just enabled. ***
  echo  Please REBOOT Windows, then run this file again.
  echo.
  pause
  exit /b
)

rem ---- 2. stop hung Docker processes -------------------------
echo [2/6] Stopping any hung Docker processes...
for %%p in ("Docker Desktop.exe" com.docker.backend.exe com.docker.build.exe com.docker.cli.exe com.docker.dev-envs.exe dockerd.exe vpnkit.exe) do (
  taskkill /im %%p /f /t >nul 2>&1
)

rem ---- 3. reset the WSL2 backend -----------------------------
echo [3/6] Restarting WSL backend (wsl --shutdown)...
wsl --shutdown >nul 2>&1

rem ---- 4. start the Docker service ---------------------------
echo [4/6] Starting com.docker.service...
sc config com.docker.service start= demand >nul 2>&1
net start com.docker.service >nul 2>&1
sc query com.docker.service | find "RUNNING" >nul && (echo       service is running) || (echo       WARNING: could not confirm service running)

rem ---- 5. launch Docker Desktop ------------------------------
echo [5/6] Launching Docker Desktop...
if exist "%DD%" (
  start "" "%DD%"
) else (
  echo       ERROR: Docker Desktop.exe not found at:
  echo       %DD%
  echo       Is Docker Desktop installed?
  pause
  exit /b 1
)

rem ---- 6. wait for the engine to answer ----------------------
echo [6/6] Waiting for the Docker engine (up to ~120s)...
set /a tries=0
:waitloop
"%DOCKER%" info >nul 2>&1
if %errorlevel%==0 goto ready
set /a tries+=1
if %tries% geq 60 goto timedout
<nul set /p "=."
timeout /t 2 >nul
goto waitloop

:ready
echo.
echo.
echo  SUCCESS - Docker engine is up.
"%DOCKER%" version 2>nul | findstr /i "Version"
echo.
pause
exit /b 0

:timedout
echo.
echo.
echo  Docker did not become ready in time.
echo  Open Docker Desktop and check its window for an error, then:
echo    - run this file again
echo    - or run:  wsl --update
echo    - check Settings ^> General ^> "Use WSL 2 based engine"
echo.
pause
exit /b 1
