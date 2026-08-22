export const LIQUID_FLOW_V2_KLINE_FRESHNESS_VERSION = 'LIQUID_FLOW_V2_KLINE_FRESHNESS_GATE_V1_20260818';

export const LIQUID_FLOW_V2_KLINE_MAX_AGE_MS = Object.freeze({
  '5m': 12 * 60_000,
  '15m': 25 * 60_000,
  '1h': 75 * 60_000,
  '4h': 270 * 60_000,
});

function finite(value, fallback = null) {
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

export function lastClosedKlineAt(klines = [], now = Date.now()) {
  for (let index = klines.length - 1; index >= 0; index -= 1) {
    const closeTime = finite(klines[index]?.closeTime, null);
    if (closeTime != null && closeTime > 0 && closeTime <= now) return closeTime;
  }
  return null;
}

export function evaluateLiquidFlowV2KlineFreshness({
  klinesByInterval = {},
  now = Date.now(),
  maxAgeByInterval = LIQUID_FLOW_V2_KLINE_MAX_AGE_MS,
} = {}) {
  const intervals = Object.keys(LIQUID_FLOW_V2_KLINE_MAX_AGE_MS);
  const detail = Object.fromEntries(intervals.map((interval) => {
    const rows = Array.isArray(klinesByInterval?.[interval]) ? klinesByInterval[interval] : [];
    const lastClosedAt = lastClosedKlineAt(rows, now);
    const maxAgeMs = finite(maxAgeByInterval?.[interval], LIQUID_FLOW_V2_KLINE_MAX_AGE_MS[interval]);
    const ageMs = lastClosedAt == null ? null : Math.max(0, now - lastClosedAt);
    const stale = lastClosedAt == null || ageMs > maxAgeMs;
    return [interval, {
      interval,
      candleCount: rows.length,
      lastClosedAt,
      ageMs,
      maxAgeMs,
      stale,
    }];
  }));
  const staleIntervals = intervals.filter((interval) => detail[interval].stale);
  return {
    version: LIQUID_FLOW_V2_KLINE_FRESHNESS_VERSION,
    evaluatedAt: now,
    fresh: staleIntervals.length === 0,
    stale: staleIntervals.length > 0,
    staleIntervals,
    intervals: detail,
  };
}

export function liquidFlowV2StaleWaitClassification(freshness = {}) {
  const staleIntervals = Array.isArray(freshness.staleIntervals) ? freshness.staleIntervals : [];
  const ageText = staleIntervals.map((interval) => {
    const ageMs = finite(freshness?.intervals?.[interval]?.ageMs, null);
    return `${interval}:${ageMs == null ? 'missing' : `${Math.round(ageMs / 60_000)}m`}`;
  }).join(', ');
  return {
    version: LIQUID_FLOW_V2_KLINE_FRESHNESS_VERSION,
    labelKey: 'WAIT',
    label: 'DATA STALE - WAIT',
    side: null,
    phase: 'WAIT',
    confidence: 0,
    warmingUp: true,
    dataStale: true,
    staleIntervals,
    reason: `Kline stale (${ageText || 'unknown'}); fail-closed, khong tao paper/Discord/Binance entry.`,
    evidence: [],
    secondaryLabels: [],
  };
}

export function suppressLiquidFlowV2RecoveredSignal({
  recoveringFromStale = false,
  signalCandleClosedAt = 0,
  now = Date.now(),
  maxReplayAgeMs = 15 * 60_000,
} = {}) {
  if (!recoveringFromStale) return false;
  const signalAt = finite(signalCandleClosedAt, 0);
  return signalAt <= 0 || now - signalAt > maxReplayAgeMs;
}
