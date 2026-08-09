export const LIVE_CARD_SHORT_TIME_STOP_VERSION = 'LIVE_CARD_SHORT_TIME_STOP_V1_20260809';
export const LIVE_CARD_SHORT_TIME_STOP_DEFAULT_MS = 24 * 60 * 60 * 1000;

const ACTIVE_STATUSES = new Set([
  'ENTRY_FILLED',
  'PROTECTED',
  'PROTECTION_FAILED',
  'BOT_CLOSE_FAILED',
]);

export function selectExpiredLiveCardShortExecutions(
  executions = [],
  {
    nowMs = Date.now(),
    maxHoldMs = LIVE_CARD_SHORT_TIME_STOP_DEFAULT_MS,
  } = {},
) {
  const now = Number(nowMs);
  const maxHold = Number(maxHoldMs);
  if (!Number.isFinite(now) || !Number.isFinite(maxHold) || maxHold <= 0) return [];
  return (Array.isArray(executions) ? executions : [])
    .filter((row) => {
      if (String(row?.side ?? '').toUpperCase() !== 'SHORT') return false;
      if (!ACTIVE_STATUSES.has(String(row?.status ?? '').toUpperCase())) return false;
      const filledAt = Date.parse(row?.entryFilledAt ?? '');
      return Number.isFinite(filledAt) && now - filledAt >= maxHold;
    })
    .map((row) => ({
      ...row,
      shortTimeStopVersion: LIVE_CARD_SHORT_TIME_STOP_VERSION,
      shortTimeStopMaxHoldMs: maxHold,
      shortTimeStopAgeMs: now - Date.parse(row.entryFilledAt),
    }))
    .sort((a, b) => b.shortTimeStopAgeMs - a.shortTimeStopAgeMs);
}
