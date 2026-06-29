@echo off
rem ===========================================================
rem  PiKaOs — stop all 4 stacks (reverse order of start.bat).
rem  Containers + networks are removed; named volumes (pgdata/redisdata/
rem  miniodata/frontend_node_modules) are KEPT so data survives a restart.
rem  To wipe the datastores too:  stop.bat --volumes   (or -v)
rem ===========================================================
setlocal EnableExtensions
set "ROOT=%~dp0"
set "DOCKER=%ProgramFiles%\Docker\Docker\resources\bin\docker.exe"
if not exist "%DOCKER%" set "DOCKER=docker"

set "DOWN=down"
if /I "%~1"=="--volumes" set "DOWN=down -v"
if /I "%~1"=="-v" set "DOWN=down -v"

pushd "%ROOT%"
echo Stopping frontend stack...
"%DOCKER%" compose -p pikaos-frontend -f deploy/docker-compose.frontend.dev.yml %DOWN%
echo Stopping ai stack...
"%DOCKER%" compose -p pikaos-ai -f deploy/docker-compose.ai.yml %DOWN%
echo Stopping backend stack...
"%DOCKER%" compose -p pikaos-backend -f deploy/docker-compose.backend.yml -f deploy/docker-compose.sim.yml %DOWN%
echo Stopping data stack...
"%DOCKER%" compose -p pikaos-data -f deploy/docker-compose.data.yml %DOWN%
popd
echo.
echo All stacks stopped.
timeout /t 2 >nul
exit /b 0
