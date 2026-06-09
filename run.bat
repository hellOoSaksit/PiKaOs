@echo off
REM ============================================================
REM  PiKaOs - v0.1 Sitemap Beta - dev runner
REM  Starts Postgres, then opens Backend + Frontend.
REM  Uses Windows Terminal tabs when available, else windows.
REM ============================================================
setlocal
set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "FRONTEND=%ROOT%frontend"

echo [PiKaOs] Starting Postgres (docker compose)...
pushd "%ROOT%"
docker compose up -d postgres
popd
if errorlevel 1 (
  echo [PiKaOs] WARNING: could not start Postgres. Is Docker Desktop running?
  echo           Backend will fail to connect until Postgres is up.
  echo.
)

REM commands each tab/window runs (cmd /k keeps it open)
set "BE_CMD=call .venv\Scripts\activate.bat && uvicorn app.main:app --reload --port 8000"
set "FE_CMD=npm run dev"

where wt >nul 2>nul
if %errorlevel%==0 (
  echo [PiKaOs] Opening Windows Terminal tabs: Backend ^| Frontend
  wt -w pikaos new-tab --title "PiKaOs API" -d "%BACKEND%" cmd /k "%BE_CMD%" ; new-tab --title "PiKaOs Web" -d "%FRONTEND%" cmd /k "%FE_CMD%"
) else (
  echo [PiKaOs] Windows Terminal not found - opening separate windows.
  start "PiKaOs API"  cmd /k "cd /d "%BACKEND%"  && %BE_CMD%"
  start "PiKaOs Web"  cmd /k "cd /d "%FRONTEND%" && %FE_CMD%"
)

echo.
echo [PiKaOs] API  -> http://localhost:8000/docs
echo [PiKaOs] Web  -> http://localhost:5173
endlocal
