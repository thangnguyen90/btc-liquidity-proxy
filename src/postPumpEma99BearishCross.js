import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

export const POST_PUMP_EMA99_BEARISH_CROSS_VERSION =
  'POST_PUMP_DUMP_EMA99_CROSS_MTF_V2_LONG_SHORT_20260917';
export const POST_PUMP_EMA99_BEARISH_CROSS_LABEL =
  'POST_PUMP_EMA99_BEARISH_CROSS_5M_CONFIRMED_MTF';
export const POST_DUMP_EMA99_BULLISH_CROSS_LABEL =
  'POST_DUMP_EMA99_BULLISH_CROSS_5M_CONFIRMED_MTF';

export const POST_PUMP_EMA99_BEARISH_CROSS_RULE = Object.freeze({
  minBars5m: 110,
  minBars15m: 60,
  minBars1h: 105,
  maxBars5m: 260,
  maxBars15m: 220,
  maxBars1h: 130,
  max5mAgeMs: 10 * 60_000,
  max15mAgeMs: 25 * 60_000,
  max1hAgeMs: 65 * 60_000,
  pumpLookback1h: 120,
  prePeakLookback1h: 72,
  minPumpPct: 40,
  minDumpPct: 40,
  minPeakAgeHours: 4,
  maxPeakAgeHours: 96,
  minDrawdownPct: 8,
  maxDrawdownPct: 70,
  minRecoveryPct: 8,
  maxRecoveryPct: 120,
  minPostPeakBars1h: 4,
  minPostPeakBars15m: 12,
  minPostTroughBars1h: 4,
  minPostTroughBars15m: 12,
  minLowerHighSteps1h: 2,
  minLowerHighSteps15m: 2,
  minHigherLowSteps1h: 2,
  minHigherLowSteps15m: 2,
  minBearishCloses5m: 4,
  minBullishCloses5m: 4,
  lowerHighStepPct: 0.35,
});

const INTERVAL_MS = Object.freeze({ '5m': 5 * 60_000, '15m': 15 * 60_000, '1h': 60 * 60_000 });
const HOUR_MS = 60 * 60_000;
const finite = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const pct = (value, digits = 2) => Number.isFinite(value)
  ? `${value >= 0 ? '+' : ''}${value.toFixed(digits)}%`
  : '—';
const price = (value) => Number.isFinite(value)
  ? Number(value.toFixed(10)).toString()
  : '—';
const localTime = (value) => new Date(value).toLocaleString('vi-VN', {
  timeZone: 'Asia/Ho_Chi_Minh', hour12: false,
});

function valueOf(row, key, index) {
  return finite(Array.isArray(row) ? row[index] : row?.[key]);
}

function normalizeBar(row) {
  if (!row) return null;
  const bar = {
    openTime: valueOf(row, 'openTime', 0),
    open: valueOf(row, 'open', 1),
    high: valueOf(row, 'high', 2),
    low: valueOf(row, 'low', 3),
    close: valueOf(row, 'close', 4),
    volume: valueOf(row, 'volume', 5),
    closeTime: valueOf(row, 'closeTime', 6),
    quoteVolume: valueOf(row, 'quoteVolume', 7),
  };
  if (![bar.openTime, bar.open, bar.high, bar.low, bar.close, bar.closeTime]
    .every(Number.isFinite)
    || Math.min(bar.open, bar.high, bar.low, bar.close) <= 0
    || bar.high < Math.max(bar.open, bar.close)
    || bar.low > Math.min(bar.open, bar.close)) return null;
  if (!Number.isFinite(bar.quoteVolume) && Number.isFinite(bar.volume)) {
    bar.quoteVolume = bar.volume * bar.close;
  }
  return bar;
}

function closedBars(rows, now, limit) {
  const unique = new Map();
  for (const row of Array.isArray(rows) ? rows : []) {
    const bar = normalizeBar(row);
    if (bar && bar.closeTime <= now) unique.set(bar.openTime, bar);
  }
  return [...unique.values()]
    .sort((left, right) => left.openTime - right.openTime)
    .slice(-limit);
}

function continuous(bars, interval) {
  const duration = INTERVAL_MS[interval];
  if (!duration) return false;
  for (let index = 1; index < bars.length; index += 1) {
    if (Math.abs(bars[index].openTime - bars[index - 1].openTime - duration) > 1_000) return false;
  }
  return true;
}

function emaSeries(values, period) {
  const output = Array(values.length).fill(null);
  if (values.length < period) return output;
  let current = values.slice(0, period).reduce((sum, value) => sum + value, 0) / period;
  output[period - 1] = current;
  const alpha = 2 / (period + 1);
  for (let index = period; index < values.length; index += 1) {
    current += alpha * (values[index] - current);
    output[index] = current;
  }
  return output;
}

function slopePct(series, index, lookback) {
  const current = finite(series[index]);
  const prior = finite(series[index - lookback]);
  return current > 0 && prior > 0 ? (current / prior - 1) * 100 : null;
}

function waveStructure(bars, minimumChunkBars = 3, stepPct = 0.35) {
  const chunkCount = Math.min(4, Math.floor(bars.length / minimumChunkBars));
  if (chunkCount < 2) {
    return { chunkHighs: [], chunkLows: [], lowerHighSteps: 0, higherLowSteps: 0 };
  }
  const chunkHighs = [];
  const chunkLows = [];
  for (let chunk = 0; chunk < chunkCount; chunk += 1) {
    const from = Math.floor(chunk * bars.length / chunkCount);
    const to = Math.max(from + 1, Math.floor((chunk + 1) * bars.length / chunkCount));
    chunkHighs.push(Math.max(...bars.slice(from, to).map((bar) => bar.high)));
    chunkLows.push(Math.min(...bars.slice(from, to).map((bar) => bar.low)));
  }
  let lowerHighSteps = 0;
  let higherLowSteps = 0;
  for (let index = 1; index < chunkHighs.length; index += 1) {
    if (chunkHighs[index] <= chunkHighs[index - 1] * (1 - stepPct / 100)) lowerHighSteps += 1;
    if (chunkLows[index] >= chunkLows[index - 1] * (1 + stepPct / 100)) higherLowSteps += 1;
  }
  return { chunkHighs, chunkLows, lowerHighSteps, higherLowSteps };
}

