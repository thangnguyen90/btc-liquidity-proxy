export const COIN_LEVEL_EARLY_LONG_WATCH_VERSION =
  'COIN_LEVEL_EARLY_LONG_WATCH_V3_SCORE_3TF_20260922';

export const COIN_LEVEL_EARLY_LONG_MIN_SCORE = 65;

const RULE = Object.freeze({
  preferredMaxBelowBreakoutPct: 0.8,
  preferredMaxAboveBreakoutPct: 0.35,
  outerMaxBelowBreakoutPct: 1.25,
  outerMaxAboveBreakoutPct: 0.6,
  minVolumeRatio: 1.3,
  minQuoteVolume: 50_000,
  minTakerBuyPct: 55,
  maxRangeAtr: 1.8,
  maxEma13DistanceAtr: 1.25,
  hardMaxRangeAtr: 2.6,
  hardMaxEma13DistanceAtr: 2,
});

export const COIN_LEVEL_EARLY_LONG_EXCLUSION_LABELS = Object.freeze({
  INVALID_SYMBOL: 'mã coin không hợp lệ',
  MISSING_5M_DATA: 'thiếu nến 5m',
  MISSING_15M_DATA: 'thiếu nến 15m',
  MISSING_1H_DATA: 'thiếu nến 1h',
  STALE_5M: 'nến 5m chưa đóng hoặc đã cũ',
  INVALID_PRICE_OR_INDICATOR: 'giá/EMA/ATR không hợp lệ',
  TREND_15M_DOWN: 'xu hướng 15m đang DOWN',
  TREND_1H_DOWN: 'xu hướng 1h đang DOWN',
  TREND_ALIGNMENT_WEAK: '15m/1h chưa đủ đồng thuận tăng',
  FAR_FROM_BREAKOUT: 'giá còn quá xa hoặc vượt mốc quá nhiều',
  EMA_MOMENTUM_WEAK: 'động lượng EMA/nến 5m yếu',
  FLOW_WEAK: 'volume/taker mua chưa đủ điểm',
  OVEREXTENDED: 'nến hoặc khoảng cách EMA quá giãn',
  SCORE_BELOW_THRESHOLD: `điểm LONG sớm dưới ${COIN_LEVEL_EARLY_LONG_MIN_SCORE}`,
});

const number = (value) => Number(value);
const round = (value, digits = 2) => Number(value.toFixed(digits));

