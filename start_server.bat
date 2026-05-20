@echo off
setlocal EnableExtensions
cd /d "%~dp0"

rem Force the API port used by the local launcher.
rem A user .env from an older build may still contain PORT=8787.
set "PORT=8790"
set "HOST=127.0.0.1"
set "CORS_ORIGIN=http://127.0.0.1:5190,http://localhost:5190"

title Pharma News API 8790

echo ============================================================
echo Pharma News API Server - 127.0.0.1:%PORT%
echo ============================================================
echo.
echo Log file: server.log
echo.

if exist server.log del /q server.log >nul 2>&1

echo [%date% %time%] Starting API server > server.log
echo Root folder: %cd% >> server.log
echo Effective HOST: %HOST% >> server.log
echo Effective PORT: %PORT% >> server.log
echo Effective CORS_ORIGIN: %CORS_ORIGIN% >> server.log

echo [1/4] Check server package
if not exist "server\package.json" (
  echo ERROR: server\package.json not found. >> server.log
  echo ERROR: server\package.json not found.
  pause
  exit /b 1
)

echo [2/4] Check .env
if not exist ".env" (
  echo ERROR: .env not found. Run run_local.bat first. >> server.log
  echo ERROR: .env not found. Run run_local.bat first.
  pause
  exit /b 1
)

echo [3/4] Verify server dependencies
set "SERVER_DEPS_OK=1"
if not exist "server\node_modules\express\package.json" set "SERVER_DEPS_OK=0"
if not exist "server\node_modules\@supabase\supabase-js\package.json" set "SERVER_DEPS_OK=0"
if not exist "server\node_modules\cors\package.json" set "SERVER_DEPS_OK=0"
if not exist "server\node_modules\compression\package.json" set "SERVER_DEPS_OK=0"
if not exist "server\node_modules\morgan\package.json" set "SERVER_DEPS_OK=0"
if "%SERVER_DEPS_OK%"=="0" (
  echo Server dependencies are missing or incomplete. Running npm install...
  echo Server dependencies are missing or incomplete. Running npm install... >> server.log
  call npm.cmd --prefix server install --registry=https://registry.npmjs.org/ --no-audit --fund=false >> server.log 2>&1
  if errorlevel 1 (
    echo ERROR: server npm install failed. >> server.log
    echo ERROR: server npm install failed.
    pause
    exit /b 1
  )
) else (
  echo Server dependencies verified. >> server.log
  echo Server dependencies verified.
)

echo [4/4] Run API server
echo Running: npm --prefix server run start >> server.log
call npm.cmd --prefix server run start >> server.log 2>&1

echo.
echo API server stopped or failed. Last log lines:
echo ------------------------------------------------------------
type server.log
echo ------------------------------------------------------------
pause
