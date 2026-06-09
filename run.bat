@echo off
REM ============================================================
REM  GuildOS - v0.1 Sitemap Beta - dev runner
REM  Starts Postgres, then opens Backend + Frontend.
REM  Uses Windows Terminal tabs when available, else windows.
REM ============================================================
setlocal
set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "FRONTEND=%ROOT%frontend"

echo [GuildOS] Starting Postgres (docker compose)...
pushd "%ROOT%"
docker compose up -d postgres
popd
if errorlevel 1 (
  echo [GuildOS] WARNING: could not start Postgres. Is Docker Desktop running?
  echo           Backend will fail to connect until Postgres is up.
  echo.
)

REM commands each tab/window runs (cmd /k keeps it open)
set "BE_CMD=call .venv\Scripts\activate.bat && uvicorn app.main:app --reload --port 8000"
set "FE_CMD=npm run dev"

where wt >nul 2>nul
if %errorlevel%==0 (
  echo [GuildOS] Opening Windows Terminal tabs: Backend ^| Frontend
  wt -w guildos new-tab --title "GuildOS API" -d "%BACKEND%" cmd /k "%BE_CMD%" ; new-tab --title "GuildOS Web" -d "%FRONTEND%" cmd /k "%FE_CMD%"
) else (
  echo [GuildOS] Windows Terminal not found - opening separate windows.
  start "GuildOS API"  cmd /k "cd /d "%BACKEND%"  && %BE_CMD%"
  start "GuildOS Web"  cmd /k "cd /d "%FRONTEND%" && %FE_CMD%"
)

echo.
echo [GuildOS] API  -> http://localhost:8000/docs
echo [GuildOS] Web  -> http://localhost:5173
endlocal
