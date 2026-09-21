export const HTF_DEEP_DUMP_BASE_RECLAIM_VERSION =
  'HTF_DEEP_DUMP_BASE_RECLAIM_LONG_SHORT_V4_SHORT_LARGE_REBOUND_20260914';

export const HTF_DEEP_DUMP_EARLY_WATCH = 'EARLY_WATCH';
export const HTF_DEEP_DUMP_RETEST_LONG_READY = 'RETEST_LONG_READY';
export const HTF_DEEP_PUMP_EARLY_SHORT_WATCH = 'EARLY_SHORT_WATCH';
export const HTF_DEEP_PUMP_RETEST_SHORT_READY = 'RETEST_SHORT_READY';

export const HTF_DEEP_DUMP_BASE_RECLAIM_RULE = Object.freeze({
  atrPeriod: 14,
  baselineBars: 48,
  priorLowBars: 24,
  minShockPct: 5,
  shockAtrMultiple: 2.5,
  minBreakPriorLowPct: 3,
  minShockConfirmations: 2,
  minTrueRangeRatio: 3,
  minQuoteVolumeRatio: 3,
  minLowerWickShare: 0.40,
  extremeMinConditions: 2,
  extremeShockPct: 12,
  extremeTrueRangeRatio: 8,
  extremeQuoteVolumeRatio: 10,
  extremeBreakPriorLowPct: 10,
  baseMaxCloseBreakAtr: 0.5,
  baseMaxRangeShockFraction: 0.45,
  baseMaxMedianVolumeRatio: 0.70,
  baseDoubleLowToleranceAtr: 0.5,
  acceptedWickMinClosePosition: 0.55,
  acceptedWickFirstCloseToleranceAtr: 0.25,
  // The HTF base already supplies the waiting period. One newly closed 15m
  // candle can raise WATCH; READY still needs a later closed retest candle.
  earlyMinClosedBars: 1,
  earlyVolumeBaselineBars: 20,
  earlyMinQuoteVolumeRatio: 1.5,
  retestMaxBars: 8,
  retestTouchTolerancePct: 0.005,
  retestLowToleranceAtr: 0.25,
  // Once the 15m EARLY candle has closed, allow only the next three fully
  // closed 5m candles to confirm the same retest. The normal 15m READY path
  // remains available when this tighter, earlier confirmation is absent.
  fastRetestMaxBars: 3,
  fastRetestTouchTolerancePct: 0.003,
  fastRetestLowToleranceAtr: 0.25,
  fastMaxSignalAgeMs: 5 * 60_000 + 90_000,
  // A SHORT retest is not a second straight dump candle. Require a completed
  // swing-low -> material rebound -> renewed fade before calling it READY.
  shortReboundLookbackBars: 12,
  shortMinReboundPct: 1.5,
  shortMinReboundAtr: 1.25,
  shortMinFadePct: 1,
  shortMinFadeAtr: 0.75,
  shortReboundReachTolerancePct: 0.005,
  maxSignalAgeMs: 15 * 60_000 + 90_000,
});

const INTERVAL_MS = Object.freeze({
  '5m': 5 * 60_000,
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '4h': 4 * 60 * 60_000,
});

const BASE_WINDOWS = Object.freeze({
  '1h': Object.freeze({ minBars: 4, maxBars: 48, maxRangeShockFraction: 0.45 }),
  // Four-hour bases are coarse. ALLO-like double bottoms can retrace most of
  // the shock leg while still respecting the capitulation low.
  '4h': Object.freeze({ minBars: 2, maxBars: 12, maxRangeShockFraction: 0.80 }),
});

function finite(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function round(value, digits = 6) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
}

