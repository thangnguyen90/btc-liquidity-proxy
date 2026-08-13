export const LIQUID_HEATMAP_FLOW_V2_VERSION = 'LIQUID_HEATMAP_FLOW_V2_PRIMARY_PANIC_RECLAIM_V10_20260812';

export const LIQUID_HEATMAP_FLOW_V2_LABELS = Object.freeze({
  UP_SQUEEZE_ACTIVE: Object.freeze({
    key: 'UP_SQUEEZE_ACTIVE',
    title: 'UP SQUEEZE ACTIVE',
    side: 'SHORT',
    phase: 'WAIT',
    description: 'Short squeeze dang chay; khong duoi SHORT khi chua co reject.',
  }),
  UP_SWEEP_SHORT_READY: Object.freeze({
    key: 'UP_SWEEP_SHORT_READY',
    title: 'UP SWEEP · SHORT READY',
    side: 'SHORT',
    phase: 'READY',
    description: 'Da quet cum tren va co xac nhan suy yeu sau squeeze.',
  }),
  UP_BASE_SWEEP_LONG_READY: Object.freeze({
    key: 'UP_BASE_SWEEP_LONG_READY',
    title: 'UP BASE SWEEP · LONG READY',
    side: 'LONG',
    phase: 'READY',
    description: 'Quet day base, giu reclaim va breakout tiep dien theo huong tang.',
  }),
  PRE_UP_BASE_LONG: Object.freeze({
    key: 'PRE_UP_BASE_LONG',
    title: 'PRE UP BASE · LONG',
    side: 'LONG',
    phase: 'READY',
    description: 'Rau nen 5m cham EMA99 roi reclaim; vao som truoc khi du BASE READY.',
  }),
  EXTENDED_EMA99_PANIC_RECLAIM_LONG: Object.freeze({
    key: 'EXTENDED_EMA99_PANIC_RECLAIM_LONG',
    title: 'EXTENDED EMA99 PANIC RECLAIM · LONG',
    side: 'LONG',
    phase: 'READY',
    description: 'Top tang hang 21-60 panic dump ve EMA99 5m roi hoi va reclaim co volume; PAPER EVAL ONLY.',
  }),
  PRIMARY_EMA99_PANIC_FLUSH_ACTIVE: Object.freeze({
    key: 'PRIMARY_EMA99_PANIC_FLUSH_ACTIVE',
    title: 'PRIMARY EMA99 PANIC FLUSH · ACTIVE',
    side: 'LONG',
    phase: 'WAIT',
    description: 'Top tang 1-20 dang bi ban thao ve EMA99 5m; chi ghi nhan, chua bat LONG khi dong tien ban con manh.',
  }),
  PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY: Object.freeze({
    key: 'PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY',
    title: 'PRIMARY EMA99 PANIC RECLAIM · LONG READY',
    side: 'LONG',
    phase: 'READY',
    description: 'Top tang 1-20 da panic flush ve EMA99 5m, hoi khoi day va reclaim khi ap luc ban ha nhiet. PAPER EVAL ONLY.',
  }),
  DOWN_SQUEEZE_ACTIVE: Object.freeze({
    key: 'DOWN_SQUEEZE_ACTIVE',
    title: 'DOWN SQUEEZE ACTIVE',
    side: 'LONG',
    phase: 'WAIT',
    description: 'Long liquidation dang chay; khong bat LONG khi chua reclaim.',
  }),
  DOWN_SWEEP_LONG_READY: Object.freeze({
    key: 'DOWN_SWEEP_LONG_READY',
    title: 'DOWN SWEEP · LONG READY',
    side: 'LONG',
    phase: 'READY',
    description: 'Da quet cum duoi va co xac nhan hap thu/reclaim.',
  }),
  DOWN_BASE_SWEEP_SHORT_READY: Object.freeze({
    key: 'DOWN_BASE_SWEEP_SHORT_READY',
    title: 'DOWN BASE SWEEP · SHORT READY',
    side: 'SHORT',
    phase: 'READY',
    description: 'Quet dinh base, giu reject va breakdown tiep dien theo huong giam.',
  }),
  PRE_DOWN_BASE_SHORT: Object.freeze({
    key: 'PRE_DOWN_BASE_SHORT',
    title: 'PRE DOWN BASE · SHORT',
    side: 'SHORT',
    phase: 'READY',
    description: 'Rau nen 5m cham EMA99 roi reject; vao som truoc khi du BASE READY.',
  }),
  HTF_BEAR_15M_EMA99_PUMP_REJECT: Object.freeze({
    key: 'HTF_BEAR_15M_EMA99_PUMP_REJECT',
    title: 'HTF BEAR · 5M/15M EMA99 PUMP REJECT',
    side: 'SHORT',
    phase: 'READY',
    description: '1h/4h giam; pump 5m hoac 15m quet EMA99 roi dong reject xuong. PAPER EVAL ONLY.',
  }),
  HTF_BULL_15M_EMA99_DUMP_RECLAIM: Object.freeze({
    key: 'HTF_BULL_15M_EMA99_DUMP_RECLAIM',
    title: 'HTF BULL · 5M/15M EMA99 DUMP RECLAIM',
    side: 'LONG',
    phase: 'READY',
    description: '1h/4h tang; dump 5m hoac 15m quet EMA99 roi dong reclaim len. PAPER EVAL ONLY.',
  }),
  PUMP_DISTRIBUTION_WATCH: Object.freeze({
    key: 'PUMP_DISTRIBUTION_WATCH',
    title: 'PUMP DISTRIBUTION · WATCH',
    side: 'SHORT',
    phase: 'WATCH',
    description: 'Pump manh da chuyen sang sideway/phan phoi; cho breakdown va retest that bai. OBSERVE ONLY.',
  }),
  PUMP_DISTRIBUTION_SHORT_READY: Object.freeze({
    key: 'PUMP_DISTRIBUTION_SHORT_READY',
    title: 'PUMP DISTRIBUTION · SHORT READY',
    side: 'SHORT',
    phase: 'READY',
    description: 'Vung phan phoi da breakdown va retest ho tro that bai. PAPER EVAL ONLY.',
  }),
});

const STABLE_PAIR_PATTERN = /^(USDC|FDUSD|TUSD|USDP|BUSD|DAI|EUR|TRY|BRL|JPY|GBP)USDT$/;

