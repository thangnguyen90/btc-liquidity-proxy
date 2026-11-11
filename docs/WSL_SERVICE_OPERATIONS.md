# WSL service availability

Version: WSL_SERVICE_KEEPALIVE_V1_20261111

## Incident and repair, 2026-11-11

The public heatmap intermittently failed after the Windows restart. Cloudflared
was running, but Ubuntu's systemd/PM2 processes were repeatedly recreated
(roughly every 42 seconds in the PM2 log). Merely opening a Windows-side WSL
command woke the origin again. Holding a foreground WSL client stopped the cycle.

Microsoft documents that systemd services alone do not keep a WSL instance alive:
https://learn.microsoft.com/en-us/windows/wsl/systemd

The Windows task **BTC Liquidity WSL Keepalive** now starts at logon for the
current Windows user and runs
C:\Users\admin\Scripts\btc-liquidity-wsl-keepalive.ps1.
Its source copy is scripts/start-wsl-keepalive.ps1 in this repository.
The helper launches a hidden Windows wsl.exe client running /bin/sleep infinity
in Ubuntu as thangnguyen. The sleep process consumes negligible CPU. The existing
btc-liquidity-pm2.service remains responsible for PM2 startup and supervision.

Task settings: ignore duplicate runs, no execution time limit, allow battery
operation, restart a failed task after one minute (up to 999 attempts).
A named mutex prevents duplicate helper instances.

This changes host availability only. There are no signal, classification, data,
Binance, size, entry, SL, TP, statistics or JSON schema changes.
The retired test-b application is not started. The large-volume LiqScan Discord
route remains disabled.

## Verification

- Public /healthz returns 200 with ok=true and Binance user data connected.
- Public BCHUSDT 24h heatmap API returns 200; Model 1 and Model 3 both report OK.
- Monitor that the web PID and PM2 daemon remain unchanged after diagnostic WSL
  clients have exited.

## Maintenance

Before intentional WSL shutdown/compaction, stop the task and its owned hidden
WSL client. Disable the task if the host should remain stopped. Restart the task
after maintenance. Do not launch another web process manually alongside PM2.
Autostart is at Windows user logon; it does not start before that user logs in.
