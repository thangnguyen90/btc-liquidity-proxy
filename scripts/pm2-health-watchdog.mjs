#!/usr/bin/env node

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { watchdogStartupGraceRemainingMs } from '../src/runtimeWatchdogPolicy.js';

const execFileAsync = promisify(execFile);
const targetUrl = process.env.WATCHDOG_URL ?? 'http://127.0.0.1:19082/healthz';
const targetProcess = process.env.WATCHDOG_PM2_PROCESS ?? 'btc-liquidity-web';
const pm2Binary = process.env.WATCHDOG_PM2_BINARY ?? '/usr/bin/pm2';
const intervalMs = Math.max(5_000, Number(process.env.WATCHDOG_INTERVAL_MS) || 15_000);
const timeoutMs = Math.max(1_000, Number(process.env.WATCHDOG_TIMEOUT_MS) || 5_000);
const failureLimit = Math.max(1, Number(process.env.WATCHDOG_FAILURE_LIMIT) || 2);
const startupGraceMs = Math.max(15_000, Number(process.env.WATCHDOG_STARTUP_GRACE_MS) || 90_000);
const restartGraceMs = Math.max(30_000, Number(process.env.WATCHDOG_RESTART_GRACE_MS) || 120_000);

let consecutiveFailures = 0;
let checkInFlight = false;
let nextCheckAt = Date.now() + startupGraceMs;

async function targetStartupGraceRemainingMs() {
  try {
    const { stdout } = await execFileAsync(pm2Binary, ['jlist'], {
      timeout: 15_000,
      windowsHide: true,
      maxBuffer: 10 * 1024 * 1024,
    });
    const processes = JSON.parse(stdout);
    const target = Array.isArray(processes)
      ? processes.find((row) => row?.name === targetProcess)
      : null;
    return watchdogStartupGraceRemainingMs({
      processStartedAt: target?.pm2_env?.pm_uptime,
      startupGraceMs,
    });
  } catch (error) {
    console.error(`[Watchdog] Could not inspect ${targetProcess} uptime: ${error?.message ?? error}`);
    return 0;
  }
}

async function restartTarget(reason) {
  console.error(`[Watchdog] Restarting ${targetProcess}: ${reason}`);
  try {
    // Do not pass --update-env here. This command runs inside the watchdog's
    // PM2 process, so updating the target from this environment can leak the
    // watchdog's own PM2 settings (notably its 256 MB memory limit) into the
    // web process. A watchdog restart must preserve the target configuration
    // that was loaded from ecosystem.config.cjs.
    await execFileAsync(pm2Binary, ['restart', targetProcess], {
      timeout: 60_000,
      windowsHide: true,
    });
    consecutiveFailures = 0;
    nextCheckAt = Date.now() + restartGraceMs;
    console.log(`[Watchdog] ${targetProcess} restart requested; grace ${restartGraceMs}ms`);
  } catch (error) {
    nextCheckAt = Date.now() + intervalMs;
    console.error(`[Watchdog] PM2 restart failed: ${error?.message ?? error}`);
  }
}

async function checkTarget() {
  if (checkInFlight || Date.now() < nextCheckAt) return;
  checkInFlight = true;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(targetUrl, {
      signal: controller.signal,
      cache: 'no-store',
      headers: { accept: 'application/json' },
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const payload = await response.json();
    if (payload?.ok !== true) throw new Error('invalid health response');
    if (consecutiveFailures > 0) {
      console.log(`[Watchdog] ${targetProcess} recovered after ${consecutiveFailures} failure(s)`);
    }
    consecutiveFailures = 0;
  } catch (error) {
    const graceRemainingMs = await targetStartupGraceRemainingMs();
    if (graceRemainingMs > 0) {
      consecutiveFailures = 0;
      nextCheckAt = Date.now() + graceRemainingMs;
      console.log(
        `[Watchdog] Health failure ignored during target startup grace;`
        + ` ${Math.ceil(graceRemainingMs / 1000)}s remaining.`,
      );
      return;
    }
    consecutiveFailures += 1;
    const reason = error?.name === 'AbortError' ? `timeout ${timeoutMs}ms` : (error?.message ?? String(error));
    console.error(`[Watchdog] Health failure ${consecutiveFailures}/${failureLimit}: ${reason}`);
    if (consecutiveFailures >= failureLimit) {
      await restartTarget(`${consecutiveFailures} consecutive health failures (${reason})`);
    }
  } finally {
    clearTimeout(timeout);
    checkInFlight = false;
  }
}

console.log(
  `[Watchdog] Monitoring ${targetUrl} -> ${targetProcess}; interval=${intervalMs}ms timeout=${timeoutMs}ms failures=${failureLimit}`,
);

const timer = setInterval(() => {
  checkTarget().catch((error) => console.error(`[Watchdog] Unexpected error: ${error?.message ?? error}`));
}, intervalMs);

process.on('SIGINT', () => {
  clearInterval(timer);
  process.exit(0);
});
process.on('SIGTERM', () => {
  clearInterval(timer);
  process.exit(0);
});

await new Promise(() => {});