function finite(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function mean(values = []) {
  const usable = values.map(Number).filter(Number.isFinite);
  return usable.length ? usable.reduce((sum, value) => sum + value, 0) / usable.length : 0;
}

function pctChange(from, to) {
  const start = finite(from, 0);
  const end = finite(to, 0);
  return start > 0 && end > 0 ? (end - start) / start * 100 : null;
}

function movingAverage(values, period) {
  const usable = values.slice(-period).map(Number).filter(Number.isFinite);
  return usable.length ? mean(usable) : null;
}

function exponentialMovingAverage(values, period) {
  const usable = values.map(Number).filter(Number.isFinite);
  if (usable.length < period) return null;
  let value = mean(usable.slice(0, period));
  const multiplier = 2 / (period + 1);
  for (const price of usable.slice(period)) value = (price - value) * multiplier + value;
  return value;
}

function closedBarsAt(klines = [], now = Date.now(), limit = 180) {
  return (Array.isArray(klines) ? klines : [])
    .filter((bar) => finite(bar?.close, 0) > 0 && (!bar.closeTime || finite(bar.closeTime, 0) <= now))
    .slice(-limit);
}

function buildHtfTrendSnapshot(klines = [], timeframe, now = Date.now()) {
  const bars = closedBarsAt(klines, now, 160);
  const closes = bars.map((bar) => finite(bar.close, 0));
  const ema13 = exponentialMovingAverage(closes, 13);
  const ema25 = exponentialMovingAverage(closes, 25);
  const ema99 = exponentialMovingAverage(closes, 99);
  const priorCloses = closes.slice(0, -3);
  const priorEma13 = exponentialMovingAverage(priorCloses, 13);
  const priorEma25 = exponentialMovingAverage(priorCloses, 25);
  const ema13SlopePct = priorEma13 != null && ema13 != null ? pctChange(priorEma13, ema13) : null;
  const ema25SlopePct = priorEma25 != null && ema25 != null ? pctChange(priorEma25, ema25) : null;
  const recent = bars.slice(-5);
  let lowerHighSteps = 0;
  let lowerLowSteps = 0;
  let higherHighSteps = 0;
  let higherLowSteps = 0;
  for (let index = 1; index < recent.length; index += 1) {
    if (finite(recent[index].high, 0) < finite(recent[index - 1].high, 0)) lowerHighSteps += 1;
    if (finite(recent[index].low, 0) < finite(recent[index - 1].low, 0)) lowerLowSteps += 1;
    if (finite(recent[index].high, 0) > finite(recent[index - 1].high, 0)) higherHighSteps += 1;
    if (finite(recent[index].low, 0) > finite(recent[index - 1].low, 0)) higherLowSteps += 1;
  }
  const close = finite(bars.at(-1)?.close, null);
  const ready = bars.length >= 105 && close != null && ema13 != null && ema25 != null && ema99 != null;
  const bearish = ready
    && close < ema13 && close < ema25
    && ema13SlopePct <= -0.02
    && (ema25SlopePct <= 0.05 || lowerLowSteps >= 2)
    && lowerHighSteps >= 2;
  const bullish = ready
    && close > ema13 && close > ema25
    && ema13SlopePct >= 0.02
    && (ema25SlopePct >= -0.05 || higherHighSteps >= 2)
    && higherLowSteps >= 2;
  return {
    timeframe,
    ready,
    candleCount: bars.length,
    candleClosedAt: finite(bars.at(-1)?.closeTime, null),
    close,
    ema13,
    ema25,
    ema99,
    ema13SlopePct,
    ema25SlopePct,
    lowerHighSteps,
    lowerLowSteps,
    higherHighSteps,
    higherLowSteps,
    bearish,
    bullish,
  };
}

function buildEma99RetestSnapshot(klines = [], now = Date.now(), timeframe = '15m') {
  const bars = closedBarsAt(klines, now, 160);
  const closes = bars.map((bar) => finite(bar.close, 0));
  const ema99 = exponentialMovingAverage(closes, 99);
  const last = bars.at(-1) ?? null;
  const touchBars = bars.slice(-2);
  const context = bars.slice(-10, -2);
  const volumeBase = bars.slice(-22, -2).map((bar) => finite(bar.quoteVolume, 0));
  const touchVolume = touchBars.length ? Math.max(...touchBars.map((bar) => finite(bar.quoteVolume, 0))) : 0;
  const volumeX = mean(volumeBase) > 0 ? touchVolume / mean(volumeBase) : null;
  const touchQuote = touchBars.reduce((sum, bar) => sum + finite(bar.quoteVolume, 0), 0);
  const touchTakerBuy = touchBars.reduce((sum, bar) => sum + finite(bar.takerBuyQuoteVolume, 0), 0);
  const takerDeltaPct = touchQuote > 0 ? (touchTakerBuy * 2 - touchQuote) / touchQuote * 100 : null;
  const touchHigh = touchBars.length ? Math.max(...touchBars.map((bar) => finite(bar.high, 0))) : null;
  const touchLow = touchBars.length ? Math.min(...touchBars.map((bar) => finite(bar.low, Infinity))) : null;
  const contextHigh = context.length ? Math.max(...context.map((bar) => finite(bar.high, 0))) : null;
  const contextLow = context.length ? Math.min(...context.map((bar) => finite(bar.low, Infinity))) : null;
  const close = finite(last?.close, null);
  const priorClose = finite(bars.at(-3)?.close, null);
  const shortTouchDistancePct = ema99 > 0 && touchHigh > 0 ? (touchHigh - ema99) / ema99 * 100 : null;
  const longTouchDistancePct = ema99 > 0 && touchLow > 0 ? (touchLow - ema99) / ema99 * 100 : null;
  const closeDistancePct = ema99 > 0 && close > 0 ? (close - ema99) / ema99 * 100 : null;
  const pumpPct = contextLow > 0 && touchHigh > 0 ? (touchHigh - contextLow) / contextLow * 100 : null;
  const dumpPct = contextHigh > 0 && touchLow > 0 ? (contextHigh - touchLow) / contextHigh * 100 : null;
  const pumpRange = touchHigh > 0 && contextLow > 0 ? touchHigh - contextLow : 0;
  const dumpRange = contextHigh > 0 && touchLow > 0 ? contextHigh - touchLow : 0;
  const givebackRatio = pumpRange > 0 && close != null ? (touchHigh - close) / pumpRange : null;
  const recoveryRatio = dumpRange > 0 && close != null ? (close - touchLow) / dumpRange : null;
  const touchShortCandle = [...touchBars].sort((a, b) => finite(b.high, 0) - finite(a.high, 0))[0] ?? null;
  const touchLongCandle = [...touchBars].sort((a, b) => finite(a.low, Infinity) - finite(b.low, Infinity))[0] ?? null;
  const shortRange = touchShortCandle ? candleRange(touchShortCandle) : 0;
  const longRange = touchLongCandle ? candleRange(touchLongCandle) : 0;
  const upperWick = touchShortCandle
    ? Math.max(0, finite(touchShortCandle.high, 0) - Math.max(finite(touchShortCandle.open, 0), finite(touchShortCandle.close, 0)))
    : 0;
  const lowerWick = touchLongCandle
    ? Math.max(0, Math.min(finite(touchLongCandle.open, 0), finite(touchLongCandle.close, 0)) - finite(touchLongCandle.low, 0))
    : 0;
  const ready = bars.length >= 105 && ema99 != null && last != null && context.length >= 6;
  // Small-cap 5m sweeps frequently pierce EMA99 before reclaiming. Keep the
  // established 15m band unchanged, while allowing a closed 5m wick to travel
  // farther through EMA99; the HTF direction, close, flow and volume guards
  // below still have to confirm the setup.
  const maxSweepThroughPct = timeframe === '5m' ? 15 : 1.5;
  const shortReady = ready
    && priorClose <= ema99 * 0.995
    && shortTouchDistancePct >= -0.6 && shortTouchDistancePct <= maxSweepThroughPct
    && closeDistancePct <= -0.2 && closeDistancePct >= -10
    && pumpPct >= 2 && givebackRatio >= 0.25
    && volumeX >= 1.3 && takerDeltaPct <= 10
    && (close < finite(last.open, close) || upperWick >= shortRange * 0.18);
  const longReady = ready
    && priorClose >= ema99 * 1.005
    && longTouchDistancePct >= -maxSweepThroughPct && longTouchDistancePct <= 0.6
    && closeDistancePct >= 0.2 && closeDistancePct <= 10
    && dumpPct >= 2 && recoveryRatio >= 0.25
    && volumeX >= 1.3 && takerDeltaPct >= -10
    && (close > finite(last.open, close) || lowerWick >= longRange * 0.18);
  return {
    timeframe,
    ready,
    candleCount: bars.length,
    candleClosedAt: finite(last?.closeTime, null),
    ema99,
    close,
    priorClose,
    shortTouchDistancePct,
    longTouchDistancePct,
    closeDistancePct,
    pumpPct,
    dumpPct,
    givebackRatio,
    recoveryRatio,
    volumeX,
    takerDeltaPct,
    shortReady,
    longReady,
  };
}

export function buildPumpDistributionSnapshot(klines = [], change24hPct = 0, now = Date.now(), {
  klines1h = [],
} = {}) {
  // 192 x 15m = 48h. The prior 32-bar window dropped real small-cap
  // distributions after only four hours and made WATCH disappear too quickly.
  const bars = closedBarsAt(klines, now, 220).slice(-192);
  const hourly = closedBarsAt(klines1h, now, 168).slice(-168);
  const empty = {
    ready: false,
    candleCount: bars.length,
    candleClosedAt: finite(bars.at(-1)?.closeTime, null),
    watchReady: false,
    shortReady: false,
    stage: 'NO_DATA',
  };
  if (bars.length < 14) return empty;

  let peakIndex = -1;
  let peakPrice = 0;
  const peakStart = Math.max(5, bars.length - 97);
  const peakEnd = bars.length - 5;
  for (let index = peakStart; index <= peakEnd; index += 1) {
    const high = finite(bars[index]?.high, 0);
    if (high > peakPrice) {
      peakIndex = index;
      peakPrice = high;
    }
  }
  if (peakIndex < 5 || peakPrice <= 0) return empty;

  const prePump = bars.slice(Math.max(0, peakIndex - 24), peakIndex + 1);
  const prePumpLow = Math.min(...prePump.map((bar) => finite(bar.low, Infinity)));
  const localPumpPct = prePumpLow > 0 ? (peakPrice - prePumpLow) / prePumpLow * 100 : null;

  // Use the closed 1h cycle to retain the original pump even after rolling 24h
  // change has cooled. This is the causal replacement for change24h >= 18.
  let cyclePeakIndex = -1;
  let cyclePeakPrice = 0;
  const cyclePeakStart = Math.max(12, hourly.length - 121);
  for (let index = cyclePeakStart; index <= hourly.length - 3; index += 1) {
    const high = finite(hourly[index]?.high, 0);
    if (high > cyclePeakPrice) {
      cyclePeakIndex = index;
      cyclePeakPrice = high;
    }
  }
  const cycleOriginBars = cyclePeakIndex >= 12
    ? hourly.slice(Math.max(0, cyclePeakIndex - 72), cyclePeakIndex + 1)
    : [];
  const cycleOriginPrice = cycleOriginBars.length
    ? Math.min(...cycleOriginBars.map((bar) => finite(bar.low, Infinity)))
    : null;
  const pump72hPct = cycleOriginPrice > 0 && cyclePeakPrice > 0
    ? (cyclePeakPrice - cycleOriginPrice) / cycleOriginPrice * 100
    : null;
  const pumpPct = Math.max(finite(localPumpPct, 0), finite(pump72hPct, 0));
  const effectivePeakPrice = Math.max(peakPrice, cyclePeakPrice);
  const latestClose = finite(bars.at(-1)?.close, null);
  const drawdownFromPeakPct = effectivePeakPrice > 0 && latestClose > 0
    ? (effectivePeakPrice - latestClose) / effectivePeakPrice * 100
    : null;
  const peakToOrigin = effectivePeakPrice > 0 && cycleOriginPrice > 0
    ? effectivePeakPrice - cycleOriginPrice
    : effectivePeakPrice - prePumpLow;
  const unwindProgressPct = peakToOrigin > 0 && latestClose > 0
    ? clamp((effectivePeakPrice - latestClose) / peakToOrigin * 100, 0, 150)
    : null;
  const unwindTier = unwindProgressPct == null
    ? 'NO_DATA'
    : unwindProgressPct < 30 ? 'EARLY_UNWIND'
      : unwindProgressPct < 65 ? 'MID_UNWIND'
        : 'LATE_UNWIND';
  const peakWindow = bars.slice(Math.max(0, peakIndex - 1), Math.min(bars.length, peakIndex + 2));
  const peakVolume = Math.max(...peakWindow.map((bar) => finite(bar.quoteVolume, 0)));
  const barsSincePeak = bars.length - 1 - peakIndex;
  const signal = bars.at(-1);
  if (!signal || barsSincePeak < 4) return {
    ...empty,
    peakAt: finite(bars[peakIndex]?.closeTime, null),
    peakPrice: effectivePeakPrice,
    pumpPct,
    localPumpPct,
    pump72hPct,
    cycleOriginPrice,
    drawdownFromPeakPct,
    unwindProgressPct,
    unwindTier,
    barsSincePeak,
  };

  function summarizeBase(base) {
    const support = Math.min(...base.map((bar) => finite(bar.low, Infinity)));
    const resistance = Math.max(...base.map((bar) => finite(bar.high, 0)));
    const baseRangePct = support > 0 ? (resistance - support) / support * 100 : null;
    let lowerHighSteps = 0;
    let upperWickCount = 0;
    for (let index = 0; index < base.length; index += 1) {
      if (index > 0 && finite(base[index]?.high, 0) < finite(base[index - 1]?.high, 0)) lowerHighSteps += 1;
      const range = candleRange(base[index]);
      const upperWick = Math.max(
        0,
        finite(base[index]?.high, 0) - Math.max(finite(base[index]?.open, 0), finite(base[index]?.close, 0)),
      );
      if (range > 0 && upperWick >= range * 0.25) upperWickCount += 1;
    }
    const baseVolume = mean(base.map((bar) => finite(bar.quoteVolume, 0)));
    const volumeFadeRatio = peakVolume > 0 ? baseVolume / peakVolume : null;
    const baseQuote = base.reduce((sum, bar) => sum + finite(bar.quoteVolume, 0), 0);
    const baseTakerBuy = base.reduce((sum, bar) => sum + finite(bar.takerBuyQuoteVolume, 0), 0);
    const baseTakerDeltaPct = baseQuote > 0 ? (baseTakerBuy * 2 - baseQuote) / baseQuote * 100 : null;
    return {
      support,
      resistance,
      baseRangePct,
      lowerHighSteps,
      upperWickCount,
      baseVolume,
      volumeFadeRatio,
      baseTakerDeltaPct,
    };
  }

  const watchBase = bars.slice(Math.max(peakIndex + 1, bars.length - 18));
  if (watchBase.length < 4) return { ...empty, pumpPct, localPumpPct, pump72hPct, barsSincePeak };
  let baseSummary = summarizeBase(watchBase);
  const adaptiveBaseRangeMaxPct = clamp(pumpPct * 0.35, 14, 28);
  const hasHourlyCycle = hourly.length >= 36 && pump72hPct != null;
  const strongPump = hasHourlyCycle
    ? pumpPct >= 30
    : pumpPct >= 10 && finite(change24hPct, 0) >= 18;
  const structureReady = strongPump
    && baseSummary.baseRangePct != null && baseSummary.baseRangePct <= adaptiveBaseRangeMaxPct
    && drawdownFromPeakPct != null && drawdownFromPeakPct >= 5 && drawdownFromPeakPct <= 70
    && baseSummary.lowerHighSteps >= 2 && baseSummary.upperWickCount >= 2
    && baseSummary.volumeFadeRatio != null && baseSummary.volumeFadeRatio <= 1.05
    && baseSummary.baseTakerDeltaPct != null && baseSummary.baseTakerDeltaPct <= 15
    && barsSincePeak >= 6 && barsSincePeak <= 96;

  // Search the last four closed candles for a breakdown and accept either a
  // failed retest or two closes holding below support. The old detector only
  // accepted exactly bars[-2] + bars[-1], so a valid setup vanished in 15m.
  let breakdownConfirmed = false;
  let retestFailed = false;
  let continuationConfirmed = false;
  let breakdownAt = null;
  let readyAt = null;
  let breakdownVolumeX = null;
  let breakdownTakerDeltaPct = null;
  for (let breakdownIndex = Math.max(peakIndex + 5, bars.length - 5); breakdownIndex < bars.length; breakdownIndex += 1) {
    const candidateBase = bars.slice(Math.max(peakIndex + 1, breakdownIndex - 18), breakdownIndex);
    if (candidateBase.length < 4) continue;
    const candidateSummary = summarizeBase(candidateBase);
    const breakdown = bars[breakdownIndex];
    const volumeX = candidateSummary.baseVolume > 0
      ? finite(breakdown.quoteVolume, 0) / candidateSummary.baseVolume
      : null;
    const quote = finite(breakdown.quoteVolume, 0);
    const takerBuy = finite(breakdown.takerBuyQuoteVolume, 0);
    const takerDelta = quote > 0 ? (takerBuy * 2 - quote) / quote * 100 : null;
    const candidateStructure = strongPump
      && candidateSummary.baseRangePct != null && candidateSummary.baseRangePct <= adaptiveBaseRangeMaxPct
      && drawdownFromPeakPct != null && drawdownFromPeakPct >= 5 && drawdownFromPeakPct <= 70
      && candidateSummary.lowerHighSteps >= 2 && candidateSummary.upperWickCount >= 2
      && candidateSummary.volumeFadeRatio != null && candidateSummary.volumeFadeRatio <= 1.05
      && candidateSummary.baseTakerDeltaPct != null && candidateSummary.baseTakerDeltaPct <= 15
      && barsSincePeak >= 6 && barsSincePeak <= 96;
    const broke = candidateStructure
      && finite(breakdown.close, 0) <= candidateSummary.support * 0.997
      && finite(breakdown.low, 0) < candidateSummary.support
      && volumeX != null && volumeX >= 1.1
      && takerDelta != null && takerDelta <= 0;
    if (!broke) continue;
    const after = bars.slice(breakdownIndex + 1, Math.min(bars.length, breakdownIndex + 5));
    const failedRetestBar = after.find((bar) => {
      const range = candleRange(bar);
      const upperWick = Math.max(
        0,
        finite(bar.high, 0) - Math.max(finite(bar.open, 0), finite(bar.close, 0)),
      );
      return finite(bar.high, 0) >= candidateSummary.support * 0.99
        && finite(bar.close, 0) <= candidateSummary.support * 1.001
        && (finite(bar.close, 0) < finite(bar.open, 0) || (range > 0 && upperWick >= range * 0.2));
    });
    const failed = Boolean(failedRetestBar);
    const below = [breakdown, ...after].filter((bar) => finite(bar.close, 0) <= candidateSummary.support * 0.997);
    const continuation = below.length >= 2
      && finite(below.at(-1)?.close, 0) <= candidateSummary.support * 0.995;
    breakdownConfirmed = true;
    retestFailed = failed;
    continuationConfirmed = continuation;
    breakdownAt = finite(breakdown.closeTime, null);
    readyAt = failed
      ? finite(failedRetestBar?.closeTime, null)
      : continuation ? finite(below.at(-1)?.closeTime, null) : null;
    breakdownVolumeX = volumeX;
    breakdownTakerDeltaPct = takerDelta;
    baseSummary = candidateSummary;
    break;
  }

  const shortReady = breakdownConfirmed
    && (retestFailed || continuationConfirmed)
    && unwindTier !== 'LATE_UNWIND';
  const watchReady = structureReady
    && !shortReady
    && finite(signal.close, 0) <= baseSummary.resistance * 1.01;
  const stage = shortReady
    ? 'SHORT_READY'
    : breakdownConfirmed ? 'BREAKDOWN_PENDING_RETEST'
      : unwindTier === 'LATE_UNWIND' && structureReady ? 'LATE_UNWIND_NO_CHASE'
        : watchReady ? 'DISTRIBUTION_WATCH'
          : 'NO_MATCH';

  return {
    ready: true,
    candleCount: bars.length,
    candleClosedAt: finite(signal.closeTime, null),
    peakAt: finite(bars[peakIndex]?.closeTime, null),
    peakPrice: effectivePeakPrice,
    barsSincePeak,
    pumpPct,
    localPumpPct,
    pump72hPct,
    cycleOriginPrice,
    adaptiveBaseRangeMaxPct,
    support: baseSummary.support,
    resistance: baseSummary.resistance,
    baseRangePct: baseSummary.baseRangePct,
    drawdownFromPeakPct,
    unwindProgressPct,
    unwindTier,
    lowerHighSteps: baseSummary.lowerHighSteps,
    upperWickCount: baseSummary.upperWickCount,
    volumeFadeRatio: baseSummary.volumeFadeRatio,
    baseTakerDeltaPct: baseSummary.baseTakerDeltaPct,
    breakdownVolumeX,
    breakdownTakerDeltaPct,
    breakdownAt,
    readyAt,
    breakdownConfirmed,
    retestFailed,
    continuationConfirmed,
    structureReady,
    watchReady,
    shortReady,
    stage,
  };
}

function candleRange(bar = {}) {
  return Math.max(0, finite(bar.high, 0) - finite(bar.low, 0));
}

function candleBody(bar = {}) {
  return Math.abs(finite(bar.close, 0) - finite(bar.open, 0));
}

function detectBaseSweepContinuation(bars = [], side = 'LONG') {
  const empty = {
    detected: false,
    holdConfirmed: false,
    breakoutConfirmed: false,
    ready: false,
    sweepAt: null,
    barsSinceSweep: null,
    level: null,
    sweepExtreme: null,
    breakoutLevel: null,
    breakoutPct: null,
    baseRangePct: null,
    breakoutVolumeX: null,
  };
  if (!Array.isArray(bars) || bars.length < 12) return empty;

  const signalIndex = bars.length - 1;
  const signal = bars[signalIndex];
  const signalClose = finite(signal?.close, 0);
  const signalOpen = finite(signal?.open, 0);
  if (signalClose <= 0 || signalOpen <= 0) return empty;
  const isLong = side === 'LONG';
  const directionConfirmed = isLong ? signalClose > signalOpen : signalClose < signalOpen;
  if (!directionConfirmed) return empty;

  for (let sweepIndex = signalIndex - 3; sweepIndex >= Math.max(6, signalIndex - 24); sweepIndex -= 1) {
    const prior = bars.slice(Math.max(0, sweepIndex - 6), sweepIndex);
    const hold = bars.slice(sweepIndex + 1, signalIndex);
    if (prior.length < 4 || hold.length < 2) continue;
    const sweep = bars[sweepIndex];
    const priorLow = Math.min(...prior.map((bar) => finite(bar.low, Infinity)));
    const priorHigh = Math.max(...prior.map((bar) => finite(bar.high, -Infinity)));
    if (!Number.isFinite(priorLow) || !Number.isFinite(priorHigh) || priorLow <= 0 || priorHigh <= 0) continue;

    const sweepOpen = finite(sweep.open, 0);
    const sweepClose = finite(sweep.close, 0);
    const sweepLow = finite(sweep.low, 0);
    const sweepHigh = finite(sweep.high, 0);
    const body = candleBody(sweep);
    const range = candleRange(sweep);
    const wick = isLong
      ? Math.max(0, Math.min(sweepOpen, sweepClose) - sweepLow)
      : Math.max(0, sweepHigh - Math.max(sweepOpen, sweepClose));
    const level = isLong ? priorLow : priorHigh;
    const swept = isLong ? sweepLow <= level * 0.998 : sweepHigh >= level * 1.002;
    const reclaimed = isLong ? sweepClose >= level * 1.0005 : sweepClose <= level * 0.9995;
    const wickConfirmed = wick >= Math.max(body * 0.45, range * 0.18);
    if (!swept || !reclaimed || !wickConfirmed) continue;

    const holdConfirmed = hold.every((bar) => (
      isLong ? finite(bar.close, 0) >= level * 0.997 : finite(bar.close, 0) <= level * 1.003
    ));
    if (!holdConfirmed) continue;
    const breakoutLevel = isLong
      ? Math.max(...hold.map((bar) => finite(bar.high, 0)))
      : Math.min(...hold.map((bar) => finite(bar.low, Infinity)));
    if (!Number.isFinite(breakoutLevel) || breakoutLevel <= 0) continue;
    const breakoutConfirmed = isLong
      ? signalClose >= breakoutLevel * 1.002
      : signalClose <= breakoutLevel * 0.998;
    if (!breakoutConfirmed) continue;

    const baseBars = [sweep, ...hold];
    const baseHigh = Math.max(...baseBars.map((bar) => finite(bar.high, 0)));
    const baseLow = Math.min(...baseBars.map((bar) => finite(bar.low, Infinity)));
    const baseMid = (baseHigh + baseLow) / 2;
    const baseRangePct = baseMid > 0 ? (baseHigh - baseLow) / baseMid * 100 : null;
    if (!Number.isFinite(baseRangePct) || baseRangePct > 14) continue;

    const breakoutPct = isLong
      ? (signalClose - breakoutLevel) / breakoutLevel * 100
      : (breakoutLevel - signalClose) / breakoutLevel * 100;
    const holdVolumeMean = mean(hold.map((bar) => finite(bar.quoteVolume, 0)));
    const breakoutVolumeX = holdVolumeMean > 0 ? finite(signal.quoteVolume, 0) / holdVolumeMean : null;
    return {
      detected: true,
      holdConfirmed: true,
      breakoutConfirmed: true,
      ready: true,
      sweepAt: finite(sweep.closeTime, null),
      barsSinceSweep: signalIndex - sweepIndex,
      level,
      sweepExtreme: isLong ? sweepLow : sweepHigh,
      breakoutLevel,
      breakoutPct,
      baseRangePct,
      breakoutVolumeX,
    };
  }
  return empty;
}

function uniqueBySymbol(groups, maxSymbols) {
  const seen = new Set();
  const rows = [];
  for (const group of groups) {
    for (const row of group) {
      if (seen.has(row.symbol)) continue;
      seen.add(row.symbol);
      rows.push(row);
      if (rows.length >= maxSymbols) return rows;
    }
  }
  return rows;
}

export function selectLiquidHeatmapFlowV2Candidates(snapshot = [], {
  topPerSide = 14,
  maxSymbols = 32,
  minQuoteVolume = 2_000_000,
} = {}) {
  const universe = (Array.isArray(snapshot) ? snapshot : [])
    .filter((row) => row?.symbol && row.symbol !== 'BTCUSDT' && !STABLE_PAIR_PATTERN.test(row.symbol))
    .map((row) => ({
      ...row,
      symbol: String(row.symbol).toUpperCase(),
      markPrice: finite(row.markPrice, 0),
      change24hPct: finite(row.change24hPct, 0),
      quoteVolume: finite(row.quoteVolume, 0),
    }))
    .filter((row) => row.markPrice > 0 && row.quoteVolume >= minQuoteVolume);

  const gainers = [...universe]
    .filter((row) => row.change24hPct > 0)
    .sort((a, b) => b.change24hPct - a.change24hPct || b.quoteVolume - a.quoteVolume)
    .slice(0, topPerSide)
    .map((row, index) => ({ ...row, moverSide: 'UP', moverRank: index + 1 }));
  const losers = [...universe]
    .filter((row) => row.change24hPct < 0)
    .sort((a, b) => a.change24hPct - b.change24hPct || b.quoteVolume - a.quoteVolume)
    .slice(0, topPerSide)
    .map((row, index) => ({ ...row, moverSide: 'DOWN', moverRank: index + 1 }));
  const absoluteMovers = [...universe]
    .sort((a, b) => Math.abs(b.change24hPct) - Math.abs(a.change24hPct) || b.quoteVolume - a.quoteVolume)
    .slice(0, Math.max(4, Math.floor(topPerSide / 2)))
    .map((row) => ({ ...row, moverSide: row.change24hPct >= 0 ? 'UP' : 'DOWN', moverRank: null }));

  return uniqueBySymbol([gainers, losers, absoluteMovers], maxSymbols);
}

export function selectLiquidHeatmapFlowV2ExtendedCandidates(snapshot = [], {
  fromRank = 21,
  toRank = 60,
  maxSymbols = 40,
  minQuoteVolume = 3_000_000,
  minChange24hPct = 3,
} = {}) {
  const start = Math.max(0, Math.floor(finite(fromRank, 21)) - 1);
  const end = Math.max(start + 1, Math.floor(finite(toRank, 60)));
  return (Array.isArray(snapshot) ? snapshot : [])
    .filter((row) => row?.symbol && row.symbol !== 'BTCUSDT' && !STABLE_PAIR_PATTERN.test(row.symbol))
    .map((row) => ({
      ...row,
      symbol: String(row.symbol).toUpperCase(),
      markPrice: finite(row.markPrice, 0),
      change24hPct: finite(row.change24hPct, 0),
      quoteVolume: finite(row.quoteVolume, 0),
    }))
    .filter((row) => row.markPrice > 0 && row.quoteVolume >= minQuoteVolume && row.change24hPct > 0)
    .sort((a, b) => b.change24hPct - a.change24hPct || b.quoteVolume - a.quoteVolume)
    .map((row, index) => ({
      ...row,
      moverSide: 'UP',
      moverRank: index + 1,
      universeTier: 'EXTENDED_21_60',
    }))
    .slice(start, end)
    .filter((row) => row.change24hPct >= minChange24hPct)
    .slice(0, Math.max(0, Math.floor(finite(maxSymbols, 40))));
}

export function liquidHeatmapFlowV2ExtendedPrefilter(features = {}) {
  const rank = finite(features.moverRank, null);
  const touch = finite(features.ema99LongTouchDistancePct, null);
  const distance = finite(features.ema99DistancePct, null);
  const pullback = finite(features.pullbackFromRecentHighPct, null);
  const volumeX = finite(features.volumeX, 0);
  return features.universeTier === 'EXTENDED_21_60'
    && features.moverSide === 'UP'
    && rank != null && rank >= 21 && rank <= 60
    && finite(features.candleCount, 0) >= 180
    && finite(features.change24hPct, 0) >= 3
    && pullback != null && pullback >= 2 && pullback <= 18
    && volumeX >= 0.8
    && ((touch != null && touch >= -2.5 && touch <= 2)
      || (distance != null && Math.abs(distance) <= 2.5));
}

function strongestZone(heatmap, side) {
  const rows = side === 'above'
    ? (heatmap?.strongestAbove ?? heatmap?.heatmapAbove ?? [])
    : (heatmap?.strongestBelow ?? heatmap?.heatmapBelow ?? []);
  return rows
    .filter((row) => finite(row?.price, 0) > 0)
    .sort((a, b) => finite(b?.score, 0) - finite(a?.score, 0))[0] ?? null;
}

export function buildLiquidHeatmapFlowV2Features({
  market = {},
  klines = [],
  klines15m = [],
  klines1h = [],
  klines4h = [],
  heatmap = null,
  openInterest = null,
  liquidation = null,
  now = Date.now(),
} = {}) {
  const bars = (Array.isArray(klines) ? klines : [])
    .filter((bar) => finite(bar?.close, 0) > 0)
    .slice(-220);
  const closed = bars.filter((bar) => !bar.closeTime || finite(bar.closeTime, 0) <= now).slice(-220);
  const usable = closed.length >= 12 ? closed : bars.slice(-220);
  const live = bars.at(-1)?.closeTime && finite(bars.at(-1).closeTime, 0) > now ? bars.at(-1) : null;
  const last = usable.at(-1) ?? null;
  const previous = usable.at(-2) ?? null;
  const markPrice = finite(market.markPrice, finite(last?.close, 0));
  const closes = usable.map((bar) => finite(bar.close, 0));
  const change15mPct = usable.length >= 4 ? pctChange(usable.at(-4)?.close, last?.close) : null;
  const change1hPct = usable.length >= 13 ? pctChange(usable.at(-13)?.close, last?.close) : null;
  const liveOrClosedRecent = live ? [...usable.slice(-2), live] : usable.slice(-3);
  const recent = liveOrClosedRecent;
  const volumeBase = usable.slice(-23, -3).map((bar) => finite(bar.quoteVolume, 0));
  const recentVolume = mean(recent.map((bar) => finite(bar.quoteVolume, 0)));
  const volumeX = mean(volumeBase) > 0 ? recentVolume / mean(volumeBase) : null;
  const recentQuote = recent.reduce((sum, bar) => sum + finite(bar.quoteVolume, 0), 0);
  const recentTakerBuy = recent.reduce((sum, bar) => sum + finite(bar.takerBuyQuoteVolume, 0), 0);
  const takerDeltaPct = recentQuote > 0 ? ((recentTakerBuy * 2 - recentQuote) / recentQuote) * 100 : null;
  const ema13 = movingAverage(closes, 13);
  const ema25 = movingAverage(closes, 25);
  const ema99 = exponentialMovingAverage(closes, 99);
  const previousEma99 = exponentialMovingAverage(closes.slice(0, -1), 99);
  const ema99SlopePct = previousEma99 != null && ema99 != null ? pctChange(previousEma99, ema99) : null;
  const ema99DistancePct = ema99 != null && ema99 > 0 && markPrice > 0
    ? (markPrice - ema99) / ema99 * 100
    : null;
  const approachCandle = live ?? last;
  const approachLow = finite(approachCandle?.low, null);
  const approachHigh = finite(approachCandle?.high, null);
  const ema99LongTouchDistancePct = ema99 != null && ema99 > 0 && approachLow != null
    ? (approachLow - ema99) / ema99 * 100
    : null;
  const ema99ShortTouchDistancePct = ema99 != null && ema99 > 0 && approachHigh != null
    ? (approachHigh - ema99) / ema99 * 100
    : null;
  const reboundFromApproachLowPct = approachLow > 0 && markPrice > 0
    ? (markPrice - approachLow) / approachLow * 100
    : null;
  const rejectFromApproachHighPct = approachHigh > 0 && markPrice > 0
    ? (approachHigh - markPrice) / approachHigh * 100
    : null;
  const recentStructure = usable.slice(-12);
  const recentHigh = recentStructure.length
    ? Math.max(...recentStructure.map((bar) => finite(bar.high, 0)))
    : null;
  const recentLow = recentStructure.length
    ? Math.min(...recentStructure.map((bar) => finite(bar.low, Infinity)))
    : null;
  const pullbackFromRecentHighPct = recentHigh > 0 && markPrice > 0
    ? (recentHigh - markPrice) / recentHigh * 100
    : null;
  const bounceFromRecentLowPct = recentLow > 0 && markPrice > 0
    ? (markPrice - recentLow) / recentLow * 100
    : null;
  const body = last ? Math.abs(finite(last.close, 0) - finite(last.open, 0)) : 0;
  const upperWick = last ? Math.max(0, finite(last.high, 0) - Math.max(finite(last.open, 0), finite(last.close, 0))) : 0;
  const lowerWick = last ? Math.max(0, Math.min(finite(last.open, 0), finite(last.close, 0)) - finite(last.low, 0)) : 0;
  const upperWickPct = markPrice > 0 ? upperWick / markPrice * 100 : null;
  const lowerWickPct = markPrice > 0 ? lowerWick / markPrice * 100 : null;
  const upperRejection = Boolean(last && previous
    && upperWick >= Math.max(body * 0.9, markPrice * 0.002)
    && finite(last.close, 0) < finite(previous.high, 0));
  const lowerReclaim = Boolean(last && previous
    && lowerWick >= Math.max(body * 0.9, markPrice * 0.002)
    && finite(last.close, 0) > finite(previous.low, 0));
  const upperZone = strongestZone(heatmap, 'above');
  const lowerZone = strongestZone(heatmap, 'below');
  const upperDistancePct = upperZone && markPrice > 0 ? (finite(upperZone.price, 0) - markPrice) / markPrice * 100 : null;
  const lowerDistancePct = lowerZone && markPrice > 0 ? (finite(lowerZone.price, 0) - markPrice) / markPrice * 100 : null;
  const upperZoneTouched = Boolean(upperZone && last
    && (finite(last.high, 0) >= finite(upperZone.price, 0) * 0.997 || Math.abs(upperDistancePct) <= 0.35));
  const lowerZoneTouched = Boolean(lowerZone && last
    && (finite(last.low, 0) <= finite(lowerZone.price, 0) * 1.003 || Math.abs(lowerDistancePct) <= 0.35));
  const baseSweepLong = detectBaseSweepContinuation(usable, 'LONG');
  const baseSweepShort = detectBaseSweepContinuation(usable, 'SHORT');
  const trendAboveEma = Boolean(last && ema13 != null && ema25 != null
    && finite(last.close, 0) > ema13 && ema13 >= ema25 * 0.995);
  const trendBelowEma = Boolean(last && ema13 != null && ema25 != null
    && finite(last.close, 0) < ema13 && ema13 <= ema25 * 1.005);
  const trend1h = buildHtfTrendSnapshot(klines1h, '1h', now);
  const trend4h = buildHtfTrendSnapshot(klines4h, '4h', now);
  const ema99Retest5m = buildEma99RetestSnapshot(klines, now, '5m');
  const ema99Retest15m = buildEma99RetestSnapshot(klines15m, now, '15m');
  const pumpDistribution15m = buildPumpDistributionSnapshot(
    klines15m,
    finite(market.change24hPct, 0),
    now,
    { klines1h },
  );
  const htfBearCount = Number(trend1h.bearish) + Number(trend4h.bearish);
  const htfBullCount = Number(trend1h.bullish) + Number(trend4h.bullish);

  return {
    moverSide: String(market.moverSide ?? ''),
    moverRank: finite(market.moverRank, null),
    universeTier: String(market.universeTier ?? 'PRIMARY_1_20'),
    markPrice,
    change24hPct: finite(market.change24hPct, 0),
    change15mPct,
    change1hPct,
    quoteVolume: finite(market.quoteVolume, 0),
    fundingRate: finite(market.fundingRate, null),
    candleCount: usable.length,
    candleClosedAt: finite(last?.closeTime, null),
    lastClosedCandle: last ? {
      open: finite(last.open, null),
      high: finite(last.high, null),
      low: finite(last.low, null),
      close: finite(last.close, null),
      closeTime: finite(last.closeTime, null),
    } : null,
    ema13,
    ema25,
    ema99,
    ema99SlopePct,
    ema99DistancePct,
    ema99LongTouchDistancePct,
    ema99ShortTouchDistancePct,
    reboundFromApproachLowPct,
    rejectFromApproachHighPct,
    approachCandleSource: live ? 'LIVE_5M' : 'LAST_CLOSED_5M',
    live5mCandle: live ? {
      open: finite(live.open, null),
      high: finite(live.high, null),
      low: finite(live.low, null),
      close: finite(live.close, null),
      closeTime: finite(live.closeTime, null),
    } : null,
    pullbackFromRecentHighPct,
    bounceFromRecentLowPct,
    volumeX,
    takerDeltaPct,
    upperWickPct,
    lowerWickPct,
    upperRejection,
    lowerReclaim,
    upperZone: upperZone ? { price: finite(upperZone.price), score: finite(upperZone.score, 0), distancePct: upperDistancePct } : null,
    lowerZone: lowerZone ? { price: finite(lowerZone.price), score: finite(lowerZone.score, 0), distancePct: lowerDistancePct } : null,
    upperZoneTouched,
    lowerZoneTouched,
    baseSweepLong,
    baseSweepShort,
    trendAboveEma,
    trendBelowEma,
    trend1h,
    trend4h,
    htfBearCount,
    htfBullCount,
    htfBearTier: htfBearCount >= 2 ? 'A_BOTH' : htfBearCount === 1 ? 'B_ONE' : 'NONE',
    htfBullTier: htfBullCount >= 2 ? 'A_BOTH' : htfBullCount === 1 ? 'B_ONE' : 'NONE',
    ema99Retest5m,
    ema99Retest15m,
    pumpDistribution15m,
    heatmapBias: finite(heatmap?.bias, null),
    openInterest: finite(openInterest?.value, null),
    openInterestDeltaPct: finite(openInterest?.deltaPct, null),
    openInterestSamples: finite(openInterest?.samples, 0),
    shortLiquidationUsd: finite(liquidation?.shortLiquidationUsd, 0),
    longLiquidationUsd: finite(liquidation?.longLiquidationUsd, 0),
    shortLiquidationBurst: finite(liquidation?.shortBurstRatio, null),
    longLiquidationBurst: finite(liquidation?.longBurstRatio, null),
    liquidationEvents: finite(liquidation?.events, 0),
    liquidationSocketState: String(liquidation?.socketState ?? 'WARMING_UP'),
  };
}

function evidence(name, matched, value = null) {
  return { name, matched: Boolean(matched), value };
}

function evidenceScore(rows, weights) {
  return rows.reduce((sum, row) => sum + (row.matched ? (weights[row.name] ?? 1) : 0), 0);
}

export function classifyLiquidHeatmapFlowV2(features = {}) {
  const change24h = finite(features.change24hPct, 0);
  const change1h = finite(features.change1hPct, 0);
  const volumeX = finite(features.volumeX, 0);
  const takerDelta = finite(features.takerDeltaPct, 0);
  const oiDelta = finite(features.openInterestDeltaPct, null);
  const shortBurst = finite(features.shortLiquidationBurst, null);
  const longBurst = finite(features.longLiquidationBurst, null);
  const candleReady = finite(features.candleCount, 0) >= 12;
  const upMove = change24h >= 10 || change1h >= 3;
  const downMove = change24h <= -8 || change1h <= -3;
  const upImpulse = takerDelta >= 4 || volumeX >= 1.6 || (oiDelta != null && oiDelta >= 0.35);
  const downImpulse = takerDelta <= -4 || volumeX >= 1.6 || (oiDelta != null && oiDelta >= 0.35);

  const baseLong = features.baseSweepLong ?? {};
  const baseShort = features.baseSweepShort ?? {};
  const continuationLongVolumeX = Math.max(volumeX, finite(baseLong.breakoutVolumeX, 0));
  const continuationShortVolumeX = Math.max(volumeX, finite(baseShort.breakoutVolumeX, 0));
  const continuationLongEvidence = [
    evidence('base-sweep', baseLong.detected, baseLong.sweepExtreme),
    evidence('base-hold', baseLong.holdConfirmed, baseLong.barsSinceSweep),
    evidence('breakout', baseLong.breakoutConfirmed, baseLong.breakoutPct),
    evidence('volume', continuationLongVolumeX >= 1.6, continuationLongVolumeX),
    evidence('taker', takerDelta >= 2, takerDelta),
    evidence('oi', oiDelta != null && oiDelta <= -0.15, oiDelta),
    evidence('liquidation', longBurst != null && longBurst >= 1.15 && finite(features.longLiquidationUsd, 0) > 0, longBurst),
  ];
  const continuationShortEvidence = [
    evidence('base-sweep', baseShort.detected, baseShort.sweepExtreme),
    evidence('base-hold', baseShort.holdConfirmed, baseShort.barsSinceSweep),
    evidence('breakout', baseShort.breakoutConfirmed, baseShort.breakoutPct),
    evidence('volume', continuationShortVolumeX >= 1.6, continuationShortVolumeX),
    evidence('taker', takerDelta <= -2, takerDelta),
    evidence('oi', oiDelta != null && oiDelta <= -0.15, oiDelta),
    evidence('liquidation', shortBurst != null && shortBurst >= 1.15 && finite(features.shortLiquidationUsd, 0) > 0, shortBurst),
  ];

  const shortEvidence = [
    evidence('zone', features.upperZoneTouched, features.upperZone?.distancePct),
    evidence('candle', features.upperRejection, features.upperWickPct),
    evidence('taker', takerDelta <= -2, takerDelta),
    evidence('oi', oiDelta != null && oiDelta <= -0.25, oiDelta),
    evidence('liquidation', shortBurst != null && shortBurst >= 1.15 && finite(features.shortLiquidationUsd, 0) > 0, shortBurst),
  ];
  const longEvidence = [
    evidence('zone', features.lowerZoneTouched, features.lowerZone?.distancePct),
    evidence('candle', features.lowerReclaim, features.lowerWickPct),
    evidence('taker', takerDelta >= 2, takerDelta),
    evidence('oi', oiDelta != null && oiDelta <= -0.25, oiDelta),
    evidence('liquidation', longBurst != null && longBurst >= 1.15 && finite(features.longLiquidationUsd, 0) > 0, longBurst),
  ];
  const weights = { zone: 24, candle: 28, taker: 20, oi: 14, liquidation: 14 };
  const shortScore = evidenceScore(shortEvidence, weights);
  const longScore = evidenceScore(longEvidence, weights);
  const shortConfirmations = shortEvidence.filter((row) => row.matched).length;
  const longConfirmations = longEvidence.filter((row) => row.matched).length;
  const shortDerivativesConfirmed = shortEvidence.some((row) => row.matched && ['oi', 'liquidation'].includes(row.name));
  const longDerivativesConfirmed = longEvidence.some((row) => row.matched && ['oi', 'liquidation'].includes(row.name));
  const shortReady = candleReady && upMove
    && features.upperZoneTouched && features.upperRejection
    && shortConfirmations >= 3 && shortDerivativesConfirmed
    && (takerDelta <= -2 || (oiDelta != null && oiDelta <= -0.25));
  const longReady = candleReady && downMove
    && features.lowerZoneTouched && features.lowerReclaim
    && longConfirmations >= 3 && longDerivativesConfirmed
    && (takerDelta >= 2 || (oiDelta != null && oiDelta <= -0.25));
  const continuationWeights = {
    'base-sweep': 24,
    'base-hold': 12,
    breakout: 22,
    volume: 16,
    taker: 16,
    oi: 5,
    liquidation: 5,
  };
  const continuationLongScore = evidenceScore(continuationLongEvidence, continuationWeights);
  const continuationShortScore = evidenceScore(continuationShortEvidence, continuationWeights);
  const continuationLongReady = candleReady
    && change24h >= 8 && change1h >= 0
    && baseLong.ready === true && features.trendAboveEma === true
    && continuationLongVolumeX >= 1.6 && takerDelta >= 2
    && features.upperRejection !== true;
  const continuationShortReady = candleReady
    && change24h <= -8 && change1h <= 0
    && baseShort.ready === true && features.trendBelowEma === true
    && continuationShortVolumeX >= 1.6 && takerDelta <= -2
    && features.lowerReclaim !== true;
  const ema99 = finite(features.ema99, null);
  const ema99Distance = finite(features.ema99DistancePct, null);
  const longTouchDistance = finite(features.ema99LongTouchDistancePct, null);
  const shortTouchDistance = finite(features.ema99ShortTouchDistancePct, null);
  const reboundFromLow = finite(features.reboundFromApproachLowPct, null);
  const rejectFromHigh = finite(features.rejectFromApproachHighPct, null);
  const ema99Slope = finite(features.ema99SlopePct, null);
  const pullback = finite(features.pullbackFromRecentHighPct, null);
  const bounce = finite(features.bounceFromRecentLowPct, null);
  const emaLongStack = ema99 != null
    && finite(features.ema13, 0) >= finite(features.ema25, 0) * 0.998
    && finite(features.ema25, 0) >= ema99 * 0.995;
  const emaShortStack = ema99 != null
    && finite(features.ema13, Infinity) <= finite(features.ema25, 0) * 1.002
    && finite(features.ema25, 0) <= ema99 * 1.005;
  const preLongEvidence = [
    evidence('ema99-wick-touch', longTouchDistance != null && longTouchDistance >= -0.5 && longTouchDistance <= 1.2, longTouchDistance),
    evidence('ema99-reclaim', ema99Distance != null && ema99Distance >= 0.1 && ema99Distance <= 1.2, ema99Distance),
    evidence('wick-rebound', reboundFromLow != null && reboundFromLow >= 0.3, reboundFromLow),
    evidence('ema-stack', emaLongStack, `${features.ema13}/${features.ema25}/${ema99}`),
    evidence('ema99-slope', ema99Slope != null && ema99Slope >= -0.08, ema99Slope),
    evidence('pullback', pullback != null && pullback >= 0.25 && pullback <= 12, pullback),
    evidence('volume', volumeX >= 0.8, volumeX),
    evidence('taker-guard', takerDelta >= -12, takerDelta),
  ];
  const preShortEvidence = [
    evidence('ema99-wick-touch', shortTouchDistance != null && shortTouchDistance <= 0.5 && shortTouchDistance >= -1.2, shortTouchDistance),
    evidence('ema99-reclaim', ema99Distance != null && ema99Distance <= -0.1 && ema99Distance >= -1.2, ema99Distance),
    evidence('wick-rebound', rejectFromHigh != null && rejectFromHigh >= 0.3, rejectFromHigh),
    evidence('ema-stack', emaShortStack, `${features.ema13}/${features.ema25}/${ema99}`),
    evidence('ema99-slope', ema99Slope != null && ema99Slope <= 0.08, ema99Slope),
    evidence('bounce', bounce != null && bounce >= 0.25 && bounce <= 12, bounce),
    evidence('volume', volumeX >= 0.8, volumeX),
    evidence('taker-guard', takerDelta <= 12, takerDelta),
  ];
  const preWeights = {
    'ema99-wick-touch': 18,
    'ema99-reclaim': 14,
    'wick-rebound': 10,
    'ema-stack': 22,
    'ema99-slope': 12,
    pullback: 12,
    bounce: 12,
    volume: 12,
    'taker-guard': 14,
  };
  const preLongScore = evidenceScore(preLongEvidence, preWeights);
  const preShortScore = evidenceScore(preShortEvidence, preWeights);
  const ema99Ready = finite(features.candleCount, 0) >= 180 && ema99 != null;
  const preLongReady = candleReady && ema99Ready
    && change24h >= 8 && change1h >= -3
    && preLongEvidence.every((row) => row.matched)
    && baseLong.ready !== true && features.upperRejection !== true;
  const preShortReady = candleReady && ema99Ready
    && change24h <= -8 && change1h <= 3
    && preShortEvidence.every((row) => row.matched)
    && baseShort.ready !== true && features.lowerReclaim !== true;
  const extendedRank = finite(features.moverRank, null);
  const extendedLongEvidence = [
    evidence('extended-rank', features.universeTier === 'EXTENDED_21_60'
      && features.moverSide === 'UP'
      && extendedRank != null && extendedRank >= 21 && extendedRank <= 60, extendedRank),
    evidence('day-move', change24h >= 3, change24h),
    evidence('panic-pullback', pullback != null && pullback >= 3 && pullback <= 15, pullback),
    evidence('ema99-wick-touch', longTouchDistance != null && longTouchDistance >= -2 && longTouchDistance <= 1.2, longTouchDistance),
    evidence('ema99-reclaim', ema99Distance != null && ema99Distance >= 0.1 && ema99Distance <= 2, ema99Distance),
    evidence('wick-rebound', reboundFromLow != null && reboundFromLow >= 0.3, reboundFromLow),
    evidence('ema-stack', emaLongStack, `${features.ema13}/${features.ema25}/${ema99}`),
    evidence('ema99-slope', ema99Slope != null && ema99Slope >= -0.08, ema99Slope),
    evidence('volume', volumeX >= 1.2, volumeX),
    evidence('taker-guard', takerDelta >= -25, takerDelta),
    evidence('htf-bull', finite(features.htfBullCount, 0) >= 1, features.htfBullTier),
  ];
  const extendedWeights = {
    'extended-rank': 12,
    'day-move': 8,
    'panic-pullback': 16,
    'ema99-wick-touch': 14,
    'ema99-reclaim': 16,
    'wick-rebound': 14,
    'ema-stack': 12,
    'ema99-slope': 8,
    volume: 12,
    'taker-guard': 10,
    'htf-bull': 14,
  };
  const extendedLongScore = evidenceScore(extendedLongEvidence, extendedWeights);
  const extendedLongReady = candleReady && ema99Ready
    && change1h >= -4
    && extendedLongEvidence.every((row) => row.matched)
    && baseLong.ready !== true && features.upperRejection !== true;
  const primaryRank = finite(features.moverRank, null);
  const primaryPanicUniverse = features.universeTier === 'PRIMARY_1_20'
    && features.moverSide === 'UP'
    && primaryRank != null && primaryRank >= 1 && primaryRank <= 20;
  const primaryEma99TouchObserved = (longTouchDistance != null && longTouchDistance >= -3 && longTouchDistance <= 1.5)
    || (ema99Distance != null && ema99Distance >= -3 && ema99Distance <= 1.5);
  const primaryPanicContext = primaryPanicUniverse
    && change24h >= 8
    && pullback != null && pullback >= 3 && pullback <= 20
    && primaryEma99TouchObserved
    && ema99Distance != null && ema99Distance >= -3 && ema99Distance <= 3
    && volumeX >= 1.2
    && finite(features.htfBullCount, 0) >= 1;
  const primarySellPressureActive = takerDelta <= -25;
  const primarySellPressureEased = takerDelta >= -25;
  const primaryPanicInitiated = primarySellPressureActive
    || (pullback != null && pullback >= 8 && volumeX >= 1.5);
  const primaryPanicEvidence = [
    evidence('primary-rank', primaryPanicUniverse, primaryRank),
    evidence('day-move', change24h >= 8, change24h),
    evidence('panic-pullback', pullback != null && pullback >= 3 && pullback <= 20, pullback),
    evidence('ema99-wick-touch', primaryEma99TouchObserved, `${longTouchDistance}/${ema99Distance}`),
    evidence('ema99-near', ema99Distance != null && ema99Distance >= -3 && ema99Distance <= 3, ema99Distance),
    evidence('volume-burst', volumeX >= 1.2, volumeX),
    evidence('htf-bull', finite(features.htfBullCount, 0) >= 1, features.htfBullTier),
    evidence('sell-flush', primarySellPressureActive, takerDelta),
    evidence('rebound', reboundFromLow != null && reboundFromLow >= 0.3, reboundFromLow),
    evidence('ema99-reclaim', ema99Distance != null && ema99Distance >= 0.1 && ema99Distance <= 3, ema99Distance),
    evidence('lower-reclaim', features.lowerReclaim === true, features.lowerWickPct),
    evidence('sell-pressure-eased', primarySellPressureEased, takerDelta),
  ];
  const primaryPanicWeights = {
    'primary-rank': 12,
    'day-move': 8,
    'panic-pullback': 14,
    'ema99-wick-touch': 16,
    'ema99-near': 10,
    'volume-burst': 12,
    'htf-bull': 12,
    'sell-flush': 14,
    rebound: 14,
    'ema99-reclaim': 16,
    'lower-reclaim': 12,
    'sell-pressure-eased': 14,
  };
  const primaryPanicScore = evidenceScore(primaryPanicEvidence, primaryPanicWeights);
  const primaryPanicActive = candleReady && ema99Ready && primaryPanicContext
    && primaryPanicInitiated;
  const primaryPanicLongReady = candleReady && ema99Ready && primaryPanicContext
    && reboundFromLow != null && reboundFromLow >= 0.3
    && ema99Distance >= 0.1
    && features.lowerReclaim === true
    && primarySellPressureEased
    && baseLong.ready !== true;
  const retest5m = features.ema99Retest5m ?? {};
  const retest15m = features.ema99Retest15m ?? {};
  const newestReadyRetest = (side) => [retest5m, retest15m]
    .filter((row) => row?.[`${side}Ready`] === true)
    .sort((a, b) => finite(b.candleClosedAt, 0) - finite(a.candleClosedAt, 0))[0] ?? null;
  const htfShortRetest = newestReadyRetest('short');
  const htfLongRetest = newestReadyRetest('long');
  const htfBearCount = finite(features.htfBearCount, 0);
  const htfBullCount = finite(features.htfBullCount, 0);
  const htfShortTouch = finite(htfShortRetest?.shortTouchDistancePct, null);
  const htfLongTouch = finite(htfLongRetest?.longTouchDistancePct, null);
  const htfPump = finite(htfShortRetest?.pumpPct, null);
  const htfDump = finite(htfLongRetest?.dumpPct, null);
  const htfShortTimeframe = String(htfShortRetest?.timeframe ?? '15m');
  const htfLongTimeframe = String(htfLongRetest?.timeframe ?? '15m');
  const htfShortSweepLimit = htfShortTimeframe === '5m' ? 15 : 1.5;
  const htfLongSweepLimit = htfLongTimeframe === '5m' ? 15 : 1.5;
  const htfShortEvidence = [
    evidence('htf-bear', htfBearCount >= 1, features.htfBearTier),
    evidence('ema99-mtf-touch', htfShortTouch != null && htfShortTouch >= -0.6 && htfShortTouch <= htfShortSweepLimit, `${htfShortTimeframe}:${htfShortTouch}`),
    evidence('pump-mtf', htfPump != null && htfPump >= 2, `${htfShortTimeframe}:${htfPump}`),
    evidence('reject-mtf', htfShortRetest?.shortReady === true, htfShortRetest?.givebackRatio),
    evidence('volume-mtf', finite(htfShortRetest?.volumeX, 0) >= 1.3, htfShortRetest?.volumeX),
    evidence('taker-mtf', finite(htfShortRetest?.takerDeltaPct, Infinity) <= 10, htfShortRetest?.takerDeltaPct),
  ];
  const htfLongEvidence = [
    evidence('htf-bull', htfBullCount >= 1, features.htfBullTier),
    evidence('ema99-mtf-touch', htfLongTouch != null && htfLongTouch >= -htfLongSweepLimit && htfLongTouch <= 0.6, `${htfLongTimeframe}:${htfLongTouch}`),
    evidence('dump-mtf', htfDump != null && htfDump >= 2, `${htfLongTimeframe}:${htfDump}`),
    evidence('reclaim-mtf', htfLongRetest?.longReady === true, htfLongRetest?.recoveryRatio),
    evidence('volume-mtf', finite(htfLongRetest?.volumeX, 0) >= 1.3, htfLongRetest?.volumeX),
    evidence('taker-mtf', finite(htfLongRetest?.takerDeltaPct, -Infinity) >= -10, htfLongRetest?.takerDeltaPct),
  ];
  const htfWeights = {
    'htf-bear': 24,
    'htf-bull': 24,
    'ema99-mtf-touch': 18,
    'pump-mtf': 14,
    'dump-mtf': 14,
    'reject-mtf': 20,
    'reclaim-mtf': 20,
    'volume-mtf': 12,
    'taker-mtf': 12,
  };
  const htfShortScore = evidenceScore(htfShortEvidence, htfWeights);
  const htfLongScore = evidenceScore(htfLongEvidence, htfWeights);
  const htfShortReady = htfBearCount >= 1 && htfShortRetest?.shortReady === true;
  const htfLongReady = htfBullCount >= 1 && htfLongRetest?.longReady === true;
  const distribution = features.pumpDistribution15m ?? {};
  const distributionEvidence = [
    evidence('strong-pump', finite(distribution.pumpPct, 0) >= (finite(distribution.pump72hPct, null) == null ? 10 : 30), distribution.pumpPct),
    evidence('sideway-range', finite(distribution.baseRangePct, Infinity) <= finite(distribution.adaptiveBaseRangeMaxPct, 14), distribution.baseRangePct),
    evidence('lower-highs', finite(distribution.lowerHighSteps, 0) >= 2, distribution.lowerHighSteps),
    evidence('upper-wicks', finite(distribution.upperWickCount, 0) >= 2, distribution.upperWickCount),
    evidence('volume-fade', finite(distribution.volumeFadeRatio, Infinity) <= 1.05, distribution.volumeFadeRatio),
    evidence('taker-fade', finite(distribution.baseTakerDeltaPct, Infinity) <= 15, distribution.baseTakerDeltaPct),
    evidence('breakdown', distribution.breakdownConfirmed === true, distribution.breakdownVolumeX),
    evidence('failed-retest', distribution.retestFailed === true || distribution.continuationConfirmed === true, distribution.support),
    evidence('sell-flow', finite(distribution.breakdownTakerDeltaPct, Infinity) <= 0, distribution.breakdownTakerDeltaPct),
  ];
  const distributionWeights = {
    'strong-pump': 20,
    'sideway-range': 18,
    'lower-highs': 14,
    'upper-wicks': 14,
    'volume-fade': 10,
    'taker-fade': 10,
    breakdown: 18,
    'failed-retest': 18,
    'sell-flow': 14,
  };
  const distributionScore = evidenceScore(distributionEvidence, distributionWeights);
  const distributionWatchReady = distribution.watchReady === true;
  const distributionShortReady = distribution.shortReady === true;
  const distributionClassification = distributionShortReady
    ? {
      labelKey: LIQUID_HEATMAP_FLOW_V2_LABELS.PUMP_DISTRIBUTION_SHORT_READY.key,
      label: LIQUID_HEATMAP_FLOW_V2_LABELS.PUMP_DISTRIBUTION_SHORT_READY.title,
      side: LIQUID_HEATMAP_FLOW_V2_LABELS.PUMP_DISTRIBUTION_SHORT_READY.side,
      phase: LIQUID_HEATMAP_FLOW_V2_LABELS.PUMP_DISTRIBUTION_SHORT_READY.phase,
      confidence: clamp(Math.round(55 + distributionScore * 0.25), 0, 94),
      reason: 'Sau pump manh, vung phan phoi da breakdown va xac nhan retest that bai/giu duoi ho tro. PAPER EVAL, khong cap Binance.',
      evidence: distributionEvidence,
      observationOnly: true,
      affectsOrders: false,
      affectsBinance: false,
      affectsEntry: false,
      affectsSize: false,
      affectsSlTp: false,
    }
    : distributionWatchReady ? {
      labelKey: LIQUID_HEATMAP_FLOW_V2_LABELS.PUMP_DISTRIBUTION_WATCH.key,
      label: LIQUID_HEATMAP_FLOW_V2_LABELS.PUMP_DISTRIBUTION_WATCH.title,
      side: LIQUID_HEATMAP_FLOW_V2_LABELS.PUMP_DISTRIBUTION_WATCH.side,
      phase: LIQUID_HEATMAP_FLOW_V2_LABELS.PUMP_DISTRIBUTION_WATCH.phase,
      confidence: clamp(Math.round(45 + distributionScore * 0.3), 0, 88),
      reason: `Pump manh dang ${String(distribution.unwindTier ?? 'UNWIND').replaceAll('_', ' ')}; dinh thap dan, rau tren va volume fade. Cho breakdown xac nhan.`,
      evidence: distributionEvidence,
      observationOnly: true,
      affectsOrders: false,
      affectsBinance: false,
      affectsEntry: false,
      affectsSize: false,
      affectsSlTp: false,
    }
      : null;

  let label = null;
  let confidence = 0;
  let evidenceRows = [];
  let reason = 'Chua du pha squeeze/sweep de gan nhan.';
  let ema99RetestTimeframe = null;
  let ema99RetestCandleClosedAt = null;
  if (continuationLongReady && (!continuationShortReady || continuationLongScore >= continuationShortScore)) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.UP_BASE_SWEEP_LONG_READY;
    confidence = clamp(Math.round(58 + continuationLongScore * 0.32 + Math.min(Math.max(change1h, 0), 20) * 0.35), 0, 96);
    evidenceRows = continuationLongEvidence;
    reason = 'Day base da bi quet va giu reclaim; nen dong breakout cung volume/taker xac nhan tiep dien LONG.';
  } else if (continuationShortReady) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.DOWN_BASE_SWEEP_SHORT_READY;
    confidence = clamp(Math.round(58 + continuationShortScore * 0.32 + Math.min(Math.max(Math.abs(change1h), 0), 20) * 0.35), 0, 96);
    evidenceRows = continuationShortEvidence;
    reason = 'Dinh base da bi quet va giu reject; nen dong breakdown cung volume/taker xac nhan tiep dien SHORT.';
  } else if (shortReady && (!longReady || shortScore >= longScore)) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.UP_SWEEP_SHORT_READY;
    confidence = clamp(Math.round(55 + shortScore * 0.4 + Math.min(Math.max(change24h, change1h * 2), 40) * 0.35), 0, 96);
    evidenceRows = shortEvidence;
    reason = 'Cum tren da bi quet; nen dong reject va flow khong con ung ho nhip tang.';
  } else if (longReady) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.DOWN_SWEEP_LONG_READY;
    confidence = clamp(Math.round(55 + longScore * 0.4 + Math.min(Math.max(Math.abs(change24h), Math.abs(change1h) * 2), 40) * 0.35), 0, 96);
    evidenceRows = longEvidence;
    reason = 'Cum duoi da bi quet; nen dong reclaim va flow khong con ung ho nhip giam.';
  } else if (primaryPanicLongReady) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY;
    confidence = clamp(Math.round(48 + primaryPanicScore * 0.27), 0, 94);
    evidenceRows = primaryPanicEvidence;
    reason = `Top tang hang ${primaryRank} da panic flush ${pullback.toFixed(2)}% ve EMA99 5m, hoi khoi day + reclaim va ap luc ban da ha nhiet. PAPER EVAL, khong cap Binance.`;
  } else if (htfShortReady && (!htfLongReady || htfShortScore >= htfLongScore)) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.HTF_BEAR_15M_EMA99_PUMP_REJECT;
    confidence = clamp(Math.round(55 + htfShortScore * 0.28 + (htfBearCount >= 2 ? 7 : 0)), 0, 94);
    evidenceRows = htfShortEvidence;
    ema99RetestTimeframe = htfShortTimeframe;
    ema99RetestCandleClosedAt = finite(htfShortRetest?.candleClosedAt, null);
    reason = `Xu huong 1h/4h dang giam; pump ${htfShortTimeframe} quet EMA99 da dong reject xuong. PAPER EVAL, khong cap Binance.`;
  } else if (htfLongReady) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.HTF_BULL_15M_EMA99_DUMP_RECLAIM;
    confidence = clamp(Math.round(55 + htfLongScore * 0.28 + (htfBullCount >= 2 ? 7 : 0)), 0, 94);
    evidenceRows = htfLongEvidence;
    ema99RetestTimeframe = htfLongTimeframe;
    ema99RetestCandleClosedAt = finite(htfLongRetest?.candleClosedAt, null);
    reason = `Xu huong 1h/4h dang tang; dump ${htfLongTimeframe} quet EMA99 da dong reclaim len. PAPER EVAL, khong cap Binance.`;
  } else if (distributionShortReady) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.PUMP_DISTRIBUTION_SHORT_READY;
    confidence = clamp(Math.round(55 + distributionScore * 0.25), 0, 94);
    evidenceRows = distributionEvidence;
    reason = 'Sau pump manh, vung sideway phan phoi da breakdown va retest ho tro that bai. PAPER EVAL, khong cap Binance.';
  } else if (primaryPanicActive) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.PRIMARY_EMA99_PANIC_FLUSH_ACTIVE;
    confidence = clamp(Math.round(44 + primaryPanicScore * 0.25), 0, 91);
    evidenceRows = primaryPanicEvidence;
    reason = `Top tang hang ${primaryRank} dang panic flush ${pullback.toFixed(2)}% ve EMA99 5m (taker hien tai ${takerDelta.toFixed(2)}%); cho gia reclaim EMA99, chua bat LONG.`;
  } else if (distributionWatchReady) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.PUMP_DISTRIBUTION_WATCH;
    confidence = clamp(Math.round(45 + distributionScore * 0.3), 0, 88);
    evidenceRows = distributionEvidence;
    reason = 'Pump manh da chuyen sang sideway voi dinh thap dan, rau tren va volume fade; chi theo doi cho breakdown + retest.';
  } else if (extendedLongReady) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.EXTENDED_EMA99_PANIC_RECLAIM_LONG;
    confidence = clamp(Math.round(46 + extendedLongScore * 0.3 - Math.abs(ema99Distance) * 2), 0, 90);
    evidenceRows = extendedLongEvidence;
    reason = `Top tang hang ${extendedRank} vua panic pullback ${pullback.toFixed(2)}% ve EMA99 5m, da hoi + reclaim voi volume; PAPER EVAL, khong cap Binance.`;
  } else if (preLongReady && (!preShortReady || preLongScore >= preShortScore)) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.PRE_UP_BASE_LONG;
    confidence = clamp(Math.round(48 + preLongScore * 0.34 - Math.abs(ema99Distance) * 3), 0, 88);
    evidenceRows = preLongEvidence;
    reason = 'Top tang dang pullback sat EMA99 5m voi cau truc EMA va flow con giu; tao paper LONG som, chua phai BASE READY.';
  } else if (preShortReady) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.PRE_DOWN_BASE_SHORT;
    confidence = clamp(Math.round(48 + preShortScore * 0.34 - Math.abs(ema99Distance) * 3), 0, 88);
    evidenceRows = preShortEvidence;
    reason = 'Top giam dang hoi sat EMA99 5m voi cau truc EMA va flow con giu; tao paper SHORT som, chua phai BASE READY.';
  } else if (upMove && upImpulse) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.UP_SQUEEZE_ACTIVE;
    confidence = clamp(Math.round(45 + Math.min(Math.max(change24h, change1h * 3), 45) * 0.7 + Math.min(volumeX, 4) * 5), 0, 94);
    evidenceRows = shortEvidence;
    reason = 'Gia/volume dang mo rong len; cho sweep + reject truoc khi xet SHORT.';
  } else if (downMove && downImpulse) {
    label = LIQUID_HEATMAP_FLOW_V2_LABELS.DOWN_SQUEEZE_ACTIVE;
    confidence = clamp(Math.round(45 + Math.min(Math.max(Math.abs(change24h), Math.abs(change1h) * 3), 45) * 0.7 + Math.min(volumeX, 4) * 5), 0, 94);
    evidenceRows = longEvidence;
    reason = 'Gia/volume dang mo rong xuong; cho sweep + reclaim truoc khi xet LONG.';
  }

  const missing = [];
  if (!candleReady) missing.push('closed-candles');
  if (features.trend1h?.ready !== true && features.trend4h?.ready !== true) missing.push('htf-1h-4h-candles');
  if (features.ema99Retest5m?.ready !== true && features.ema99Retest15m?.ready !== true) missing.push('5m-15m-ema99-candles');
  if (finite(features.openInterestSamples, 0) < 2 || finite(features.openInterestDeltaPct, null) == null) missing.push('oi-delta');
  if (String(features.liquidationSocketState) !== 'OPEN') missing.push('force-order-socket');
  else if (finite(features.liquidationEvents, 0) === 0) missing.push('liquidation-events');
  const continuationReady = label?.key === 'UP_BASE_SWEEP_LONG_READY'
    || label?.key === 'DOWN_BASE_SWEEP_SHORT_READY'
    || label?.key === 'PRE_UP_BASE_LONG'
    || label?.key === 'PRE_DOWN_BASE_SHORT'
    || label?.key === 'HTF_BEAR_15M_EMA99_PUMP_REJECT'
    || label?.key === 'HTF_BULL_15M_EMA99_DUMP_RECLAIM'
    || label?.key === 'EXTENDED_EMA99_PANIC_RECLAIM_LONG'
    || label?.key === 'PRIMARY_EMA99_PANIC_FLUSH_ACTIVE'
    || label?.key === 'PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY'
    || label?.key === 'PUMP_DISTRIBUTION_WATCH'
    || label?.key === 'PUMP_DISTRIBUTION_SHORT_READY';
  const secondaryLabels = distributionClassification && distributionClassification.labelKey !== label?.key
    ? [distributionClassification]
    : [];

  return {
    version: LIQUID_HEATMAP_FLOW_V2_VERSION,
    labelKey: label?.key ?? 'WAIT',
    label: label?.title ?? 'WAIT · NO CONFIRMATION',
    side: label?.side ?? null,
    phase: label?.phase ?? 'WAIT',
    confidence,
    reason,
    evidence: evidenceRows,
    ema99RetestTimeframe,
    ema99RetestCandleClosedAt,
    secondaryLabels,
    missing,
    warmingUp: !candleReady || (!continuationReady
      && (missing.includes('oi-delta') || missing.includes('force-order-socket'))),
    observationOnly: true,
    affectsOrders: false,
    affectsBinance: false,
    affectsEntry: false,
    affectsSize: false,
    affectsSlTp: false,
  };
}

