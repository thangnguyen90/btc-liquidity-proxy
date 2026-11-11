# Keep the Ubuntu service host alive. systemd services alone do not prevent WSL idle shutdown.
# Stop the scheduled task "BTC Liquidity WSL Keepalive" before intentional WSL maintenance.
$ErrorActionPreference = 'Stop'
$keeperMutex = [System.Threading.Mutex]::new($false, 'Local\BTC-Liquidity-WSL-Keepalive')
$keeperOwned = $false
try {
    $keeperOwned = $keeperMutex.WaitOne(0)
    if (-not $keeperOwned) { exit 0 }
    $keeperProcess = Start-Process -FilePath (Join-Path $env:WINDIR 'System32\wsl.exe') -ArgumentList @('--distribution', 'Ubuntu', '--user', 'thangnguyen', '--exec', '/bin/sleep', 'infinity') -WindowStyle Hidden -PassThru
    $keeperProcess.WaitForExit()
    # An unexpected WSL exit should be retried by Task Scheduler.
    exit 1
}
finally {
    if ($keeperOwned) { $keeperMutex.ReleaseMutex() }
    $keeperMutex.Dispose()
}
