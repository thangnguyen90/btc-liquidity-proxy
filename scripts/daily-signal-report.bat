@echo off
setlocal

set "PROJECT_DIR=/home/thangnguyen/project/btc-liquidity-proxy"
set "REPORT_ROOT=D:\btc-liquidity-reports"
set "LOG_DIR=%REPORT_ROOT%\logs"

if not exist "%REPORT_ROOT%" mkdir "%REPORT_ROOT%"
if not exist "%LOG_DIR%" mkdir "%LOG_DIR%"

wsl.exe -d Ubuntu --cd "%PROJECT_DIR%" -- bash -lc "DAILY_SIGNAL_REPORT_ROOT=/mnt/d/btc-liquidity-reports/daily-signal npm run daily-signal-report -- --page ema,pump,liquid,edge" >> "%LOG_DIR%\daily-signal-report.log" 2>&1

endlocal
