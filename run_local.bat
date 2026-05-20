@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title Pharma News RSS Dashboard Launcher
set "LOG=run_local.log"
set "API_HOST=127.0.0.1"
set "APP_HOST=127.0.0.1"
set "API_PORT=8790"
set "APP_PORT=5190"
set "APP_URL=http://%APP_HOST%:%APP_PORT%"
set "API_URL=http://%API_HOST%:%API_PORT%/api/health"
set "RESET_URL=%APP_URL%/reset.html?from=launcher_%RANDOM%"

> "%LOG%" echo [%date% %time%] Launcher started
>> "%LOG%" echo APP_URL=%APP_URL%
>> "%LOG%" echo API_URL=%API_URL%

echo ============================================================
echo  Pharma News RSS Dashboard - Local Launcher
echo ============================================================
echo.
>> "%LOG%" echo ============================================================
>> "%LOG%" echo Pharma News RSS Dashboard - Local Launcher
>> "%LOG%" echo ============================================================

call :STEP "[1/9] Check Node.js"
where node.exe >> "%LOG%" 2>&1
if errorlevel 1 call :FAIL "Node.js is not installed or not in PATH. Install Node.js LTS and run again."
node -v
node -v >> "%LOG%" 2>&1

call :STEP "[2/9] Check npm"
where npm.cmd >> "%LOG%" 2>&1
if errorlevel 1 call :FAIL "npm.cmd is not available in PATH. Reinstall Node.js LTS and check Add to PATH."
call npm.cmd -v
call npm.cmd -v >> "%LOG%" 2>&1
if errorlevel 1 call :FAIL "npm version check failed. See run_local.log."

call :STEP "[3/9] Check .env"
if not exist ".env" (
  echo .env does not exist. Creating .env from .env.example.
  >> "%LOG%" echo .env does not exist. Creating .env from .env.example.
  copy /Y ".env.example" ".env" >> "%LOG%" 2>&1
  echo Notepad will open. Fill Supabase values, save, then close Notepad.
  start /wait notepad.exe ".env"
)

findstr /C:"https://xxxxx.supabase.co" ".env" >nul 2>&1
if not errorlevel 1 (
  echo .env still contains placeholder SUPABASE_URL.
  start /wait notepad.exe ".env"
)
findstr /C:"sb_secret_xxxxx" ".env" >nul 2>&1
if not errorlevel 1 (
  echo .env still contains placeholder SUPABASE_SERVICE_KEY.
  start /wait notepad.exe ".env"
)
findstr /B /C:"SUPABASE_URL=https://" ".env" >nul 2>&1
if errorlevel 1 call :FAIL ".env does not contain valid SUPABASE_URL. Example: SUPABASE_URL=https://xxxxx.supabase.co"
findstr /B /C:"SUPABASE_SERVICE_KEY=" ".env" >nul 2>&1
if errorlevel 1 call :FAIL ".env does not contain SUPABASE_SERVICE_KEY."
echo .env check passed.
>> "%LOG%" echo .env check passed.

call :STEP "[4/9] Stop old local servers on ports 5190, 8787 and 8790"
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ports=@(5190,8787,8790); foreach($p in $ports){ Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $op=$_.OwningProcess; if($op -and $op -ne $PID){ Write-Output ('Stop PID '+$op+' on port '+$p); Stop-Process -Id $op -Force -ErrorAction SilentlyContinue } } }" >> "%LOG%" 2>&1
rem Fallback for older Windows shells.
for %%P in (%APP_PORT% 8787 %API_PORT%) do (
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr :%%P ^| findstr LISTENING') do (
    echo Stop PID %%A on port %%P
    >> "%LOG%" echo Stop PID %%A on port %%P
    taskkill /PID %%A /F >> "%LOG%" 2>&1
  )
)

timeout /t 2 /nobreak >nul

call :STEP "[5/9] Install server packages if needed"
set "SERVER_DEPS_OK=1"
if not exist "server\node_modules\express\package.json" set "SERVER_DEPS_OK=0"
if not exist "server\node_modules\@supabase\supabase-js\package.json" set "SERVER_DEPS_OK=0"
if not exist "server\node_modules\cors\package.json" set "SERVER_DEPS_OK=0"
if not exist "server\node_modules\compression\package.json" set "SERVER_DEPS_OK=0"
if not exist "server\node_modules\morgan\package.json" set "SERVER_DEPS_OK=0"
if "%SERVER_DEPS_OK%"=="0" (
  echo Installing or repairing server packages. This can take a few minutes...
  >> "%LOG%" echo Installing or repairing server packages...
  call npm.cmd --prefix server install --registry=https://registry.npmjs.org/ --no-audit --fund=false >> "%LOG%" 2>&1
  if errorlevel 1 call :FAIL "server npm install failed. See run_local.log."
) else (
  echo server packages already installed and verified.
  >> "%LOG%" echo server packages already installed and verified.
)

