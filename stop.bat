@echo off
REM Stops the Postgres container. (Close the API/Web tabs to stop those.)
setlocal
pushd "%~dp0"
echo [GuildOS] Stopping Postgres...
docker compose stop postgres
popd
endlocal