export function detectPostPumpEma99BearishCross5m({
  klines5m = [],
  now = Date.now(),
  config = {},
} = {}) {
  const rule = { ...POST_PUMP_EMA99_BEARISH_CROSS_RULE, ...config };
  const bars = closedBars(klines5m, now, rule.maxBars5m);
  if (bars.length < rule.minBars5m || !continuous(bars, '5m')) return null;
  const index = bars.length - 1;
  const current = bars[index];
  if (now - current.closeTime > rule.max5mAgeMs) return null;
  const closes = bars.map((bar) => bar.close);
  const ema13Series = emaSeries(closes, 13);
  const ema25Series = emaSeries(closes, 25);
  const ema99Series = emaSeries(closes, 99);
  const ema13 = finite(ema13Series[index]);
  const ema25 = finite(ema25Series[index]);
  const ema99 = finite(ema99Series[index]);
  const previous13 = finite(ema13Series[index - 1]);
  const previous25 = finite(ema25Series[index - 1]);
  const previous99 = finite(ema99Series[index - 1]);
  if (![ema13, ema25, ema99, previous13, previous25, previous99].every(Number.isFinite)) return null;
  const aboveBothNow = ema99 > ema13 && ema99 > ema25;
  const aboveBothBefore = previous99 > previous13 && previous99 > previous25;
  if (!aboveBothNow || aboveBothBefore) return null;
  const crossed = [];
  if (previous99 <= previous13 && ema99 > ema13) crossed.push('EMA13');
  if (previous99 <= previous25 && ema99 > ema25) crossed.push('EMA25');
  if (!crossed.length) return null;
  const bearishStack = current.close < ema13 && ema13 < ema25 && ema25 < ema99;
  const ema13Slope6Pct = slopePct(ema13Series, index, 6);
  const ema25Slope6Pct = slopePct(ema25Series, index, 6);
  const bearishCloses = bars.slice(-6).filter((bar, offset) => {
    const seriesIndex = index - 5 + offset;
    return bar.close < finite(ema25Series[seriesIndex], -Infinity);
  }).length;
  if (!bearishStack || !(ema13Slope6Pct < 0) || !(ema25Slope6Pct < 0)
    || bearishCloses < rule.minBearishCloses5m) return null;
  return {
    signalAt: current.closeTime,
    signalOpenAt: current.openTime,
    confirmationClose: current.close,
    crossed,
    ema13,
    ema25,
    ema99,
    previous13,
    previous25,
    previous99,
    ema13Slope6Pct,
    ema25Slope6Pct,
    ema99Vs25Pct: (ema99 / ema25 - 1) * 100,
    bearishCloses,
  };
}

export function detectPostDumpEma99BullishCross5m({
  klines5m = [],
  now = Date.now(),
  config = {},
} = {}) {
  const rule = { ...POST_PUMP_EMA99_BEARISH_CROSS_RULE, ...config };
  const bars = closedBars(klines5m, now, rule.maxBars5m);
  if (bars.length < rule.minBars5m || !continuous(bars, '5m')) return null;
  const index = bars.length - 1;
  const current = bars[index];
  if (now - current.closeTime > rule.max5mAgeMs) return null;
  const closes = bars.map((bar) => bar.close);
  const ema13Series = emaSeries(closes, 13);
  const ema25Series = emaSeries(closes, 25);
  const ema99Series = emaSeries(closes, 99);
  const ema13 = finite(ema13Series[index]);
  const ema25 = finite(ema25Series[index]);
  const ema99 = finite(ema99Series[index]);
  const previous13 = finite(ema13Series[index - 1]);
  const previous25 = finite(ema25Series[index - 1]);
  const previous99 = finite(ema99Series[index - 1]);
  if (![ema13, ema25, ema99, previous13, previous25, previous99].every(Number.isFinite)) return null;
  const belowBothNow = ema99 < ema13 && ema99 < ema25;
  const belowBothBefore = previous99 < previous13 && previous99 < previous25;
  if (!belowBothNow || belowBothBefore) return null;
  const crossed = [];
  if (previous99 >= previous13 && ema99 < ema13) crossed.push('EMA13');
  if (previous99 >= previous25 && ema99 < ema25) crossed.push('EMA25');
  if (!crossed.length) return null;
  const bullishStack = current.close > ema13 && ema13 > ema25 && ema25 > ema99;
  const ema13Slope6Pct = slopePct(ema13Series, index, 6);
  const ema25Slope6Pct = slopePct(ema25Series, index, 6);
  const bullishCloses = bars.slice(-6).filter((bar, offset) => {
    const seriesIndex = index - 5 + offset;
    return bar.close > finite(ema25Series[seriesIndex], Infinity);
  }).length;
  if (!bullishStack || !(ema13Slope6Pct > 0) || !(ema25Slope6Pct > 0)
    || bullishCloses < rule.minBullishCloses5m) return null;
  return {
    signalAt: current.closeTime,
    signalOpenAt: current.openTime,
    confirmationClose: current.close,
    crossed,
    ema13,
    ema25,
    ema99,
    previous13,
    previous25,
    previous99,
    ema13Slope6Pct,
    ema25Slope6Pct,
    ema25Vs99Pct: (ema25 / ema99 - 1) * 100,
    bullishCloses,
  };
}