call :STEP "[6/9] Install client packages if needed"
set "CLIENT_DEPS_OK=1"
if not exist "client\node_modules\@vitejs\plugin-react\package.json" set "CLIENT_DEPS_OK=0"
if not exist "client\node_modules\vite\package.json" set "CLIENT_DEPS_OK=0"
if not exist "client\node_modules\react\package.json" set "CLIENT_DEPS_OK=0"
if not exist "client\node_modules\react-dom\package.json" set "CLIENT_DEPS_OK=0"
if "%CLIENT_DEPS_OK%"=="0" (
  echo Installing or repairing client packages. This can take a few minutes...
  >> "%LOG%" echo Installing or repairing client packages...
  call npm.cmd --prefix client install --registry=https://registry.npmjs.org/ --no-audit --fund=false >> "%LOG%" 2>&1
  if errorlevel 1 call :FAIL "client npm install failed. See run_local.log."
) else (
  echo client packages already installed and verified.
  >> "%LOG%" echo client packages already installed and verified.
)

call :STEP "[7/9] Start API server and wait for health"
start "Pharma News API %API_PORT%" cmd /k ""%~dp0start_server.bat""

echo Waiting for API health: %API_URL%
>> "%LOG%" echo Waiting for API health: %API_URL%
set "API_OK=0"
for /L %%I in (1,1,60) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; try { $r=Invoke-RestMethod -Uri '%API_URL%' -TimeoutSec 2; if($r.ok -eq $true){ exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
  if not errorlevel 1 (
    set "API_OK=1"
    goto :API_READY
  )
  if %%I==10 echo Still waiting for API server...
  if %%I==10 echo Still waiting for API server...>> "%LOG%"
  if %%I==30 echo API wait continues. Check server window if this takes too long.
  if %%I==30 echo API wait continues.>> "%LOG%"
  timeout /t 1 /nobreak >nul
)

:API_READY
if not "%API_OK%"=="1" (
  echo ERROR: API server did not become ready.
  echo ERROR: API server did not become ready.>> "%LOG%"
  echo.
  echo Check server.log and the API server window.
  if exist server.log (
    echo ------------------------------------------------------------
    type server.log
    echo ------------------------------------------------------------
  )
  pause
  exit /b 1
)

echo API server is ready.
>> "%LOG%" echo API server is ready.

call :STEP "[8/9] Start React client and wait for page"
start "Pharma News React %APP_PORT%" cmd /k ""%~dp0start_client.bat""

echo Waiting for React client: %APP_URL%
>> "%LOG%" echo Waiting for React client: %APP_URL%
set "APP_OK=0"
for /L %%I in (1,1,50) do (
  powershell -NoProfile -ExecutionPolicy Bypass -Command "$ProgressPreference='SilentlyContinue'; try { $r=Invoke-WebRequest -Uri '%APP_URL%/?probe=1' -UseBasicParsing -TimeoutSec 2; if($r.StatusCode -eq 200){ exit 0 } else { exit 1 } } catch { exit 1 }" >nul 2>&1
  if not errorlevel 1 (
    set "APP_OK=1"
    goto :APP_READY
  )
  timeout /t 1 /nobreak >nul
)

:APP_READY
if not "%APP_OK%"=="1" (
  echo ERROR: React client did not become ready.
  echo ERROR: React client did not become ready.>> "%LOG%"
  echo.
  echo Check client.log and the React client window.
  if exist client.log (
    echo ------------------------------------------------------------
    type client.log
    echo ------------------------------------------------------------
  )
  pause
  exit /b 1
)

echo React client is ready.
>> "%LOG%" echo React client is ready.

call :STEP "[9/9] Open browser with local reset URL"
start "" "%RESET_URL%"

echo.
echo Launcher finished.
echo App: %APP_URL%
echo API: %API_URL%
echo.
echo Use 127.0.0.1 addresses for this local build. Do not use old localhost tabs.
echo If a blank page remains, open: %APP_URL%/reset.html
>> "%LOG%" echo Launcher finished.
>> "%LOG%" echo Opened %RESET_URL%
pause
exit /b 0

:STEP
echo.
echo %~1
echo %~1>> "%LOG%"
exit /b 0

:FAIL
echo.
echo ERROR: %~1
echo ERROR: %~1>> "%LOG%"
echo.
echo See run_local.log in this folder.
pause
exit /b 1
