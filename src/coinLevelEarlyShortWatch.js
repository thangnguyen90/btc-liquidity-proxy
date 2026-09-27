export const COIN_LEVEL_EARLY_SHORT_WATCH_VERSION =
  'COIN_LEVEL_EARLY_SHORT_WATCH_V2_SCORE_3TF_20260922';

export const COIN_LEVEL_EARLY_SHORT_MIN_SCORE = 65;

const RULE = Object.freeze({
  preferredMinPullbackPct: 0.5,
  preferredMaxPullbackPct: 6,
  outerMinPullbackPct: 0.25,
  outerMaxPullbackPct: 8,
  preferredBreakdownBelowPct: 0.6,
  preferredBreakdownAbovePct: 0.8,
  outerBreakdownBelowPct: 1,
  outerBreakdownAbovePct: 1.25,
  minQuoteVolume: 50_000,
  minVolumeRatio: 1.3,
  minTakerSellPct: 55,
  maxRangeAtr: 1.8,
  maxEma13DistanceAtr: 1.25,
  hardMaxRangeAtr: 2.6,
  hardMaxEma13DistanceAtr: 2,
});

export const COIN_LEVEL_EARLY_SHORT_EXCLUSION_LABELS = Object.freeze({
  INVALID_SYMBOL: 'mã coin không hợp lệ',
  MISSING_5M_DATA: 'thiếu nến 5m',
  MISSING_15M_DATA: 'thiếu nến 15m',
  MISSING_1H_DATA: 'thiếu nến 1h',
  STALE_5M: 'nến 5m chưa đóng hoặc đã cũ',
  INVALID_PRICE_OR_INDICATOR: 'giá/EMA/ATR không hợp lệ',
  SETUP_CONTEXT_WEAK: 'chưa có xả sau bơm hoặc áp lực breakdown',
  FAR_FROM_TRIGGER: 'giá còn quá xa vùng kích hoạt',
  EMA_MOMENTUM_WEAK: 'động lượng giảm 5m yếu',
  REJECTION_WEAK: 'chưa có lower-high/râu trên/phá hỗ trợ',
  FLOW_WEAK: 'volume/taker bán chưa đủ điểm',
  OVEREXTENDED: 'nến hoặc khoảng cách EMA quá giãn',
  SCORE_BELOW_THRESHOLD: `điểm SHORT sớm dưới ${COIN_LEVEL_EARLY_SHORT_MIN_SCORE}`,
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

// Observe-only SHORT lead signal. It intentionally supports two causal setups:
// a post-pump fade while higher frames may still look bullish, and bearish
// pressure near the prior 15m floor before the confirmed 15m breakdown exists.
export function evaluateCoinLevelEarlyShortWatch({
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
  const atr14 = atr(rows5m, 14);
  const latestClose = number(latest.close);
  const previousClose = number(previous.close);
  const frame15m = frameTrend(rows15m);
  const frame1h = frameTrend(rows1h);
  const prior15m = rows15m.slice(-13, -1);
  const breakdownLevel = Math.min(...prior15m.map((row) => number(row.low)));
  const recent15m = rows15m.slice(-24);
  const priorLow = Math.min(...recent15m.slice(0, -3).map((row) => number(row.low)));
  const peak15m = Math.max(...recent15m.slice(-4).map((row) => number(row.high)));
  const peak5m = Math.max(...rows5m.slice(-12).map((row) => number(row.high)));
  const peak = Math.max(peak15m, peak5m);
  if (![ema13, ema25, previousEma13, atr14, latestClose, previousClose,
    breakdownLevel, priorLow, peak].every((value) => Number.isFinite(value) && value > 0)
    || !frame15m || !frame1h) {
    return rejected(['INVALID_PRICE_OR_INDICATOR']);
  }

  const pumpPct = (peak / priorLow - 1) * 100;
  const pullbackPct = (1 - latestClose / peak) * 100;
  const breakdownGapPct = (latestClose / breakdownLevel - 1) * 100;
  const quoteVolume = number(latest.quoteVolume);
  const priorVolume = median(rows5m.slice(-21, -1).map((row) => number(row.quoteVolume)));
  const takerBuyVolume = number(latest.takerBuyQuoteVolume);
  const volumeRatio = quoteVolume >= 0 && priorVolume > 0 ? quoteVolume / priorVolume : null;
  const takerSellPct = quoteVolume > 0 && takerBuyVolume >= 0 && takerBuyVolume <= quoteVolume
    ? (1 - takerBuyVolume / quoteVolume) * 100
    : null;
  const range = number(latest.high) - number(latest.low);
  const rangeAtr = Number.isFinite(range) && range >= 0 ? range / atr14 : null;
  const ema13DistanceAtr = (ema13 - latestClose) / atr14;
  if (![pumpPct, pullbackPct, breakdownGapPct, rangeAtr, ema13DistanceAtr].every(Number.isFinite)) {
    return rejected(['INVALID_PRICE_OR_INDICATOR']);
  }

  const bearishTrendPoints = (frame15m.state === 'DOWN' ? 15 : frame15m.state === 'MIXED' ? 7 : 0)
    + (frame1h.state === 'DOWN' ? 10 : frame1h.state === 'MIXED' ? 5 : 0);
  const postPumpContextPoints = (pumpPct >= 8 ? 15 : pumpPct >= 5 ? 10 : 0)
    + (pullbackPct >= RULE.preferredMinPullbackPct && pullbackPct <= RULE.preferredMaxPullbackPct
      ? 10 : pullbackPct >= RULE.outerMinPullbackPct && pullbackPct <= RULE.outerMaxPullbackPct ? 6 : 0);
  const setupMode = postPumpContextPoints >= bearishTrendPoints && postPumpContextPoints >= 16
    ? 'POST_PUMP_FADE'
    : bearishTrendPoints >= 12 ? 'BREAKDOWN_PRESSURE' : null;
  const contextPoints = Math.max(postPumpContextPoints, bearishTrendPoints);

  let proximityPoints = 0;
  if (setupMode === 'POST_PUMP_FADE') {
    if (pullbackPct >= RULE.preferredMinPullbackPct && pullbackPct <= RULE.preferredMaxPullbackPct) {
      proximityPoints = 20;
    } else if (pullbackPct >= RULE.outerMinPullbackPct && pullbackPct <= RULE.outerMaxPullbackPct) {
      proximityPoints = 12;
    }
  } else if (setupMode === 'BREAKDOWN_PRESSURE') {
    if (breakdownGapPct >= -RULE.preferredBreakdownBelowPct
      && breakdownGapPct <= RULE.preferredBreakdownAbovePct) proximityPoints = 20;
    else if (breakdownGapPct >= -RULE.outerBreakdownBelowPct
      && breakdownGapPct <= RULE.outerBreakdownAbovePct) proximityPoints = 12;
  }

  const emaMomentumPoints = (latestClose < ema13 ? 6 : 0)
    + (latestClose < ema25 ? 5 : 0)
    + (ema13 < previousEma13 ? 5 : 0)
    + (latestClose < number(latest.open) ? 2 : 0)
    + (latestClose < previousClose ? 2 : 0);
  const latestRange = number(latest.high) - number(latest.low);
  const upperWickPct = latestRange > 0
    ? ((number(latest.high) - Math.max(number(latest.open), latestClose)) / latestRange) * 100
    : 0;
  const lowerHigh = number(latest.high) < number(previous.high);
  const brokeSupportNow = previousClose >= breakdownLevel && latestClose < breakdownLevel;
  const rejectionPoints = Math.min(10,
    (lowerHigh ? 6 : 0) + (upperWickPct >= 25 ? 4 : 0) + (brokeSupportNow ? 4 : 0));
  const volumePoints = quoteVolume >= RULE.minQuoteVolume ? 4 : quoteVolume >= 20_000 ? 2 : 0;
  const ratioPoints = volumeRatio >= RULE.minVolumeRatio ? 8
    : volumeRatio >= 1.1 ? 5 : volumeRatio >= 1 ? 3 : 0;
  const takerPoints = takerSellPct >= RULE.minTakerSellPct ? 8
    : takerSellPct >= 52 ? 5 : takerSellPct >= 50 ? 3 : 0;
  const flowPoints = volumePoints + ratioPoints + takerPoints;
  const antiChasePoints = (rangeAtr <= RULE.maxRangeAtr ? 2.5 : 0)
    + (ema13DistanceAtr <= RULE.maxEma13DistanceAtr ? 2.5 : 0);
  const components = {
    context: round(Math.min(25, contextPoints), 1),
    proximity: round(proximityPoints, 1),
    emaMomentum: round(emaMomentumPoints, 1),
    rejection: round(rejectionPoints, 1),
    flow: round(flowPoints, 1),
    antiChase: round(antiChasePoints, 1),
  };
  const earlyScore = round(Object.values(components).reduce((sum, value) => sum + value, 0), 1);
  const reasons = [];
  if (!setupMode) reasons.push('SETUP_CONTEXT_WEAK');
  if (proximityPoints === 0) reasons.push('FAR_FROM_TRIGGER');
  if (emaMomentumPoints < 8) reasons.push('EMA_MOMENTUM_WEAK');
  if (rejectionPoints < 4) reasons.push('REJECTION_WEAK');
  if (flowPoints < 10 || (takerSellPct != null && takerSellPct < 45)) reasons.push('FLOW_WEAK');
  if (rangeAtr > RULE.hardMaxRangeAtr || ema13DistanceAtr > RULE.hardMaxEma13DistanceAtr) {
    reasons.push('OVEREXTENDED');
  }
  if (earlyScore < COIN_LEVEL_EARLY_SHORT_MIN_SCORE) reasons.push('SCORE_BELOW_THRESHOLD');
  const metrics = {
    earlyScore,
    scoreComponents: components,
    setupMode,
    frameStates: { '15m': frame15m.state, '1h': frame1h.state },
    frameScores: { '15m': round(frame15m.score, 2), '1h': round(frame1h.score, 2) },
    pumpPct: round(pumpPct),
    pullbackPct: round(pullbackPct),
    breakdownGapPct: round(breakdownGapPct, 3),
    volumeRatio: volumeRatio == null ? null : round(volumeRatio),
    takerSellPct: takerSellPct == null ? null : round(takerSellPct),
    rangeAtr: round(rangeAtr),
    ema13DistanceAtr: round(ema13DistanceAtr),
  };
  if (reasons.length) return rejected(reasons, metrics);

  const recentHigh = Math.max(...rows5m.slice(-3).map((row) => number(row.high)));
  const invalidationPrice = setupMode === 'POST_PUMP_FADE'
    ? peak * 1.0025 : recentHigh * 1.0025;
  const softMisses = [
    latestClose < ema13 ? null : 'CLOSE_ABOVE_EMA13',
    latestClose < ema25 ? null : 'CLOSE_ABOVE_EMA25',
    ema13 < previousEma13 ? null : 'EMA13_NOT_FALLING',
    latestClose < number(latest.open) ? null : 'CANDLE_NOT_RED',
    latestClose < previousClose ? null : 'CLOSE_NOT_BELOW_PREVIOUS',
    lowerHigh ? null : 'LOWER_HIGH_MISSING',
    upperWickPct >= 25 ? null : 'UPPER_WICK_BELOW_25',
    quoteVolume >= RULE.minQuoteVolume ? null : 'QUOTE_VOLUME_BELOW_50K',
    volumeRatio >= RULE.minVolumeRatio ? null : 'VOLUME_RATIO_BELOW_1_3',
    takerSellPct >= RULE.minTakerSellPct ? null : 'TAKER_SELL_BELOW_55',
    rangeAtr <= RULE.maxRangeAtr ? null : 'RANGE_ABOVE_1_8_ATR',
    ema13DistanceAtr <= RULE.maxEma13DistanceAtr ? null : 'EMA_DISTANCE_ABOVE_1_25_ATR',
  ].filter(Boolean);
  const computedTrendScore = Number.isFinite(Number(trendScore))
    ? Number(trendScore) : frame15m.score + frame1h.score;
  const reason = setupMode === 'POST_PUMP_FADE'
    ? 'EARLY_SHORT_SCORE_POST_PUMP_FADE' : 'EARLY_SHORT_SCORE_BREAKDOWN_PRESSURE';
  return {
    accepted: true,
    reasons: [],
    ...metrics,
    watch: {
      version: COIN_LEVEL_EARLY_SHORT_WATCH_VERSION,
      symbol: normalizedSymbol, side: 'SHORT', watchOnly: true, binanceEligible: false,
      reason, setupMode,
      observedAt: latestAt,
      priceAtWatch: round(latestClose, 8),
      peakPrice: round(peak, 8),
      pumpPct: metrics.pumpPct, pullbackPct: metrics.pullbackPct,
      breakdownLevel: round(breakdownLevel, 8), breakdownGapPct: metrics.breakdownGapPct,
      ema13: round(ema13, 8), ema25: round(ema25, 8),
      volumeRatio: metrics.volumeRatio,
      quoteVolumeUsdt: Number.isFinite(quoteVolume) && quoteVolume >= 0 ? round(quoteVolume, 2) : null,
      takerSellPct: metrics.takerSellPct,
      rangeAtr: metrics.rangeAtr, ema13DistanceAtr: metrics.ema13DistanceAtr,
      trendScore: round(computedTrendScore),
      earlyScore,
      scoreComponents: components,
      frameStates: metrics.frameStates,
      softMisses,
      referenceLevel: round(ema13, 8),
      entryZone: { low: round(ema13 * 0.9985, 8), high: round(ema13 * 1.0015, 8) },
      invalidationPrice: round(invalidationPrice, 8),
      entryCondition: setupMode === 'POST_PUMP_FADE'
        ? 'Chờ giá hồi EMA13 và nến 5m đóng reject; không SHORT đuổi cây đang rơi.'
        : 'Chờ phá đáy 15m rồi retest 5m không lấy lại vùng; không SHORT đuổi dưới hỗ trợ.',
    },
  };
}

export function detectCoinLevelEarlyShortWatch(input = {}) {
  return evaluateCoinLevelEarlyShortWatch(input).watch;
}