function detectOneHourPumpContext(klines1h, signalAt, rule) {
  const bars = closedBars(klines1h, signalAt, rule.maxBars1h);
  if (bars.length < rule.minBars1h || !continuous(bars, '1h')) return null;
  const current = bars.at(-1);
  if (signalAt - current.closeTime > rule.max1hAgeMs) return null;
  const startIndex = Math.max(0, bars.length - rule.pumpLookback1h);
  let peakIndex = startIndex;
  for (let index = startIndex + 1; index < bars.length; index += 1) {
    if (bars[index].high > bars[peakIndex].high) peakIndex = index;
  }
  const peak = bars[peakIndex];
  const peakAgeHours = (signalAt - peak.closeTime) / HOUR_MS;
  if (peakAgeHours < rule.minPeakAgeHours || peakAgeHours > rule.maxPeakAgeHours) return null;
  const preStart = Math.max(startIndex, peakIndex - rule.prePeakLookback1h);
  const prePeakRows = bars.slice(preStart, peakIndex);
  if (!prePeakRows.length) return null;
  const prePeakLowBar = prePeakRows.reduce((best, bar) => bar.low < best.low ? bar : best);
  const pumpPct = (peak.high / prePeakLowBar.low - 1) * 100;
  const drawdownPct = (peak.high - current.close) / peak.high * 100;
  const postPeak = bars.slice(peakIndex + 1);
  if (pumpPct < rule.minPumpPct
    || drawdownPct < rule.minDrawdownPct || drawdownPct > rule.maxDrawdownPct
    || postPeak.length < rule.minPostPeakBars1h) return null;
  const wave = waveStructure(postPeak, 1, rule.lowerHighStepPct);
  const closes = bars.map((bar) => bar.close);
  const ema13Series = emaSeries(closes, 13);
  const ema25Series = emaSeries(closes, 25);
  const ema99Series = emaSeries(closes, 99);
  const index = bars.length - 1;
  const ema13 = finite(ema13Series[index]);
  const ema25 = finite(ema25Series[index]);
  const ema99 = finite(ema99Series[index]);
  const ema13Slope3Pct = slopePct(ema13Series, index, 3);
  const ema25Slope3Pct = slopePct(ema25Series, index, 3);
  if (![ema13, ema25, ema99, ema13Slope3Pct, ema25Slope3Pct].every(Number.isFinite)
    || current.close >= ema13
    || wave.lowerHighSteps < rule.minLowerHighSteps1h
    || !(ema13Slope3Pct < 0 || ema25Slope3Pct < 0)) return null;
  return {
    closeTime: current.closeTime,
    close: current.close,
    ema13,
    ema25,
    ema99,
    ema13Slope3Pct,
    ema25Slope3Pct,
    peakAt: peak.closeTime,
    peakPrice: peak.high,
    prePeakLowAt: prePeakLowBar.closeTime,
    prePeakLow: prePeakLowBar.low,
    pumpPct,
    drawdownPct,
    peakAgeHours,
    postPeakBars: postPeak.length,
    lowerHighSteps: wave.lowerHighSteps,
    chunkHighs: wave.chunkHighs,
  };
}

function detectOneHourDumpContext(klines1h, signalAt, rule) {
  const bars = closedBars(klines1h, signalAt, rule.maxBars1h);
  if (bars.length < rule.minBars1h || !continuous(bars, '1h')) return null;
  const current = bars.at(-1);
  if (signalAt - current.closeTime > rule.max1hAgeMs) return null;
  const startIndex = Math.max(0, bars.length - rule.pumpLookback1h);
  let troughIndex = startIndex;
  for (let index = startIndex + 1; index < bars.length; index += 1) {
    if (bars[index].low < bars[troughIndex].low) troughIndex = index;
  }
  const trough = bars[troughIndex];
  const troughAgeHours = (signalAt - trough.closeTime) / HOUR_MS;
  if (troughAgeHours < rule.minPeakAgeHours || troughAgeHours > rule.maxPeakAgeHours) return null;
  const preStart = Math.max(startIndex, troughIndex - rule.prePeakLookback1h);
  const preTroughRows = bars.slice(preStart, troughIndex);
  if (!preTroughRows.length) return null;
  const preTroughHighBar = preTroughRows.reduce((best, bar) => bar.high > best.high ? bar : best);
  const dumpPct = (preTroughHighBar.high - trough.low) / preTroughHighBar.high * 100;
  const recoveryPct = (current.close / trough.low - 1) * 100;
  const postTrough = bars.slice(troughIndex + 1);
  if (dumpPct < rule.minDumpPct
    || recoveryPct < rule.minRecoveryPct || recoveryPct > rule.maxRecoveryPct
    || postTrough.length < rule.minPostTroughBars1h) return null;
  const wave = waveStructure(postTrough, 1, rule.lowerHighStepPct);
  const closes = bars.map((bar) => bar.close);
  const ema13Series = emaSeries(closes, 13);
  const ema25Series = emaSeries(closes, 25);
  const ema99Series = emaSeries(closes, 99);
  const index = bars.length - 1;
  const ema13 = finite(ema13Series[index]);
  const ema25 = finite(ema25Series[index]);
  const ema99 = finite(ema99Series[index]);
  const ema13Slope3Pct = slopePct(ema13Series, index, 3);
  const ema25Slope3Pct = slopePct(ema25Series, index, 3);
  if (![ema13, ema25, ema99, ema13Slope3Pct, ema25Slope3Pct].every(Number.isFinite)
    || current.close <= ema13
    || wave.higherLowSteps < rule.minHigherLowSteps1h
    || !(ema13Slope3Pct > 0 || ema25Slope3Pct > 0)) return null;
  return {
    closeTime: current.closeTime,
    close: current.close,
    ema13,
    ema25,
    ema99,
    ema13Slope3Pct,
    ema25Slope3Pct,
    troughAt: trough.closeTime,
    troughPrice: trough.low,
    preTroughHighAt: preTroughHighBar.closeTime,
    preTroughHigh: preTroughHighBar.high,
    dumpPct,
    recoveryPct,
    troughAgeHours,
    postTroughBars: postTrough.length,
    higherLowSteps: wave.higherLowSteps,
    chunkLows: wave.chunkLows,
  };
}

