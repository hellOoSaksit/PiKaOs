@echo off
rem ===========================================================
rem  PiKaOs — stop the stack (counterpart of start.bat).
rem  Containers + networks are removed; named volumes (pgdata/redisdata/
rem  miniodata/kernelstate) are KEPT so data survives
rem  a restart. To wipe volumes too:  stop.bat --volumes   (or -v)
rem  (Vite now runs on the host, so nothing here stops it - close its window.)
rem ===========================================================
setlocal EnableExtensions
set "ROOT=%~dp0"
set "DOCKER=%ProgramFiles%\Docker\Docker\resources\bin\docker.exe"
if not exist "%DOCKER%" set "DOCKER=docker"

set "DOWN=down"
if /I "%~1"=="--volumes" set "DOWN=down -v"
if /I "%~1"=="-v" set "DOWN=down -v"

pushd "%ROOT%"
if not exist "deploy\docker-compose.generated.yml" (
  echo Nothing to stop ^(deploy\docker-compose.generated.yml not found - was start.bat ever run?^)
  popd
  exit /b 0
)

echo Stopping the stack...
"%DOCKER%" compose -p pikaos -f deploy\docker-compose.generated.yml %DOWN%
popd
echo.
echo Stack stopped.
timeout /t 2 >nul
exit /b 0
