function finiteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isShakeoutChopChase({ variant, btcMarketRegimeAtEntry } = {}) {
  return String(variant ?? '').toUpperCase() === 'CHASE'
    && String(btcMarketRegimeAtEntry ?? '').toUpperCase() === 'CHOP';
}

export function capShakeoutChopChaseMargin({
  variant,
  btcMarketRegimeAtEntry,
  marginUsdt,
  capUsdt = 1,
} = {}) {
  const margin = finiteNumber(marginUsdt);
  const cap = finiteNumber(capUsdt);
  if (margin == null || margin <= 0 || cap == null || cap <= 0) return margin;
  return isShakeoutChopChase({ variant, btcMarketRegimeAtEntry })
    ? Math.min(margin, cap)
    : margin;
}

// Price that covers both entry and expected exit taker fees for a linear trade.
export function shakeoutFeeBreakEvenPrice({ entryPrice, side, feeRate } = {}) {
  const entry = finiteNumber(entryPrice);
  const fee = finiteNumber(feeRate);
  const tradeSide = String(side ?? '').toUpperCase();
  if (entry == null || entry <= 0 || fee == null || fee < 0 || fee >= 1) return null;
  if (tradeSide === 'LONG') return entry * (1 + fee) / (1 - fee);
  if (tradeSide === 'SHORT') return entry * (1 - fee) / (1 + fee);
  return null;
}

export function calculateBtc5mFlipRate(candles = [], {
  atMs = Date.now(),
  window = 12,
} = {}) {
  const entryMs = finiteNumber(atMs) ?? Date.now();
  const lookback = Math.max(3, Math.floor(finiteNumber(window) ?? 12));
  const closed = (Array.isArray(candles) ? candles : [])
    .filter((candle) => {
      const closeTime = finiteNumber(candle?.closeTime ?? candle?.[6]);
      return closeTime != null && closeTime <= entryMs;
    })
    .slice(-lookback);
  const directions = closed
    .map((candle) => {
      const open = finiteNumber(candle?.open ?? candle?.[1]);
      const close = finiteNumber(candle?.close ?? candle?.[4]);
      if (open == null || close == null) return null;
      if (close > open) return 'UP';
      if (close < open) return 'DOWN';
      return 'FLAT';
    })
    .filter(Boolean);
  let flips = 0;
  let transitions = 0;
  for (let i = 1; i < directions.length; i++) {
    const previous = directions[i - 1];
    const current = directions[i];
    if (previous === 'FLAT' || current === 'FLAT') continue;
    transitions += 1;
    if (previous !== current) flips += 1;
  }
  return {
    timeframe: '5m',
    window: lookback,
    samples: directions.length,
    flips,
    transitions,
    rate: transitions > 0 ? Number((flips / transitions).toFixed(4)) : null,
  };
}