function detectFifteenMinuteWeakness(klines15m, signalAt, rule, peakAt = null) {
  const bars = closedBars(klines15m, signalAt, rule.maxBars15m);
  if (bars.length < rule.minBars15m || !continuous(bars, '15m')) return null;
  const current = bars.at(-1);
  if (signalAt - current.closeTime > rule.max15mAgeMs) return null;
  const closes = bars.map((bar) => bar.close);
  const ema13Series = emaSeries(closes, 13);
  const ema25Series = emaSeries(closes, 25);
  const ema99Series = emaSeries(closes, 99);
  const index = bars.length - 1;
  const ema13 = finite(ema13Series[index]);
  const ema25 = finite(ema25Series[index]);
  const ema99 = finite(ema99Series[index]);
  const ema13Slope4Pct = slopePct(ema13Series, index, 4);
  const ema25Slope4Pct = slopePct(ema25Series, index, 4);
  if (![ema13, ema25, ema13Slope4Pct, ema25Slope4Pct].every(Number.isFinite)
    || current.close >= ema13 || current.close >= ema25
    || ema13 >= ema25 || ema13Slope4Pct >= 0 || ema25Slope4Pct >= 0) return null;
  const postPeak = Number.isFinite(peakAt)
    ? bars.filter((bar) => bar.openTime > peakAt)
    : bars.slice(-48);
  if (postPeak.length < rule.minPostPeakBars15m) return null;
  const wave = waveStructure(postPeak, 3, rule.lowerHighStepPct);
  if (wave.lowerHighSteps < rule.minLowerHighSteps15m) return null;
  return {
    closeTime: current.closeTime,
    close: current.close,
    ema13,
    ema25,
    ema99,
    ema13Slope4Pct,
    ema25Slope4Pct,
    postPeakBars: postPeak.length,
    lowerHighSteps: wave.lowerHighSteps,
    chunkHighs: wave.chunkHighs,
  };
}

function detectFifteenMinuteStrength(klines15m, signalAt, rule, troughAt = null) {
  const bars = closedBars(klines15m, signalAt, rule.maxBars15m);
  if (bars.length < rule.minBars15m || !continuous(bars, '15m')) return null;
  const current = bars.at(-1);
  if (signalAt - current.closeTime > rule.max15mAgeMs) return null;
  const closes = bars.map((bar) => bar.close);
  const ema13Series = emaSeries(closes, 13);
  const ema25Series = emaSeries(closes, 25);
  const ema99Series = emaSeries(closes, 99);
  const index = bars.length - 1;
  const ema13 = finite(ema13Series[index]);
  const ema25 = finite(ema25Series[index]);
  const ema99 = finite(ema99Series[index]);
  const ema13Slope4Pct = slopePct(ema13Series, index, 4);
  const ema25Slope4Pct = slopePct(ema25Series, index, 4);
  if (![ema13, ema25, ema13Slope4Pct, ema25Slope4Pct].every(Number.isFinite)
    || current.close <= ema13 || current.close <= ema25
    || ema13 <= ema25 || ema13Slope4Pct <= 0 || ema25Slope4Pct <= 0) return null;
  const postTrough = Number.isFinite(troughAt)
    ? bars.filter((bar) => bar.openTime > troughAt)
    : bars.slice(-48);
  if (postTrough.length < rule.minPostTroughBars15m) return null;
  const wave = waveStructure(postTrough, 3, rule.lowerHighStepPct);
  if (wave.higherLowSteps < rule.minHigherLowSteps15m) return null;
  return {
    closeTime: current.closeTime,
    close: current.close,
    ema13,
    ema25,
    ema99,
    ema13Slope4Pct,
    ema25Slope4Pct,
    postTroughBars: postTrough.length,
    higherLowSteps: wave.higherLowSteps,
    chunkLows: wave.chunkLows,
  };
}

function expectedShortEntry(trigger5m, frame15m) {
  const reference = trigger5m.confirmationClose;
  const lowerAnchors = [trigger5m.ema25, frame15m.ema13]
    .filter((value) => Number.isFinite(value) && value > reference);
  const upperAnchors = [trigger5m.ema99, frame15m.ema25]
    .filter((value) => Number.isFinite(value) && value > reference);
  if (!lowerAnchors.length || !upperAnchors.length) return null;
  const low = Math.min(...lowerAnchors);
  const eligibleUpperAnchors = upperAnchors.filter((value) => value >= low);
  if (!eligibleUpperAnchors.length) return null;
  const high = Math.min(...eligibleUpperAnchors);
  if (!(high >= low)) return null;
  const midpoint = (low + high) / 2;
  return {
    mode: 'WAIT_5M_RETEST_REJECT',
    low,
    high,
    midpoint,
    reboundToLowPct: (low / reference - 1) * 100,
    reboundToHighPct: (high / reference - 1) * 100,
    condition: 'Chỉ xem xét SHORT khi giá hồi vào vùng và nến 5m đóng reject trở lại dưới EMA25/EMA99; không đuổi ở giá đang rơi.',
  };
}

