function finitePositive(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function resolveEmaWarmupReadyTarget(
  totalSymbols,
  {
    configuredMinReady,
    readyRatio = 0.95,
  } = {},
) {
  const total = Math.max(0, Math.floor(Number(totalSymbols) || 0));
  if (total === 0) return 0;

  const ratio = Math.min(1, Math.max(0.5, finitePositive(readyRatio, 0.95)));
  const ratioTarget = Math.max(1, Math.ceil(total * ratio));
  const configured = finitePositive(configuredMinReady, ratioTarget);

  // The absolute setting remains a ceiling for backward compatibility, while
  // the ratio prevents one unavailable symbol from forcing a 100% retry loop.
  return Math.min(total, ratioTarget, Math.floor(configured));
}

export function warmupRetryDelayMs(
  attempt,
  {
    baseMs = 90_000,
    maxMs = 15 * 60_000,
  } = {},
) {
  const safeAttempt = Math.max(0, Math.floor(Number(attempt) || 0));
  const base = finitePositive(baseMs, 90_000);
  const max = Math.max(base, finitePositive(maxMs, 15 * 60_000));
  return Math.min(max, base * (2 ** safeAttempt));
}
