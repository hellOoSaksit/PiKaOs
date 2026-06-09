@echo off
REM ============================================================
REM  GuildOS - v0.1 Sitemap Beta - first-time setup
REM  Creates the Python venv, installs backend + frontend deps,
REM  and writes backend\.env from the example if missing.
REM ============================================================
setlocal
set "ROOT=%~dp0"
set "BACKEND=%ROOT%backend"
set "FRONTEND=%ROOT%frontend"

echo [GuildOS] === Backend setup ===
pushd "%BACKEND%"
if not exist ".venv\Scripts\python.exe" (
  echo [GuildOS] Creating virtualenv...
  python -m venv .venv || goto :fail
)
call .venv\Scripts\activate.bat
python -m pip install --upgrade pip
python -m pip install -r requirements.txt || goto :fail
if not exist ".env" (
  echo [GuildOS] Creating backend\.env from .env.example
  copy /y ".env.example" ".env" >nul
)
call .venv\Scripts\deactivate.bat
popd

echo.
echo [GuildOS] === Frontend setup ===
pushd "%FRONTEND%"
call npm install || goto :fail
popd

echo.
echo [GuildOS] Setup complete. Make sure Docker Desktop is running, then: run.bat
endlocal
exit /b 0

:fail
echo [GuildOS] Setup FAILED. See errors above.
popd
endlocal
exit /b 1