function expectedLongEntry(trigger5m, frame15m) {
  const reference = trigger5m.confirmationClose;
  const upperAnchors = [trigger5m.ema25, frame15m.ema13]
    .filter((value) => Number.isFinite(value) && value < reference);
  const lowerAnchors = [trigger5m.ema99, frame15m.ema25]
    .filter((value) => Number.isFinite(value) && value < reference);
  if (!upperAnchors.length || !lowerAnchors.length) return null;
  const high = Math.max(...upperAnchors);
  const eligibleLowerAnchors = lowerAnchors.filter((value) => value <= high);
  if (!eligibleLowerAnchors.length) return null;
  const low = Math.max(...eligibleLowerAnchors);
  const midpoint = (low + high) / 2;
  return {
    mode: 'WAIT_5M_PULLBACK_RECLAIM',
    low,
    high,
    midpoint,
    pullbackToHighPct: (high / reference - 1) * 100,
    pullbackToLowPct: (low / reference - 1) * 100,
    condition: 'Chỉ xem xét LONG khi giá điều chỉnh vào vùng và nến 5m đóng reclaim trở lại trên EMA25/EMA99; không đuổi ở giá đang tăng.',
  };
}

export function detectPostPumpEma99BearishCrossCandidate({
  klines5m = [],
  klines15m = [],
  now = Date.now(),
  config = {},
} = {}) {
  const rule = { ...POST_PUMP_EMA99_BEARISH_CROSS_RULE, ...config };
  const trigger5m = detectPostPumpEma99BearishCross5m({ klines5m, now, config: rule });
  if (!trigger5m) return null;
  const frame15m = detectFifteenMinuteWeakness(
    klines15m,
    trigger5m.signalAt,
    rule,
  );
  return frame15m ? { trigger5m, frame15m } : null;
}

export function detectPostDumpEma99BullishCrossCandidate({
  klines5m = [],
  klines15m = [],
  now = Date.now(),
  config = {},
} = {}) {
  const rule = { ...POST_PUMP_EMA99_BEARISH_CROSS_RULE, ...config };
  const trigger5m = detectPostDumpEma99BullishCross5m({ klines5m, now, config: rule });
  if (!trigger5m) return null;
  const frame15m = detectFifteenMinuteStrength(
    klines15m,
    trigger5m.signalAt,
    rule,
  );
  return frame15m ? { trigger5m, frame15m } : null;
}

export function detectPostPumpEma99BearishCross({
  symbol,
  klines5m = [],
  klines15m = [],
  klines1h = [],
  now = Date.now(),
  config = {},
} = {}) {
  const rule = { ...POST_PUMP_EMA99_BEARISH_CROSS_RULE, ...config };
  const trigger5m = detectPostPumpEma99BearishCross5m({ klines5m, now, config: rule });
  if (!symbol || !trigger5m) return null;
  const frame1h = detectOneHourPumpContext(klines1h, trigger5m.signalAt, rule);
  if (!frame1h) return null;
  const frame15m = detectFifteenMinuteWeakness(
    klines15m,
    trigger5m.signalAt,
    rule,
    frame1h.peakAt,
  );
  if (!frame15m) return null;
  const expectedEntry = expectedShortEntry(trigger5m, frame15m);
  if (!expectedEntry) return null;
  const score = clamp(Math.round(
    58
    + Math.min(14, Math.max(0, frame1h.pumpPct - rule.minPumpPct) * 0.12)
    + Math.min(8, Math.max(0, frame1h.drawdownPct - rule.minDrawdownPct) * 0.4)
    + Math.min(8, frame1h.lowerHighSteps * 2)
    + Math.min(8, frame15m.lowerHighSteps * 2)
    + Math.min(4, Math.max(0, trigger5m.ema99Vs25Pct) * 4),
  ), 0, 100);
  const normalizedSymbol = String(symbol).trim().toUpperCase();
  return {
    version: POST_PUMP_EMA99_BEARISH_CROSS_VERSION,
    label: POST_PUMP_EMA99_BEARISH_CROSS_LABEL,
    stage: POST_PUMP_EMA99_BEARISH_CROSS_LABEL,
    symbol: normalizedSymbol,
    side: 'SHORT',
    interval: '5m+15m+1h',
    observeOnly: true,
    binanceEligible: false,
    executionEnabled: false,
    score,
    signalAt: trigger5m.signalAt,
    signalPrice: trigger5m.confirmationClose,
    confirmationClose: trigger5m.confirmationClose,
    trigger5m,
    frame15m,
    frame1h,
    expectedEntry,
    generatedAt: new Date(now).toISOString(),
    dedupeKey: `${normalizedSymbol}|${POST_PUMP_EMA99_BEARISH_CROSS_LABEL}`,
  };
}

