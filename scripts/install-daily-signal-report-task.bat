@echo off
setlocal

set "TASK_NAME=BTC Liquidity Daily Signal Report"
set "SCRIPT_PATH=%~dp0daily-signal-report.bat"
set "TASK_CMD=cmd.exe /c ""%SCRIPT_PATH%"""

schtasks.exe /Create /TN "%TASK_NAME%" /SC DAILY /ST 07:00 /TR "%TASK_CMD%" /F

endlocal