function mean(values) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function median(values) {
  if (!values.length || values.some((value) => !Number.isFinite(value))) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function normalizeBar(row) {
  return {
    openTime: finite(row?.openTime ?? row?.[0]),
    open: finite(row?.open ?? row?.[1]),
    high: finite(row?.high ?? row?.[2]),
    low: finite(row?.low ?? row?.[3]),
    close: finite(row?.close ?? row?.[4]),
    volume: finite(row?.volume ?? row?.[5]),
    closeTime: finite(row?.closeTime ?? row?.[6]),
    quoteVolume: finite(row?.quoteVolume ?? row?.quoteAssetVolume ?? row?.[7]),
    trades: finite(row?.trades ?? row?.tradeCount ?? row?.numberOfTrades ?? row?.[8]),
  };
}

// The cache also contains the currently forming candle. It is deliberately
// discarded before validation so no live OHLC can influence a historical
// baseline or either event tier.
function normalizeClosedBars(rows, interval, now) {
  const duration = INTERVAL_MS[interval];
  if (!duration || !Array.isArray(rows) || !Number.isFinite(now)) return [];
  const bars = rows
    .map(normalizeBar)
    .filter((bar) => Number.isFinite(bar.closeTime) && bar.closeTime < now)
    .sort((left, right) => left.openTime - right.openTime);
  if (bars.some((bar, index) => (
    ![
      bar.openTime, bar.open, bar.high, bar.low, bar.close,
      bar.volume, bar.closeTime,
    ].every(Number.isFinite)
    || bar.openTime < 0
    || bar.low <= 0
    || bar.volume < 0
    || bar.high < Math.max(bar.open, bar.close)
    || bar.low > Math.min(bar.open, bar.close)
    || bar.closeTime - bar.openTime !== duration - 1
    || (index > 0 && bar.openTime - bars[index - 1].openTime !== duration)
  ))) return [];
  return bars;
}

function trueRange(bars, index) {
  if (index < 1 || !bars[index]) return null;
  const bar = bars[index];
  const previousClose = bars[index - 1].close;
  return Math.max(
    bar.high - bar.low,
    Math.abs(bar.high - previousClose),
    Math.abs(bar.low - previousClose),
  );
}

function atrBefore(bars, index, period) {
  if (index < period + 1) return null;
  const ranges = [];
  for (let cursor = index - period; cursor < index; cursor += 1) {
    const range = trueRange(bars, cursor);
    if (!(range > 0)) return null;
    ranges.push(range);
  }
  return mean(ranges);
}

function emaSeries(bars, period) {
  const output = new Array(bars.length).fill(null);
  if (bars.length < period) return output;
  let value = mean(bars.slice(0, period).map((bar) => bar.close));
  output[period - 1] = value;
  const alpha = 2 / (period + 1);
  for (let index = period; index < bars.length; index += 1) {
    value = alpha * bars[index].close + (1 - alpha) * value;
    output[index] = value;
  }
  return output;
}

function shockAt(bars, index, rule, side = 'LONG') {
  if (index < rule.baselineBars + 1 || index < rule.priorLowBars) return null;
  const event = bars[index];
  const previousClose = bars[index - 1].close;
  const atr = atrBefore(bars, index, rule.atrPeriod);
  const long = side === 'LONG';
  const eventBoundary = long ? event.low : event.high;
  if (!(atr > 0) || !(long ? previousClose > eventBoundary : eventBoundary > previousClose)) return null;

  const priorRanges = [];
  for (let cursor = index - rule.baselineBars; cursor < index; cursor += 1) {
    const range = trueRange(bars, cursor);
    if (!(range > 0)) return null;
    priorRanges.push(range);
  }
  const priorBars = bars.slice(index - rule.baselineBars, index);
  const priorBoundaryBars = bars.slice(index - rule.priorLowBars, index);
  const priorBoundary = long
    ? Math.min(...priorBoundaryBars.map((bar) => bar.low))
    : Math.max(...priorBoundaryBars.map((bar) => bar.high));
  const shockLeg = long ? previousClose - eventBoundary : eventBoundary - previousClose;
  const shockPct = shockLeg / previousClose * 100;
  const atrPct = atr / previousClose * 100;
  const minimumShockPct = Math.max(rule.minShockPct, rule.shockAtrMultiple * atrPct);
  const breakPriorLowPct = long
    ? (priorBoundary - eventBoundary) / priorBoundary * 100
    : (eventBoundary - priorBoundary) / priorBoundary * 100;
  if (shockPct < minimumShockPct || breakPriorLowPct < rule.minBreakPriorLowPct) return null;

  const baselineRange = median(priorRanges);
  const baselineQuoteVolume = median(priorBars.map((bar) => bar.quoteVolume));
  const eventRange = event.high - event.low;
  const eventTrueRange = trueRange(bars, index);
  const trRatio = atr > 0 ? eventTrueRange / atr : null;
  const quoteVolumeRatio = baselineQuoteVolume > 0 && event.quoteVolume >= 0
    ? event.quoteVolume / baselineQuoteVolume
    : null;
  const lowerWickShare = eventRange > 0
    ? (long
      ? Math.max(0, Math.min(event.open, event.close) - event.low) / eventRange
      : Math.max(0, event.high - Math.max(event.open, event.close)) / eventRange)
    : 0;
  const closePosition = eventRange > 0
    ? (long ? event.close - event.low : event.high - event.close) / eventRange
    : 0;
  const confirmationFlags = {
    trueRange: trRatio >= rule.minTrueRangeRatio,
    quoteVolume: quoteVolumeRatio >= rule.minQuoteVolumeRatio,
    lowerWick: lowerWickShare >= rule.minLowerWickShare,
  };
  const confirmationCount = Object.values(confirmationFlags).filter(Boolean).length;
  if (confirmationCount < rule.minShockConfirmations) return null;

  const extremeFlags = {
    shock: shockPct >= rule.extremeShockPct,
    trueRange: trRatio >= rule.extremeTrueRangeRatio,
    quoteVolume: quoteVolumeRatio >= rule.extremeQuoteVolumeRatio,
    priorLowBreak: breakPriorLowPct >= rule.extremeBreakPriorLowPct,
  };
  const extremeConditionCount = Object.values(extremeFlags).filter(Boolean).length;
  return {
    index,
    event,
    previousClose,
    atr,
    atrPct,
    shockLeg,
    shockPct,
    minimumShockPct,
    priorLow: priorBoundary,
    breakPriorLowPct,
    eventTrueRange,
    baselineRange,
    trRatio,
    baselineQuoteVolume,
    quoteVolumeRatio,
    lowerWickShare,
    closePosition,
    confirmationFlags,
    confirmationCount,
    extremeFlags,
    extremeConditionCount,
    shockTier: extremeConditionCount >= rule.extremeMinConditions ? 'EXTREME' : 'DEEP',
  };
}

function baseBeforeEarly(htfBars, shock, early, htfInterval, rule, config, side = 'LONG') {
  const defaults = BASE_WINDOWS[htfInterval];
  const minBars = finite(config.baseMinBars, defaults.minBars);
  const maxBars = finite(config.baseMaxBars, defaults.maxBars);
  const maxRangeShockFraction = finite(
    config.baseMaxRangeShockFraction,
    defaults.maxRangeShockFraction ?? rule.baseMaxRangeShockFraction,
  );
  let endIndex = shock.index;
  while (endIndex + 1 < htfBars.length
    && htfBars[endIndex + 1].closeTime < early.openTime) endIndex += 1;
  const count = endIndex - shock.index;
  if (count < minBars || count > maxBars) return null;

  const bars = htfBars.slice(shock.index + 1, endIndex + 1);
  const baseHigh = Math.max(...bars.map((bar) => bar.high));
  const baseLow = Math.min(...bars.map((bar) => bar.low));
  const baseMinClose = Math.min(...bars.map((bar) => bar.close));
  const baseMaxClose = Math.max(...bars.map((bar) => bar.close));
  const baseRange = baseHigh - baseLow;
  const baseRangeShockFraction = baseRange / shock.shockLeg;
  const baseVolumes = bars.map((bar) => bar.quoteVolume);
  const medianBaseQuoteVolume = median(baseVolumes);
  const baseMedianVolumeRatio = medianBaseQuoteVolume != null && shock.event.quoteVolume > 0
    ? medianBaseQuoteVolume / shock.event.quoteVolume
    : null;
  const long = side === 'LONG';
  const closeFloor = long
    ? shock.event.low - rule.baseMaxCloseBreakAtr * shock.atr
    : shock.event.high + rule.baseMaxCloseBreakAtr * shock.atr;
  const noCloseBreak = long ? baseMinClose >= closeFloor : baseMaxClose <= closeFloor;
  const higherOrDoubleLow = long
    ? baseLow >= shock.event.low - rule.baseDoubleLowToleranceAtr * shock.atr
    : baseHigh <= shock.event.high + rule.baseDoubleLowToleranceAtr * shock.atr;
  const firstBaseClose = bars[0].close;
  const immediateAcceptedWick = shock.lowerWickShare >= rule.minLowerWickShare
    && shock.closePosition >= rule.acceptedWickMinClosePosition
    && (long
      ? firstBaseClose >= shock.event.close - rule.acceptedWickFirstCloseToleranceAtr * shock.atr
      : firstBaseClose <= shock.event.close + rule.acceptedWickFirstCloseToleranceAtr * shock.atr);
  if (!noCloseBreak
    || baseRangeShockFraction > maxRangeShockFraction
    || !(baseMedianVolumeRatio <= rule.baseMaxMedianVolumeRatio)
    || (!higherOrDoubleLow && !immediateAcceptedWick)) return null;

  return {
    bars,
    count,
    startAt: bars[0].openTime,
    endAt: bars.at(-1).closeTime,
    baseHigh,
    baseLow,
    baseMinClose,
    baseMaxClose,
    baseRange,
    baseRangeShockFraction,
    medianBaseQuoteVolume,
    baseMedianVolumeRatio,
    closeFloor,
    neckline: long ? baseHigh : baseLow,
    structure: higherOrDoubleLow
      ? (long ? 'HIGHER_OR_DOUBLE_LOW' : 'LOWER_OR_DOUBLE_HIGH')
      : 'IMMEDIATE_ACCEPTED_WICK',
    higherOrDoubleLow,
    immediateAcceptedWick,
  };
}

function earlyAt(bars15m, index, ema13, base, rule, side = 'LONG') {
  const baselineStart = index - rule.earlyVolumeBaselineBars;
  if (baselineStart < 0 || !(ema13[index] > 0)) return null;
  const signal = bars15m[index];
  const postBase = bars15m.filter((bar) => (
    bar.openTime > base.endAt && bar.closeTime <= signal.closeTime
  ));
  if (postBase.length < rule.earlyMinClosedBars
    || postBase[0].openTime !== base.endAt + 1) return null;
  const long = side === 'LONG';
  const noNewLow = long
    ? Math.min(...postBase.map((bar) => bar.low)) >= base.baseLow
    : Math.max(...postBase.map((bar) => bar.high)) <= base.baseHigh;
  const baselineQuoteVolume = median(
    bars15m.slice(baselineStart, index).map((bar) => bar.quoteVolume),
  );
  const breakoutQuoteVolumeRatio = baselineQuoteVolume > 0 && signal.quoteVolume >= 0
    ? signal.quoteVolume / baselineQuoteVolume
    : null;
  if (!noNewLow
    || (long ? signal.close <= base.neckline : signal.close >= base.neckline)
    || (long ? signal.close <= ema13[index] : signal.close >= ema13[index])
    || !(breakoutQuoteVolumeRatio >= rule.earlyMinQuoteVolumeRatio)) return null;
  return {
    index,
    signal,
    postBaseBars: postBase.length,
    ema13: ema13[index],
    baselineQuoteVolume,
    breakoutQuoteVolumeRatio,
  };
}

function shortLargeReboundBeforeReject(pathBars, signal, supportLow, atr, rule) {
  const eligible = [...pathBars]
    .filter((bar) => bar.openTime > 0
      && bar.closeTime < signal.openTime
      && [bar.open, bar.high, bar.low, bar.close].every(Number.isFinite))
    .sort((left, right) => left.openTime - right.openTime)
    .slice(-rule.shortReboundLookbackBars);
  if (eligible.length < 2 || !(atr > 0) || !(supportLow > 0)) return null;
  let best = null;
  for (let lowIndex = 0; lowIndex < eligible.length - 1; lowIndex += 1) {
    const swingLow = eligible[lowIndex].low;
    for (let peakIndex = lowIndex + 1; peakIndex < eligible.length; peakIndex += 1) {
      const peak = eligible[peakIndex].high;
      const reboundPct = (peak / swingLow - 1) * 100;
      const reboundAtr = (peak - swingLow) / atr;
      const fadePct = (peak - signal.close) / peak * 100;
      const fadeAtr = (peak - signal.close) / atr;
      const hasBullishRecovery = eligible
        .slice(lowIndex + 1, peakIndex + 1)
        .some((bar) => bar.close > bar.open);
      const reachesRetestZone = peak >= supportLow * (1 - rule.shortReboundReachTolerancePct);
      if (!hasBullishRecovery
        || !reachesRetestZone
        || reboundPct < rule.shortMinReboundPct
        || reboundAtr < rule.shortMinReboundAtr
        || fadePct < rule.shortMinFadePct
        || fadeAtr < rule.shortMinFadeAtr) continue;
      const candidate = {
        low: swingLow,
        lowAt: eligible[lowIndex].openTime,
        peak,
        peakAt: eligible[peakIndex].openTime,
        bars: peakIndex - lowIndex,
        reboundPct,
        reboundAtr,
        fadePct,
        fadeAtr,
      };
      if (!best || candidate.reboundAtr > best.reboundAtr
        || (candidate.reboundAtr === best.reboundAtr && candidate.peakAt > best.peakAt)) {
        best = candidate;
      }
    }
  }
  return best;
}

function retestAt(bars15m, index, ema13, base, early, rule, side = 'LONG') {
  const signal = bars15m[index];
  const barsSinceBase = bars15m.filter((bar) => (
    bar.openTime > base.endAt && bar.closeTime <= signal.closeTime
  ));
  const long = side === 'LONG';
  const noNewLow = barsSinceBase.length > 0 && (long
    ? Math.min(...barsSinceBase.map((bar) => bar.low)) >= base.baseLow
    : Math.max(...barsSinceBase.map((bar) => bar.high)) <= base.baseHigh);
  const atr = atrBefore(bars15m, index, rule.atrPeriod);
  if (!(atr > 0) || !(ema13[index] > 0)) return null;
  const supportHigh = Math.max(base.neckline, ema13[index]);
  const supportLow = Math.min(base.neckline, ema13[index]);
  const touched = long
    ? signal.low <= supportHigh * (1 + rule.retestTouchTolerancePct)
    : signal.high >= supportLow * (1 - rule.retestTouchTolerancePct);
  const held = long
    ? signal.low >= supportLow - rule.retestLowToleranceAtr * atr && signal.close >= supportHigh
    : signal.high <= supportHigh + rule.retestLowToleranceAtr * atr && signal.close <= supportLow;
  const bullishClose = long ? signal.close > signal.open : signal.close < signal.open;
  const shortRebound = long ? null : shortLargeReboundBeforeReject(
    [
      early.signal,
      ...bars15m.filter((bar) => bar.openTime > early.signal.closeTime),
    ],
    signal,
    supportLow,
    atr,
    rule,
  );
  if (!noNewLow || !touched || !held || !bullishClose || (!long && !shortRebound)) return null;
  return {
    index,
    signal,
    ema13: ema13[index],
    atr,
    supportHigh,
    supportLow,
    touched,
    held,
    bullishClose,
    barsAfterEarly: index - early.index,
    shortRebound,
  };
}

function fastRetestAt(bars5m, bars15m, base, early, rule, side = 'LONG') {
  if (!bars5m.length) return null;
  const postEarly = bars5m.filter((bar) => (
    bar.openTime > early.signal.closeTime
      && bar.closeTime <= early.signal.closeTime
        + rule.fastRetestMaxBars * INTERVAL_MS['5m']
  ));
  if (!postEarly.length
    || postEarly.length > rule.fastRetestMaxBars
    || postEarly[0].openTime !== early.signal.closeTime + 1) return null;
  const signal = postEarly.at(-1);
  const atr = atrBefore(bars15m, early.index, rule.atrPeriod);
  if (!(atr > 0) || !(early.ema13 > 0)) return null;
  const long = side === 'LONG';
  const noInvalidation = long
    ? Math.min(...postEarly.map((bar) => bar.low)) >= base.baseLow
    : Math.max(...postEarly.map((bar) => bar.high)) <= base.baseHigh;
  const supportHigh = Math.max(base.neckline, early.ema13);
  const supportLow = Math.min(base.neckline, early.ema13);
  const touched = long
    ? signal.low <= supportHigh * (1 + rule.fastRetestTouchTolerancePct)
    : signal.high >= supportLow * (1 - rule.fastRetestTouchTolerancePct);
  const held = long
    ? signal.low >= supportLow - rule.fastRetestLowToleranceAtr * atr
      && signal.close >= supportHigh
    : signal.high <= supportHigh + rule.fastRetestLowToleranceAtr * atr
      && signal.close <= supportLow;
  const directionalClose = long ? signal.close > signal.open : signal.close < signal.open;
  const shortRebound = long ? null : shortLargeReboundBeforeReject(
    [
      early.signal,
      ...postEarly.slice(0, -1),
    ],
    signal,
    supportLow,
    atr,
    rule,
  );
  if (!noInvalidation
    || !touched
    || !held
    || !directionalClose
    || (!long && !shortRebound)) return null;
  return {
    signal,
    ema13: early.ema13,
    atr,
    supportHigh,
    supportLow,
    touched,
    held,
    bullishClose: directionalClose,
    barsAfterEarly: null,
    bars5mAfterEarly: postEarly.length,
    confirmationInterval: '5m',
    fastConfirmation: true,
    shortRebound,
  };
}

function buildEvent({ symbol, htfInterval, now, shock, base, early, retest = null, side = 'LONG' }) {
  const ready = Boolean(retest);
  const long = side === 'LONG';
  const signal = ready ? retest.signal : early.signal;
  const episodeBucketAt = Math.floor(
    shock.event.openTime / INTERVAL_MS['4h'],
  ) * INTERVAL_MS['4h'];
  const stage = ready
    ? (long ? HTF_DEEP_DUMP_RETEST_LONG_READY : HTF_DEEP_PUMP_RETEST_SHORT_READY)
    : (long ? HTF_DEEP_DUMP_EARLY_WATCH : HTF_DEEP_PUMP_EARLY_SHORT_WATCH);
  return {
    version: HTF_DEEP_DUMP_BASE_RECLAIM_VERSION,
    type: long ? 'HTF_DEEP_DUMP_BASE_RECLAIM_LONG' : 'HTF_DEEP_PUMP_BASE_REJECT_SHORT',
    symbol,
    interval: '15m',
    htfInterval,
    confirmationInterval: ready ? (retest.confirmationInterval ?? '15m') : '15m',
    fastConfirmation: ready && retest.fastConfirmation === true,
    side,
    action: ready ? side : 'WATCH',
    stage,
    tier: stage,
    observeOnly: !ready,
    binanceEligible: ready,
    executionEligible: ready,
    executionEnabled: false,
    closed: true,
    watchReady: !ready,
    longReady: long && ready,
    shortReady: !long && ready,
    generatedAt: new Date(now).toISOString(),
    observedAt: now,
    candleAt: signal.openTime,
    candleCloseAt: signal.closeTime,
    price: signal.close,
    sourceCandleAt: shock.event.openTime,
    sourceCandleCloseAt: shock.event.closeTime,
    episodeBucketAt,
    eventLow: shock.event.low,
    eventHigh: shock.event.high,
    eventClose: shock.event.close,
    eventQuoteVolume: shock.event.quoteVolume,
    shockTier: shock.shockTier,
    shockPct: round(shock.shockPct),
    pumpPct: long ? null : round(shock.shockPct),
    minimumShockPct: round(shock.minimumShockPct),
    shockAtrPct: round(shock.atrPct),
    shockAtrMultiple: round(shock.shockLeg / shock.atr),
    priorLow: shock.priorLow,
    priorHigh: long ? null : shock.priorLow,
    breakPriorLowPct: round(shock.breakPriorLowPct),
    breakPriorHighPct: long ? null : round(shock.breakPriorLowPct),
    trueRangeRatio: round(shock.trRatio),
    quoteVolumeRatio: round(shock.quoteVolumeRatio),
    lowerWickShare: round(shock.lowerWickShare),
    upperWickShare: long ? null : round(shock.lowerWickShare),
    shockConfirmationCount: shock.confirmationCount,
    shockConfirmations: shock.confirmationFlags,
    extremeConditionCount: shock.extremeConditionCount,
    extremeConditions: shock.extremeFlags,
    baseStartAt: base.startAt,
    baseEndAt: base.endAt,
    baseBars: base.count,
    baseLow: base.baseLow,
    baseHigh: base.baseHigh,
    baseNeckline: base.neckline,
    baseRangeShockFraction: round(base.baseRangeShockFraction),
    baseMedianVolumeRatio: round(base.baseMedianVolumeRatio),
    baseStructure: base.structure,
    ema13: round(ready ? retest.ema13 : early.ema13),
    earlyAt: early.signal.closeTime,
    earlyCandleAt: early.signal.openTime,
    earlyPrice: early.signal.close,
    earlyPostBaseBars: early.postBaseBars,
    breakoutQuoteVolumeRatio: round(early.breakoutQuoteVolumeRatio),
    readyAt: ready ? retest.signal.closeTime : null,
    retestBarsAfterEarly: ready ? retest.barsAfterEarly : null,
    retestBars5mAfterEarly: ready ? (retest.bars5mAfterEarly ?? null) : null,
    retestAtr: ready ? round(retest.atr) : null,
    retestSupportLow: ready ? round(retest.supportLow) : null,
    retestSupportHigh: ready ? round(retest.supportHigh) : null,
    shortReboundLow: ready ? round(retest.shortRebound?.low) : null,
    shortReboundLowAt: ready ? (retest.shortRebound?.lowAt ?? null) : null,
    shortReboundHigh: ready ? round(retest.shortRebound?.peak) : null,
    shortReboundHighAt: ready ? (retest.shortRebound?.peakAt ?? null) : null,
    shortReboundBars: ready ? (retest.shortRebound?.bars ?? null) : null,
    shortReboundPct: ready ? round(retest.shortRebound?.reboundPct) : null,
    shortReboundAtrMultiple: ready ? round(retest.shortRebound?.reboundAtr) : null,
    shortFadePct: ready ? round(retest.shortRebound?.fadePct) : null,
    shortFadeAtrMultiple: ready ? round(retest.shortRebound?.fadeAtr) : null,
    dedupeKey: [
      long ? 'HTF_DEEP_DUMP_BASE_RECLAIM' : 'HTF_DEEP_PUMP_BASE_REJECT',
      symbol, episodeBucketAt, stage,
    ].join('|'),
    reason: ready
      ? (long
        ? `${htfInterval} deep dump formed a quiet base; a later closed ${retest.confirmationInterval ?? '15m'} bullish retest held the base neckline and EMA13.`
        : `${htfInterval} deep pump formed a quiet top; a later closed ${retest.confirmationInterval ?? '15m'} bearish retest failed below the base neckline and EMA13.`)
      : (long
        ? `${htfInterval} deep dump formed a quiet base; the latest closed 15m candle reclaimed the base neckline and EMA13 on volume.`
        : `${htfInterval} deep pump formed a quiet top; the latest closed 15m candle broke below the base neckline and EMA13 on volume.`),
  };
}

function candidateRank(left, right) {
  return right.sourceCandleAt - left.sourceCandleAt
    || right.extremeConditionCount - left.extremeConditionCount
    || right.earlyAt - left.earlyAt
    || right.shockPct - left.shockPct;
}

/**
 * Pure, state-free detector. RETEST_LONG_READY is reconstructed from closed
 * history and therefore does not depend on an EARLY_WATCH having been stored or
 * delivered by a caller.
 */
function detectDirectionalHtfBaseReclaim(
  htfRows,
  rows15m,
  {
    symbol,
    htfInterval,
    now = Date.now(),
    side = 'LONG',
    rows5m = [],
    ...config
  } = {},
) {
  if (!symbol || !BASE_WINDOWS[htfInterval] || !Number.isFinite(now)) return [];
  const rule = { ...HTF_DEEP_DUMP_BASE_RECLAIM_RULE, ...config };
  const htfBars = normalizeClosedBars(htfRows, htfInterval, now);
  const bars15m = normalizeClosedBars(rows15m, '15m', now);
  if (htfBars.length < rule.baselineBars + 2 || bars15m.length < 21) return [];
  const latest15mIndex = bars15m.length - 1;
  const latest15m = bars15m[latest15mIndex];
  if (now - latest15m.closeTime > rule.maxSignalAgeMs) return [];
  const ema13 = emaSeries(bars15m, 13);
  const shocks = [];
  for (let index = rule.baselineBars + 1; index < htfBars.length; index += 1) {
    const shock = shockAt(htfBars, index, rule, side);
    if (shock) shocks.push(shock);
  }
  if (!shocks.length) return [];

  const readyCandidates = [];
  const earliestEarlyIndex = Math.max(0, latest15mIndex - rule.retestMaxBars);
  for (let earlyIndex = latest15mIndex - 1; earlyIndex >= earliestEarlyIndex; earlyIndex -= 1) {
    const earlySignal = bars15m[earlyIndex];
    for (const shock of shocks) {
      const base = baseBeforeEarly(
        htfBars, shock, earlySignal, htfInterval, rule, config, side,
      );
      if (!base) continue;
      const early = earlyAt(bars15m, earlyIndex, ema13, base, rule, side);
      if (!early) continue;
      const retest = retestAt(bars15m, latest15mIndex, ema13, base, early, rule, side);
      if (!retest) continue;
      readyCandidates.push(buildEvent({
        symbol, htfInterval, now, shock, base, early, retest, side,
      }));
    }
  }
  if (readyCandidates.length) return [readyCandidates.sort(candidateRank)[0]];

  const bars5m = normalizeClosedBars(rows5m, '5m', now);
  const latest5m = bars5m.at(-1);
  if (latest5m && now - latest5m.closeTime <= rule.fastMaxSignalAgeMs) {
    const fastReadyCandidates = [];
    for (const shock of shocks) {
      const base = baseBeforeEarly(
        htfBars, shock, latest15m, htfInterval, rule, config, side,
      );
      if (!base) continue;
      const early = earlyAt(bars15m, latest15mIndex, ema13, base, rule, side);
      if (!early) continue;
      const retest = fastRetestAt(bars5m, bars15m, base, early, rule, side);
      if (!retest || retest.signal.closeTime !== latest5m.closeTime) continue;
      fastReadyCandidates.push(buildEvent({
        symbol, htfInterval, now, shock, base, early, retest, side,
      }));
    }
    if (fastReadyCandidates.length) return [fastReadyCandidates.sort(candidateRank)[0]];
  }

  const watchCandidates = [];
  for (const shock of shocks) {
    const base = baseBeforeEarly(
      htfBars, shock, latest15m, htfInterval, rule, config, side,
    );
    if (!base) continue;
    const early = earlyAt(bars15m, latest15mIndex, ema13, base, rule, side);
    if (!early) continue;
    watchCandidates.push(buildEvent({ symbol, htfInterval, now, shock, base, early, side }));
  }
  return watchCandidates.length ? [watchCandidates.sort(candidateRank)[0]] : [];
}

export function detectHtfDeepDumpBaseReclaim(htfRows, rows15m, options = {}) {
  return detectDirectionalHtfBaseReclaim(htfRows, rows15m, { ...options, side: 'LONG' });
}

export function detectHtfDeepPumpBaseReject(htfRows, rows15m, options = {}) {
  return detectDirectionalHtfBaseReclaim(htfRows, rows15m, { ...options, side: 'SHORT' });
}

/**
 * Additive LiquidFlow feature snapshot. It evaluates both HTF sources but
 * keeps execution disabled; the Discord layer chooses at most one strongest
 * fresh event and dedupes 1h/4h views through the shared 4h episode bucket.
 */
export function buildHtfDeepDumpBaseReclaimSnapshot({
  symbol,
  klines5m = [],
  klines15m = [],
  klines1h = [],
  klines4h = [],
  now = Date.now(),
  config1h = {},
  config4h = {},
} = {}) {
  const events = [
    ...detectHtfDeepDumpBaseReclaim(klines4h, klines15m, {
      symbol,
      htfInterval: '4h',
      now,
      rows5m: klines5m,
      ...config4h,
    }),
    ...detectHtfDeepDumpBaseReclaim(klines1h, klines15m, {
      symbol,
      htfInterval: '1h',
      now,
      rows5m: klines5m,
      ...config1h,
    }),
    ...detectHtfDeepPumpBaseReject(klines4h, klines15m, {
      symbol,
      htfInterval: '4h',
      now,
      rows5m: klines5m,
      ...config4h,
    }),
    ...detectHtfDeepPumpBaseReject(klines1h, klines15m, {
      symbol,
      htfInterval: '1h',
      now,
      rows5m: klines5m,
      ...config1h,
    }),
  ].sort((left, right) => (
    Number([HTF_DEEP_DUMP_RETEST_LONG_READY, HTF_DEEP_PUMP_RETEST_SHORT_READY].includes(right.stage))
      - Number([HTF_DEEP_DUMP_RETEST_LONG_READY, HTF_DEEP_PUMP_RETEST_SHORT_READY].includes(left.stage))
  ) || (
    Number(right.shockTier === 'EXTREME') - Number(left.shockTier === 'EXTREME')
  ) || right.sourceCandleAt - left.sourceCandleAt);
  return {
    version: HTF_DEEP_DUMP_BASE_RECLAIM_VERSION,
    observeOnly: !events.some((event) => event.executionEligible),
    executionEligible: events.some((event) => event.executionEligible),
    executionEnabled: false,
    ready: events.length > 0,
    primary: events[0] ?? null,
    events,
    bars: {
      m5: normalizeClosedBars(klines5m, '5m', now).length,
      m15: normalizeClosedBars(klines15m, '15m', now).length,
      h1: normalizeClosedBars(klines1h, '1h', now).length,
      h4: normalizeClosedBars(klines4h, '4h', now).length,
    },
  };
}
