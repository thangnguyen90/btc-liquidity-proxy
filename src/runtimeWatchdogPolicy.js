export function watchdogSubsystemFailure(payload = {}) {
  const health = payload.userDataHealth;
  if (health?.enabled === true && health?.restartRequired === true) {
    return 'user-data recovery exhausted: ' + String(health.reason ?? 'unknown').slice(0, 100);
  }
  return null;
}

export function watchdogStartupGraceRemainingMs({
  now = Date.now(),
  processStartedAt,
  startupGraceMs,
}) {
  const startedAt = Number(processStartedAt);
  const graceMs = Math.max(0, Number(startupGraceMs) || 0);
  if (!Number.isFinite(startedAt) || startedAt <= 0 || graceMs <= 0) return 0;
  return Math.max(0, (startedAt + graceMs) - Number(now));
}
