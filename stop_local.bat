@echo off
setlocal EnableExtensions
cd /d "%~dp0"

title Stop Pharma News RSS Dashboard

echo Stop local servers on ports 5190, 8787 and 8790...
powershell -NoProfile -ExecutionPolicy Bypass -Command "$ports=@(5190,8787,8790); foreach($p in $ports){ Get-NetTCPConnection -LocalPort $p -State Listen -ErrorAction SilentlyContinue | ForEach-Object { $op=$_.OwningProcess; if($op -and $op -ne $PID){ Write-Output ('Stop PID '+$op+' on port '+$p); Stop-Process -Id $op -Force -ErrorAction SilentlyContinue } } }"
for %%P in (5190 8787 8790) do (
  for /f "tokens=5" %%A in ('netstat -ano ^| findstr :%%P ^| findstr LISTENING') do (
    echo Stop PID %%A on port %%P
    taskkill /PID %%A /F >nul 2>nul
  )
)
echo Done.
pause