export function detectPostDumpEma99BullishCross({
  symbol,
  klines5m = [],
  klines15m = [],
  klines1h = [],
  now = Date.now(),
  config = {},
} = {}) {
  const rule = { ...POST_PUMP_EMA99_BEARISH_CROSS_RULE, ...config };
  const trigger5m = detectPostDumpEma99BullishCross5m({ klines5m, now, config: rule });
  if (!symbol || !trigger5m) return null;
  const frame1h = detectOneHourDumpContext(klines1h, trigger5m.signalAt, rule);
  if (!frame1h) return null;
  const frame15m = detectFifteenMinuteStrength(
    klines15m,
    trigger5m.signalAt,
    rule,
    frame1h.troughAt,
  );
  if (!frame15m) return null;
  const expectedEntry = expectedLongEntry(trigger5m, frame15m);
  if (!expectedEntry) return null;
  const score = clamp(Math.round(
    58
    + Math.min(14, Math.max(0, frame1h.dumpPct - rule.minDumpPct) * 0.12)
    + Math.min(8, Math.max(0, frame1h.recoveryPct - rule.minRecoveryPct) * 0.25)
    + Math.min(8, frame1h.higherLowSteps * 2)
    + Math.min(8, frame15m.higherLowSteps * 2)
    + Math.min(4, Math.max(0, trigger5m.ema25Vs99Pct) * 4),
  ), 0, 100);
  const normalizedSymbol = String(symbol).trim().toUpperCase();
  return {
    version: POST_PUMP_EMA99_BEARISH_CROSS_VERSION,
    label: POST_DUMP_EMA99_BULLISH_CROSS_LABEL,
    stage: POST_DUMP_EMA99_BULLISH_CROSS_LABEL,
    symbol: normalizedSymbol,
    side: 'LONG',
    interval: '5m+15m+1h',
    observeOnly: true,
    binanceEligible: false,
    executionEnabled: false,
    score,
    signalAt: trigger5m.signalAt,
    signalPrice: trigger5m.confirmationClose,
    confirmationClose: trigger5m.confirmationClose,
    trigger5m,
    frame15m,
    frame1h,
    expectedEntry,
    generatedAt: new Date(now).toISOString(),
    dedupeKey: `${normalizedSymbol}|${POST_DUMP_EMA99_BULLISH_CROSS_LABEL}`,
  };
}

