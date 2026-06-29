@echo off
rem ===========================================================
rem  PiKaOs frontend dev server.
rem  Launched by start.bat's "Frontend - dev" tab (kept in its own
rem  file so the wt command line stays free of & and () which
rem  Windows Terminal mis-parses). Can also be run on its own.
rem ===========================================================
cd /d "%~dp0"
color 0B
echo  ===  PiKaOS  -  Frontend dev  ===
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo [dev] npm was not found on PATH.
  echo [dev] Install Node.js, or open a shell where "npm -v" works, then retry.
  pause
  exit /b 1
)

if not exist node_modules (
  echo [dev] installing dependencies ^(first run^)...
  call npm install
)

echo [dev] starting Vite dev server on http://localhost:5173 ...
call npm run dev
