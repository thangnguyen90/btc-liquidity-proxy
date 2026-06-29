@echo off
setlocal

REM Daily UTC PnL report for btc-liquidity-proxy paper trades.
REM Default date is the previous UTC day. Pass --date YYYY-MM-DD to override.
REM Example:
REM   scripts\daily-pnl-utc.bat --date 2026-06-29
REM Optional fee override:
REM   scripts\daily-pnl-utc.bat --fee-rate 0.0005

set "WSL_REPO=/home/thangnguyen/project/btc-liquidity-proxy"

wsl -e bash -lc "cd '%WSL_REPO%' && node scripts/daily-pnl-utc.js %*"
set "ERR=%ERRORLEVEL%"

if not "%ERR%"=="0" (
  echo Daily PnL report failed with exit code %ERR%.
)

exit /b %ERR%
