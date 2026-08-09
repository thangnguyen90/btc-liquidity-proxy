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