function median(values) {
  const sorted = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function ema(values, period) {
  if (values.length < period || values.slice(0, period).some((value) => !Number.isFinite(value))) return null;
  let result = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  const alpha = 2 / (period + 1);
  for (const value of values.slice(period)) {
    if (!Number.isFinite(value)) return null;
    result = value * alpha + result * (1 - alpha);
  }
  return result;
}

function atr(rows, period = 14) {
  if (!Array.isArray(rows) || rows.length < period + 1) return null;
  const selected = rows.slice(-(period + 1));
  const ranges = selected.slice(1).map((row, index) => {
    const previousClose = number(selected[index]?.close);
    const high = number(row?.high);
    const low = number(row?.low);
    if (![previousClose, high, low].every(Number.isFinite)) return null;
    return Math.max(high - low, Math.abs(high - previousClose), Math.abs(low - previousClose));
  });
  return ranges.every(Number.isFinite)
    ? ranges.reduce((sum, value) => sum + value, 0) / ranges.length
    : null;
}

function frameTrend(rows) {
  const closes = rows.map((row) => number(row.close));
  const last = rows.at(-1);
  const previous = rows.at(-2) ?? last;
  const ema13 = ema(closes, 13);
  const ema25 = ema(closes, 25);
  const ema99 = ema(closes, 99);
  if (![number(last?.close), number(previous?.close), ema13, ema25, ema99].every(Number.isFinite)) {
    return null;
  }
  let score = 0;
  score += number(last.close) >= ema13 ? 1 : -1;
  score += number(last.close) >= ema25 ? 1 : -1;
  score += number(last.close) >= ema99 ? 1 : -1;
  score += ema13 >= ema25 ? 0.75 : -0.75;
  if (number(last.close) !== number(previous.close)) score += number(last.close) > number(previous.close) ? 0.5 : -0.5;
  return { score, state: score >= 2 ? 'UP' : score <= -2 ? 'DOWN' : 'MIXED' };
}

function rejected(reasons, extra = {}) {
  return { accepted: false, watch: null, reasons: [...new Set(reasons)], ...extra };
}

// Scored pre-breakout pressure watch. Only 5m/15m/1h closed/fresh data is
// mandatory. The 4h cache and the confirmed-candidate analyzer are deliberately
// excluded so warm-up of an unused frame cannot hide an early observation.
export function evaluateCoinLevelEarlyLongWatch({
  symbol, klinesByInterval, trendScore, now = Date.now(),
} = {}) {
  const normalizedSymbol = String(symbol ?? '');
  const rows5m = klinesByInterval?.['5m'];
  const rows15m = klinesByInterval?.['15m'];
  const rows1h = klinesByInterval?.['1h'];
  if (!/^[A-Z0-9]{2,40}USDT$/.test(normalizedSymbol)) return rejected(['INVALID_SYMBOL']);
  const missing = [];
  if (!Array.isArray(rows5m) || rows5m.length < 40) missing.push('MISSING_5M_DATA');
  if (!Array.isArray(rows15m) || rows15m.length < 24) missing.push('MISSING_15M_DATA');
  if (!Array.isArray(rows1h) || rows1h.length < 100) missing.push('MISSING_1H_DATA');
  if (missing.length) return rejected(missing);

  const latest = rows5m.at(-1);
  const previous = rows5m.at(-2);
  const latestAt = number(latest?.closeTime);
  if (!(latestAt > 0) || latestAt > now || now - latestAt > 6 * 60_000) {
    return rejected(['STALE_5M']);
  }

  const closes = rows5m.map((row) => number(row.close));
  const ema13 = ema(closes, 13);
  const ema25 = ema(closes, 25);
  const previousEma13 = ema(closes.slice(0, -1), 13);
  const latestClose = number(latest.close);
  const breakoutLevel = Math.max(...rows15m.slice(-12).map((row) => number(row.high)));
  const atr14 = atr(rows5m, 14);
  const frame15m = frameTrend(rows15m);
  const frame1h = frameTrend(rows1h);
  if (![ema13, ema25, previousEma13, latestClose, breakoutLevel, atr14]
    .every((value) => Number.isFinite(value) && value > 0) || !frame15m || !frame1h) {
    return rejected(['INVALID_PRICE_OR_INDICATOR']);
  }

  const breakoutProgressPct = (latestClose / breakoutLevel - 1) * 100;
  const quoteVolume = number(latest.quoteVolume);
  const priorVolume = median(rows5m.slice(-21, -1).map((row) => number(row.quoteVolume)));
  const takerBuyVolume = number(latest.takerBuyQuoteVolume);
  const volumeRatio = quoteVolume >= 0 && priorVolume > 0 ? quoteVolume / priorVolume : null;
  const takerBuyPct = quoteVolume > 0 && takerBuyVolume >= 0 && takerBuyVolume <= quoteVolume
    ? (takerBuyVolume / quoteVolume) * 100
    : null;
  const range = number(latest.high) - number(latest.low);
  const rangeAtr = Number.isFinite(range) && range >= 0 ? range / atr14 : null;
  const ema13DistanceAtr = (latestClose - ema13) / atr14;
  const recentLows = rows5m.slice(-3).map((row) => number(row.low));
  if (!Number.isFinite(breakoutProgressPct) || !Number.isFinite(rangeAtr)
    || !Number.isFinite(ema13DistanceAtr)) {
    return rejected(['INVALID_PRICE_OR_INDICATOR']);
  }

  const trendPoints = (frame15m.state === 'UP' ? 15 : frame15m.state === 'MIXED' ? 7 : 0)
    + (frame1h.state === 'UP' ? 10 : frame1h.state === 'MIXED' ? 5 : 0);
  let proximityPoints = 0;
  if (breakoutProgressPct >= -RULE.preferredMaxBelowBreakoutPct
    && breakoutProgressPct <= RULE.preferredMaxAboveBreakoutPct) proximityPoints = 20;
  else if (breakoutProgressPct >= -RULE.outerMaxBelowBreakoutPct
    && breakoutProgressPct <= RULE.outerMaxAboveBreakoutPct) proximityPoints = 12;

  const emaMomentumPoints = (latestClose > ema13 ? 6 : 0)
    + (latestClose > ema25 ? 5 : 0)
    + (ema13 > previousEma13 ? 5 : 0)
    + (latestClose > number(latest.open) ? 2 : 0)
    + (latestClose > number(previous.close) ? 2 : 0);
  const higherLowPoints = recentLows.every((value) => value > 0)
    ? (recentLows[2] > recentLows[1] ? 6 : 0)
      + (recentLows[1] >= recentLows[0] * 0.999 ? 4 : 0)
    : 0;
  const volumePoints = quoteVolume >= RULE.minQuoteVolume ? 4 : quoteVolume >= 20_000 ? 2 : 0;
  const ratioPoints = volumeRatio >= RULE.minVolumeRatio ? 8
    : volumeRatio >= 1.1 ? 5 : volumeRatio >= 1 ? 3 : 0;
  const takerPoints = takerBuyPct >= RULE.minTakerBuyPct ? 8
    : takerBuyPct >= 52 ? 5 : takerBuyPct >= 50 ? 3 : 0;
  const flowPoints = volumePoints + ratioPoints + takerPoints;
  const antiChasePoints = (rangeAtr <= RULE.maxRangeAtr ? 2.5 : 0)
    + (ema13DistanceAtr <= RULE.maxEma13DistanceAtr ? 2.5 : 0);
  const components = {
    trend: round(trendPoints, 1),
    proximity: round(proximityPoints, 1),
    emaMomentum: round(emaMomentumPoints, 1),
    higherLows: round(higherLowPoints, 1),
    flow: round(flowPoints, 1),
    antiChase: round(antiChasePoints, 1),
  };
  const earlyScore = round(Object.values(components).reduce((sum, value) => sum + value, 0), 1);
  const reasons = [];
  if (frame15m.state === 'DOWN') reasons.push('TREND_15M_DOWN');
  if (frame1h.state === 'DOWN') reasons.push('TREND_1H_DOWN');
  if (trendPoints < 17) reasons.push('TREND_ALIGNMENT_WEAK');
  if (proximityPoints === 0) reasons.push('FAR_FROM_BREAKOUT');
  if (emaMomentumPoints < 8) reasons.push('EMA_MOMENTUM_WEAK');
  if (flowPoints < 10 || (takerBuyPct != null && takerBuyPct < 45)) reasons.push('FLOW_WEAK');
  if (rangeAtr > RULE.hardMaxRangeAtr || ema13DistanceAtr > RULE.hardMaxEma13DistanceAtr) {
    reasons.push('OVEREXTENDED');
  }
  if (earlyScore < COIN_LEVEL_EARLY_LONG_MIN_SCORE) reasons.push('SCORE_BELOW_THRESHOLD');
  const metrics = {
    earlyScore,
    scoreComponents: components,
    frameStates: { '15m': frame15m.state, '1h': frame1h.state },
    frameScores: { '15m': round(frame15m.score, 2), '1h': round(frame1h.score, 2) },
    breakoutProgressPct: round(breakoutProgressPct, 3),
    volumeRatio: volumeRatio == null ? null : round(volumeRatio),
    takerBuyPct: takerBuyPct == null ? null : round(takerBuyPct),
    rangeAtr: rangeAtr == null ? null : round(rangeAtr),
    ema13DistanceAtr: round(ema13DistanceAtr),
  };
  if (reasons.length) return rejected(reasons, metrics);

  const invalidationPrice = Math.min(...recentLows) * 0.9975;
  const softMisses = [
    latestClose > ema13 ? null : 'CLOSE_BELOW_EMA13',
    latestClose > ema25 ? null : 'CLOSE_BELOW_EMA25',
    ema13 > previousEma13 ? null : 'EMA13_NOT_RISING',
    latestClose > number(latest.open) ? null : 'CANDLE_NOT_GREEN',
    latestClose > number(previous.close) ? null : 'CLOSE_NOT_ABOVE_PREVIOUS',
    higherLowPoints === 10 ? null : 'HIGHER_LOWS_INCOMPLETE',
    quoteVolume >= RULE.minQuoteVolume ? null : 'QUOTE_VOLUME_BELOW_50K',
    volumeRatio >= RULE.minVolumeRatio ? null : 'VOLUME_RATIO_BELOW_1_3',
    takerBuyPct >= RULE.minTakerBuyPct ? null : 'TAKER_BUY_BELOW_55',
    rangeAtr <= RULE.maxRangeAtr ? null : 'RANGE_ABOVE_1_8_ATR',
    ema13DistanceAtr <= RULE.maxEma13DistanceAtr ? null : 'EMA_DISTANCE_ABOVE_1_25_ATR',
  ].filter(Boolean);
  const computedTrendScore = Number.isFinite(Number(trendScore))
    ? Number(trendScore) : frame15m.score + frame1h.score;
  return {
    accepted: true,
    reasons: [],
    ...metrics,
    watch: {
      version: COIN_LEVEL_EARLY_LONG_WATCH_VERSION,
      symbol: normalizedSymbol, side: 'LONG', watchOnly: true, binanceEligible: false,
      reason: 'PRE_BREAKOUT_5M_BUY_PRESSURE_SCORE',
      observedAt: latestAt,
      priceAtWatch: round(latestClose, 8),
      breakoutLevel: round(breakoutLevel, 8),
      breakoutGapPct: round((breakoutLevel / latestClose - 1) * 100),
      ema13: round(ema13, 8), ema25: round(ema25, 8),
      volumeRatio: metrics.volumeRatio,
      quoteVolumeUsdt: Number.isFinite(quoteVolume) && quoteVolume >= 0 ? round(quoteVolume, 2) : null,
      takerBuyPct: metrics.takerBuyPct,
      rangeAtr: metrics.rangeAtr, ema13DistanceAtr: metrics.ema13DistanceAtr,
      trendScore: round(computedTrendScore),
      earlyScore,
      scoreComponents: components,
      frameStates: metrics.frameStates,
      softMisses,
      entryZone: { low: round(breakoutLevel, 8), high: round(breakoutLevel * 1.0015, 8) },
      invalidationPrice: round(invalidationPrice, 8),
      entryCondition: 'Chờ nến 5m đóng vượt mốc rồi retest giữ vùng; không mua đuổi cây bơm.',
    },
  };
}

export function detectCoinLevelEarlyLongWatch(input = {}) {
  return evaluateCoinLevelEarlyLongWatch(input).watch;
}