export function postPumpEma99BearishCrossPayload(event) {
  const symbol = encodeURIComponent(event.symbol);
  const coin = encodeURIComponent(event.symbol.replace(/USDT$/, ''));
  const trigger = event.trigger5m;
  const fifteen = event.frame15m;
  const hourly = event.frame1h;
  const entry = event.expectedEntry;
  const isLong = event.side === 'LONG';
  const mark = finite(event.markPrice);
  const markDrift = mark > 0
    ? (mark / event.confirmationClose - 1) * 100
    : null;
  return {
    username: 'Post Pump/Dump EMA99 MTF',
    allowed_mentions: { parse: [] },
    embeds: [{
      title: isLong
        ? `🟢 ${event.symbol} · HẬU SẬP · EMA99 5M XUỐNG DƯỚI EMA13/25`
        : `🔴 ${event.symbol} · HẬU BƠM · EMA99 5M VƯỢT EMA13/25`,
      color: isLong ? 0x16a34a : 0xdc2626,
      description: [
        `**${event.label} · điểm ${event.score}/100 · ${event.side} WATCH**`,
        isLong
          ? 'EMA99 vừa nằm dưới đồng thời EMA13 và EMA25 ở nến 5m đã đóng; 15m xác nhận higher-low và 1h xác nhận cú sập lớn đang hồi phục.'
          : 'EMA99 vừa nằm trên đồng thời EMA13 và EMA25 ở nến 5m đã đóng; 15m xác nhận lower-high và 1h xác nhận cú bơm lớn đang suy yếu.',
        '**OBSERVE ONLY — KHÔNG TỰ ĐẶT LỆNH BINANCE.**',
      ].join('\n'),
      fields: [
        {
          name: `${isLong ? '🟩' : '🟥'} GIÁ LÚC PHÁT`,
          value: `**\`${price(mark > 0 ? mark : event.signalPrice)} USDT\`**\nClose xác nhận 5m ${price(event.confirmationClose)}${Number.isFinite(markDrift) ? ` · mark lệch ${pct(markDrift)}` : ''}`,
        },
        {
          name: isLong
            ? '✂️ TRIGGER 5M · EMA99 XUỐNG DƯỚI CẢ HAI EMA NHANH'
            : '✂️ TRIGGER 5M · EMA99 VƯỢT CẢ HAI EMA NHANH',
          value: isLong
            ? `Vừa cắt xuống: **${trigger.crossed.join(' + ')}**\nClose ${price(trigger.confirmationClose)} > EMA13 ${price(trigger.ema13)} > EMA25 ${price(trigger.ema25)} > EMA99 ${price(trigger.ema99)}\nDốc 6 nến: EMA13 ${pct(trigger.ema13Slope6Pct)} · EMA25 ${pct(trigger.ema25Slope6Pct)} · ${trigger.bullishCloses}/6 close trên EMA25`
            : `Vừa vượt: **${trigger.crossed.join(' + ')}**\nClose ${price(trigger.confirmationClose)} < EMA13 ${price(trigger.ema13)} < EMA25 ${price(trigger.ema25)} < EMA99 ${price(trigger.ema99)}\nDốc 6 nến: EMA13 ${pct(trigger.ema13Slope6Pct)} · EMA25 ${pct(trigger.ema25Slope6Pct)} · ${trigger.bearishCloses}/6 close dưới EMA25`,
        },
        {
          name: isLong
            ? '🎯 VÙNG VÀO LONG DỰ KIẾN · CHỜ ĐIỀU CHỈNH, KHÔNG ĐUỔI'
            : '🎯 VÙNG VÀO SHORT DỰ KIẾN · CHỜ HỒI, KHÔNG ĐUỔI',
          value: isLong
            ? `**${price(entry.low)}–${price(entry.high)} USDT** · mốc giữa **${price(entry.midpoint)}**\nGiá cần điều chỉnh từ close tín hiệu: **${pct(entry.pullbackToHighPct)} → ${pct(entry.pullbackToLowPct)}**\n${entry.condition}`
            : `**${price(entry.low)}–${price(entry.high)} USDT** · mốc giữa **${price(entry.midpoint)}**\nGiá cần hồi từ close tín hiệu: **${pct(entry.reboundToLowPct)} → ${pct(entry.reboundToHighPct)}**\n${entry.condition}`,
        },
        {
          name: isLong ? '📈 XÁC NHẬN 15M · ĐÁY NÂNG DẦN' : '📉 XÁC NHẬN 15M · SÓNG GIẢM DẦN',
          value: isLong
            ? `Higher-low **${fifteen.higherLowSteps} bước** / ${fifteen.postTroughBars} nến hậu đáy\nClose ${price(fifteen.close)} > EMA13 ${price(fifteen.ema13)} > EMA25 ${price(fifteen.ema25)}${Number.isFinite(fifteen.ema99) ? ` · EMA99 ${price(fifteen.ema99)}` : ''}\nDốc 4 nến: EMA13 ${pct(fifteen.ema13Slope4Pct)} · EMA25 ${pct(fifteen.ema25Slope4Pct)}`
            : `Lower-high **${fifteen.lowerHighSteps} bước** / ${fifteen.postPeakBars} nến hậu đỉnh\nClose ${price(fifteen.close)} < EMA13 ${price(fifteen.ema13)} < EMA25 ${price(fifteen.ema25)}${Number.isFinite(fifteen.ema99) ? ` · EMA99 ${price(fifteen.ema99)}` : ''}\nDốc 4 nến: EMA13 ${pct(fifteen.ema13Slope4Pct)} · EMA25 ${pct(fifteen.ema25Slope4Pct)}`,
        },
        {
          name: isLong ? '🕳️ BỐI CẢNH 1H · SẬP SÂU RỒI HỒI PHỤC' : '🏔️ BỐI CẢNH 1H · BƠM CAO RỒI SUY YẾU',
          value: isLong
            ? `Từ ${price(hourly.preTroughHigh)} xuống đáy ${price(hourly.troughPrice)}: **-${hourly.dumpPct.toFixed(2)}%**\nĐáy cách ${hourly.troughAgeHours.toFixed(1)}h · hiện hồi **${pct(hourly.recoveryPct)}** · higher-low **${hourly.higherLowSteps} bước**\nClose ${price(hourly.close)} · EMA13 ${price(hourly.ema13)} · EMA25 ${price(hourly.ema25)} · EMA99 ${price(hourly.ema99)}\nĐáy 1h: ${localTime(hourly.troughAt)} (VN)`
            : `Từ ${price(hourly.prePeakLow)} lên đỉnh ${price(hourly.peakPrice)}: **${pct(hourly.pumpPct)}**\nĐỉnh cách ${hourly.peakAgeHours.toFixed(1)}h · hiện rút **${hourly.drawdownPct.toFixed(1)}%** · lower-high **${hourly.lowerHighSteps} bước**\nClose ${price(hourly.close)} · EMA13 ${price(hourly.ema13)} · EMA25 ${price(hourly.ema25)} · EMA99 ${price(hourly.ema99)}\nĐỉnh 1h: ${localTime(hourly.peakAt)} (VN)`,
        },
        {
          name: '⚠️ CÁCH DÙNG',
          value: isLong
            ? 'Đây là cảnh báo cấu trúc hồi phục sau sập, không phải xác nhận chắc chắn tiếp tục tăng. Không đuổi LONG nếu giá đã rời xa close tín hiệu; chờ pullback/reclaim nếu cần đánh giá entry.'
            : 'Đây là cảnh báo cấu trúc suy yếu sau bơm, không phải xác nhận chắc chắn tiếp tục giảm. Không đuổi SHORT nếu giá đã rời xa close tín hiệu; chờ retest/reject nếu cần đánh giá entry.',
        },
        {
          name: 'MỞ BIỂU ĐỒ',
          value: `[Binance](https://www.binance.com/en/futures/${symbol}) · [CoinGlass Model 3](https://www.coinglass.com/pro/futures/LiquidationHeatMapModel3?coin=${coin})`,
        },
      ],
      timestamp: event.generatedAt,
      footer: { text: `${POST_PUMP_EMA99_BEARISH_CROSS_VERSION} · closed 5m trigger + closed 15m/1h context` },
    }],
  };
}

export class PostPumpEma99BearishCrossDiscordNotifier {
  constructor({
    stateFile,
    webhookUrl = () => '',
    now = () => Date.now(),
    fetchImpl = fetch,
    cooldownMs = 6 * HOUR_MS,
  } = {}) {
    Object.assign(this, { stateFile, webhookUrl, now, fetchImpl, cooldownMs });
    this.queue = Promise.resolve();
    this.memory = null;
    this.retryAfter = 0;
  }

  notify(event) {
    const job = this.queue.catch(() => {}).then(() => this.process(event));
    this.queue = job;
    return job;
  }