export function liquidHeatmapFlowV2Stats(rows = [], paperTrades = []) {
  const list = Object.values(LIQUID_HEATMAP_FLOW_V2_LABELS).map((definition) => ({
    ...definition,
    whitelistKey: `heatmap-v2:${definition.key}`,
    active: 0,
    ready: definition.phase === 'READY',
    maxConfidence: 0,
    symbols: [],
    observationOnly: true,
    affectsOrders: false,
    paperClosed: 0,
    paperAvgRoe: null,
    whitelistEligible: false,
  }));
  const byKey = new Map(list.map((row) => [row.key, row]));
  for (const row of Array.isArray(rows) ? rows : []) {
    const classifications = [
      row?.classification,
      ...(Array.isArray(row?.classification?.secondaryLabels) ? row.classification.secondaryLabels : []),
    ];
    const seen = new Set();
    for (const classification of classifications) {
      const key = String(classification?.labelKey ?? '');
      if (!key || seen.has(key)) continue;
      seen.add(key);
      const stat = byKey.get(key);
      if (!stat) continue;
      stat.active += 1;
      stat.maxConfidence = Math.max(stat.maxConfidence, finite(classification?.confidence, 0));
      if (stat.symbols.length < 6) stat.symbols.push(row.symbol);
    }
  }
  const paperByLabel = new Map();
  for (const trade of Array.isArray(paperTrades) ? paperTrades : []) {
    if (trade?.status !== 'CLOSED' || !byKey.has(trade?.labelKey)) continue;
    const bucket = paperByLabel.get(trade.labelKey) ?? { closed: 0, roeSum: 0 };
    bucket.closed += 1;
    bucket.roeSum += finite(trade.netRoe, 0);
    paperByLabel.set(trade.labelKey, bucket);
  }
  for (const stat of list) {
    const paper = paperByLabel.get(stat.key);
    if (!paper) continue;
    stat.paperClosed = paper.closed;
    stat.paperAvgRoe = +(paper.roeSum / paper.closed).toFixed(2);
    stat.whitelistEligible = stat.paperAvgRoe > 4;
  }
  return list;
}
