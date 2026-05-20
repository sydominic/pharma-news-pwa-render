@echo off
setlocal EnableExtensions
cd /d "%~dp0"
set PORT=8790
set HOST=127.0.0.1
set VITE_API_BASE=

set LOG=run_pwa_preview.log
> "%LOG%" echo [%DATE% %TIME%] Start PWA preview

echo ================================================
echo Pharma News PWA Preview - build + single port 8790
echo ================================================
echo.

echo [1/5] Stop old local ports
powershell -NoProfile -ExecutionPolicy Bypass -Command "foreach($p in 5190,8787,8790){try{Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue ^| Select-Object -ExpandProperty OwningProcess -Unique ^| ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }}catch{}}" >> "%LOG%" 2>&1

echo [2/5] Install server packages if needed
if not exist "server\node_modules\express" (
  call npm --prefix server install >> "%LOG%" 2>&1
  if errorlevel 1 goto :error
)

echo [3/5] Install client packages if needed
if not exist "client\node_modules\vite" (
  call npm --prefix client install >> "%LOG%" 2>&1
  if errorlevel 1 goto :error
)

echo [4/5] Build React PWA
call npm --prefix client run build >> "%LOG%" 2>&1
if errorlevel 1 goto :error

echo [5/5] Start Node API + built PWA shell
start "Pharma News PWA Preview - port 8790" cmd /k "cd /d %~dp0 && set PORT=8790&& set HOST=127.0.0.1&& npm --prefix server run start"

echo Waiting for PWA preview: http://127.0.0.1:8790
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ok=$false; for($i=0;$i -lt 45;$i++){try{$r=Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:8790/api/health' -TimeoutSec 2; if($r.StatusCode -eq 200){$ok=$true; break}}catch{}; Start-Sleep -Seconds 1}; if(-not $ok){exit 1}" >> "%LOG%" 2>&1
if errorlevel 1 goto :error
start "" "http://127.0.0.1:8790/?tab=dashboard"
echo.
echo PWA preview is running at http://127.0.0.1:8790
echo Browser install menu can be tested from this preview URL.
echo.
pause
exit /b 0

:error
echo.
echo ERROR: PWA preview failed. Check %LOG%.
type "%LOG%"
pause
exit /b 1