  async process(event) {
    const now = this.now();
    const supportedLabel = event?.label === POST_PUMP_EMA99_BEARISH_CROSS_LABEL
      || event?.label === POST_DUMP_EMA99_BULLISH_CROSS_LABEL;
    const supportedSide = (event?.label === POST_PUMP_EMA99_BEARISH_CROSS_LABEL
        && event?.side === 'SHORT')
      || (event?.label === POST_DUMP_EMA99_BULLISH_CROSS_LABEL
        && event?.side === 'LONG');
    if (!event || event.version !== POST_PUMP_EMA99_BEARISH_CROSS_VERSION
      || !supportedLabel || !supportedSide
      || event.observeOnly !== true || event.binanceEligible !== false
      || !Number.isFinite(event.signalAt)
      || now - event.signalAt > POST_PUMP_EMA99_BEARISH_CROSS_RULE.max5mAgeMs) {
      return { sent: 0, reason: 'invalid_or_stale' };
    }
    const url = String(typeof this.webhookUrl === 'function'
      ? this.webhookUrl()
      : this.webhookUrl).trim();
    if (!/^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9._-]+$/.test(url)) {
      return { sent: 0, reason: 'not_configured' };
    }
    if (now < this.retryAfter) return { sent: 0, reason: 'backoff' };
    if (!this.memory) {
      try {
        this.memory = JSON.parse(await readFile(this.stateFile, 'utf8'));
      } catch (error) {
        if (error.code !== 'ENOENT') throw new Error('Cannot read post-pump/dump EMA99 Discord state');
        this.memory = { alerts: {} };
      }
    }
    this.memory.alerts ??= {};
    const key = event.dedupeKey;
    const prior = this.memory.alerts[key];
    if (Number(prior?.signalAt) === event.signalAt
      || (Number(prior?.sentAt) > 0 && now - Number(prior.sentAt) < this.cooldownMs)) {
      return { sent: 0, reason: 'deduped' };
    }
    let response;
    try {
      response = await this.fetchImpl(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(postPumpEma99BearishCrossPayload(event)),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      this.retryAfter = now + 60_000;
      throw new Error('Post-pump/dump EMA99 Discord network failure; retry delayed');
    }
    if (!response.ok) {
      const rate = response.status === 429 ? await response.json().catch(() => ({})) : {};
      this.retryAfter = now + Math.max(60_000,
        Math.min(HOUR_MS, finite(rate.retry_after, 0) * 1_000));
      throw new Error(`Post-pump/dump EMA99 Discord HTTP ${response.status}`);
    }
    this.memory.alerts[key] = { signalAt: event.signalAt, sentAt: now };
    this.memory.version = POST_PUMP_EMA99_BEARISH_CROSS_VERSION;
    this.memory.updatedAt = new Date(now).toISOString();
    this.memory.alerts = Object.fromEntries(Object.entries(this.memory.alerts)
      .filter(([, value]) => now - Number(value?.sentAt ?? 0) < 14 * 24 * HOUR_MS));
    await mkdir(dirname(this.stateFile), { recursive: true });
    const temporary = `${this.stateFile}.tmp`;
    await writeFile(temporary, `${JSON.stringify(this.memory, null, 2)}\n`, 'utf8');
    await rename(temporary, this.stateFile);
    return { sent: 1, reason: 'sent', symbol: event.symbol, label: event.label };
  }
}

export async function scanPostPumpEma99BearishCross(
  symbols,
  klineCache,
  notify,
  {
    now = Date.now(),
    maxAlerts = 10,
    maxOneHourWarmups = 6,
    ensureOneHour = null,
    signalPrices = null,
    config = {},
  } = {},
) {
  const events = [];
  let processed = 0;
  let candidates = 0;
  let shortCandidates = 0;
  let longCandidates = 0;
  let oneHourReady = 0;
  let warmed = 0;
  for (const symbol of [...new Set(Array.isArray(symbols) ? symbols : [])]) {
    const klines5m = klineCache?.getIfCached?.(symbol, '5m', 260);
    const klines15m = klineCache?.getIfCached?.(symbol, '15m', 220);
    if (!Array.isArray(klines5m) || !Array.isArray(klines15m)) continue;
    processed += 1;
    const shortPreliminary = detectPostPumpEma99BearishCrossCandidate({
      klines5m, klines15m, now, config,
    });
    const longPreliminary = shortPreliminary ? null : detectPostDumpEma99BullishCrossCandidate({
      klines5m, klines15m, now, config,
    });
    if (!shortPreliminary && !longPreliminary) continue;
    candidates += 1;
    shortCandidates += Number(Boolean(shortPreliminary));
    longCandidates += Number(Boolean(longPreliminary));
    let klines1h = klineCache?.getIfCached?.(symbol, '1h', 130);
    if ((!Array.isArray(klines1h)
      || klines1h.length < POST_PUMP_EMA99_BEARISH_CROSS_RULE.minBars1h)
      && typeof ensureOneHour === 'function' && warmed < maxOneHourWarmups) {
      await ensureOneHour(symbol);
      warmed += 1;
      klines1h = klineCache?.getIfCached?.(symbol, '1h', 130);
    }
    if (!Array.isArray(klines1h)) continue;
    oneHourReady += 1;
    const event = shortPreliminary
      ? detectPostPumpEma99BearishCross({
        symbol, klines5m, klines15m, klines1h, now, config,
      })
      : detectPostDumpEma99BullishCross({
        symbol, klines5m, klines15m, klines1h, now, config,
      });
    if (!event) continue;
    const normalizedSymbol = String(symbol).toUpperCase();
    const markPrice = finite(signalPrices instanceof Map
      ? signalPrices.get(normalizedSymbol)
      : signalPrices?.[normalizedSymbol]);
    events.push({
      ...event,
      markPrice: markPrice > 0 ? markPrice : null,
      signalPrice: markPrice > 0 ? markPrice : event.signalPrice,
      signalPriceSource: markPrice > 0 ? 'BINANCE_MARKET_SNAPSHOT' : 'CLOSED_5M',
    });
  }
  events.sort((left, right) => right.score - left.score || right.signalAt - left.signalAt);
  let sent = 0;
  let failed = 0;
  for (const event of events.slice(0, Math.max(1, maxAlerts))) {
    try {
      sent += Number((await notify(event))?.sent ?? 0);
    } catch {
      failed += 1;
    }
  }
  return {
    processed,
    candidates,
    shortCandidates,
    longCandidates,
    oneHourReady,
    warmed,
    detected: events.length,
    sent,
    failed,
    top: events.slice(0, 10),
  };
}
