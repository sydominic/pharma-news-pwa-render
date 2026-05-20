@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set "APP_HOST=127.0.0.1"
set "APP_PORT=5190"
set "VITE_API_BASE="

title Pharma News React 5190

echo ============================================================
echo Pharma News React Client - %APP_HOST%:%APP_PORT%
echo ============================================================
echo.
echo Log file: client.log
echo.

if exist client.log del /q client.log >nul 2>&1

echo [%date% %time%] Starting React client > client.log
echo Root folder: %cd% >> client.log
echo Effective APP_HOST: %APP_HOST% >> client.log
echo Effective APP_PORT: %APP_PORT% >> client.log
echo Effective VITE_API_BASE: proxy mode >> client.log

echo [1/3] Check client package
if not exist "client\package.json" (
  echo ERROR: client\package.json not found. >> client.log
  echo ERROR: client\package.json not found.
  pause
  exit /b 1
)

echo [2/3] Verify client dependencies
set "CLIENT_DEPS_OK=1"
if not exist "client\node_modules\@vitejs\plugin-react\package.json" set "CLIENT_DEPS_OK=0"
if not exist "client\node_modules\vite\package.json" set "CLIENT_DEPS_OK=0"
if not exist "client\node_modules\react\package.json" set "CLIENT_DEPS_OK=0"
if not exist "client\node_modules\react-dom\package.json" set "CLIENT_DEPS_OK=0"
if "%CLIENT_DEPS_OK%"=="0" (
  echo Client dependencies are missing or incomplete. Running npm install...
  echo Client dependencies are missing or incomplete. Running npm install... >> client.log
  call npm.cmd --prefix client install --registry=https://registry.npmjs.org/ --no-audit --fund=false >> client.log 2>&1
  if errorlevel 1 (
    echo ERROR: client npm install failed. >> client.log
    echo ERROR: client npm install failed.
    pause
    exit /b 1
  )
) else (
  echo Client dependencies verified. >> client.log
  echo Client dependencies verified.
)

echo [3/3] Run React client
echo Running: npm --prefix client run dev -- --host %APP_HOST% --port %APP_PORT% --strictPort >> client.log
call npm.cmd --prefix client run dev -- --host %APP_HOST% --port %APP_PORT% --strictPort >> client.log 2>&1

echo.
echo React client stopped or failed. Last log lines:
echo ------------------------------------------------------------
type client.log
echo ------------------------------------------------------------
pause
