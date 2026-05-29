function calcEma(closes, period) {
  if (closes.length < period) return NaN;
  const alpha = 2 / (period + 1);
  let ema = 0;
  for (let i = 0; i < period; i++) ema += closes[i];
  ema /= period;
  for (let i = period; i < closes.length; i++) ema = alpha * closes[i] + (1 - alpha) * ema;
  return ema;
}

function calcRsi(closes, period) {
  if (closes.length < period + 1) return NaN;
  let gains = 0, losses = 0;
  for (let i = 1; i <= period; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gains += d; else losses -= d;
  }
  let ag = gains / period, al = losses / period;
  for (let i = period + 1; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    ag = (ag * (period - 1) + (d > 0 ? d : 0)) / period;
    al = (al * (period - 1) + (d < 0 ? -d : 0)) / period;
  }
  return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
}

function gradeScore(score) {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  return 'D';
}

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function sma(arr, period, end = arr.length) {
  if (end < period) return NaN;
  let sum = 0;
  for (let i = end - period; i < end; i++) sum += arr[i];
  return sum / period;
}

function atr(highs, lows, closes, period) {
  const trs = [];
  for (let i = 1; i < closes.length; i++) {
    trs.push(Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1])));
  }
  if (trs.length < period) return NaN;
  let a = 0;
  for (let i = 0; i < period; i++) a += trs[i];
  a /= period;
  for (let i = period; i < trs.length; i++) a = (a * (period - 1) + trs[i]) / period;
  return a;
}

function slopePct(values) {
  const n = values.length;
  if (n < 3) return 0;
  let sx = 0, sy = 0, sxy = 0, sx2 = 0;
  for (let i = 0; i < n; i++) {
    sx += i; sy += values[i]; sxy += i * values[i]; sx2 += i * i;
  }
  const denom = n * sx2 - sx * sx;
  if (!denom) return 0;
  const slope = (n * sxy - sx * sy) / denom;
  const base = values.reduce((s, v) => s + v, 0) / n;
  return base > 0 ? slope / base : 0;
}

function maxIndex(values, start, end) {
  let idx = start, val = -Infinity;
  for (let i = start; i <= end; i++) if (values[i] > val) { val = values[i]; idx = i; }
  return idx;
}

function minValue(values, start, end) {
  let val = Infinity;
  for (let i = start; i <= end; i++) if (values[i] < val) val = values[i];
  return val;
}

function minIndex(values, start, end) {
  let idx = start, val = Infinity;
  for (let i = start; i <= end; i++) if (values[i] < val) { val = values[i]; idx = i; }
  return idx;
}

function maxValue(values, start, end) {
  let val = -Infinity;
  for (let i = start; i <= end; i++) if (values[i] > val) val = values[i];
  return val;
}

export function detectPostPumpKillShort(candles, state = {}, opts = {}) {
  const C = {
    lookback: 192,
    pumpMinPct: 0.08,
    postPumpDropMinPct: 0.025,
    distMinBars: 8,
    spikeSearchBack: 3,
    spikeMinMovePct: 0.012,
    spikeAtrMult: 1.2,
    spikeVolMult: 1.4,
    sweepLookback: 18,
    sweepBufferPct: 0.0015,
    wickRejectMin: 0.32,
    closePosMax: 0.62,
    confirmMaxAge: 2,
    minWatchScore: 50,
    minShortScore: 58,
    ...opts,
  };

  const n = candles.length;
  if (n < 70) return { pass: false, reason: 'not enough candles' };

  const opens = candles.map((k) => +k.open);
  const highs = candles.map((k) => +k.high);
  const lows = candles.map((k) => +k.low);
  const closes = candles.map((k) => +k.close);
  const vols = candles.map((k) => +k.volume);
  const A = atr(highs, lows, closes, 14);
  if (!Number.isFinite(A) || A <= 0) return { pass: false, reason: 'ATR invalid' };

  const ema13 = Number.isFinite(state.ema13) ? state.ema13 : calcEma(closes, 13);
  const ema25 = Number.isFinite(state.ema25) ? state.ema25 : calcEma(closes, 25);
  const ema99 = Number.isFinite(state.ema99) ? state.ema99 : calcEma(closes, 99);
  const rsi6 = Number.isFinite(state.rsi6) ? state.rsi6 : calcRsi(closes, 6);
  const rsi14 = Number.isFinite(state.rsi14) ? state.rsi14 : calcRsi(closes, 14);

  const scanEnd = n - 2; // last closed candle
  const start = Math.max(0, scanEnd - C.lookback);

  let spikeIdx = null;
  let spikeMeta = null;
  for (let i = scanEnd; i >= Math.max(start + 30, scanEnd - C.spikeSearchBack); i--) {
    const prevClose = closes[i - 1];
    const body = closes[i] - opens[i];
    const range = highs[i] - lows[i];
    if (body <= 0 || range <= 0) continue;

    const avgVol = sma(vols, 20, i);
    if (!Number.isFinite(avgVol) || avgVol <= 0) continue;
    const movePct = (highs[i] - prevClose) / Math.max(prevClose, 1e-9);
    const atrMove = (highs[i] - prevClose) / A;
    const recentHigh = Math.max(...highs.slice(Math.max(0, i - C.sweepLookback), i));
    const swept = highs[i] >= recentHigh * (1 + C.sweepBufferPct);
    const volX = vols[i] / avgVol;
    const rsiHot = Number.isFinite(rsi6) ? rsi6 >= 72 : true;

    if (swept && volX >= C.spikeVolMult && (movePct >= C.spikeMinMovePct || atrMove >= C.spikeAtrMult) && rsiHot) {
      spikeIdx = i;
      spikeMeta = { avgVol, movePct, atrMove, recentHigh, volX };
      break;
    }
  }
  if (spikeIdx == null) return { pass: false, reason: 'no kill-short spike' };

  const pumpStart = start;
  const pumpEnd = Math.max(pumpStart, spikeIdx - C.distMinBars);
  const pumpHighIdx = maxIndex(highs, pumpStart, pumpEnd);
  const prePumpLow = minValue(lows, pumpStart, pumpHighIdx);
  const pumpPct = (highs[pumpHighIdx] - prePumpLow) / Math.max(prePumpLow, 1e-9);
  const troughAfterPump = minValue(lows, pumpHighIdx, spikeIdx - 1);
  const postPumpDropPct = (highs[pumpHighIdx] - troughAfterPump) / Math.max(highs[pumpHighIdx], 1e-9);
  const distBars = spikeIdx - pumpHighIdx;
  if (pumpPct < C.pumpMinPct) return { pass: false, reason: `pump too small (${(pumpPct * 100).toFixed(1)}%)` };
  if (distBars < C.distMinBars) return { pass: false, reason: `distribution too short (${distBars})` };
  if (postPumpDropPct < C.postPumpDropMinPct) return { pass: false, reason: `post-pump drop too small (${(postPumpDropPct * 100).toFixed(1)}%)` };

  const distStart = Math.max(pumpHighIdx, spikeIdx - 28);
  const distCloses = closes.slice(distStart, spikeIdx);
  const distSlope = slopePct(distCloses);
  const beforeSpikeClose = closes[spikeIdx - 1];
  const belowFastEma = Number.isFinite(ema25) && beforeSpikeClose < ema25;
  const belowEma99 = Number.isFinite(ema99) && beforeSpikeClose < ema99;
  const emaBear = Number.isFinite(ema13) && Number.isFinite(ema25) && ema13 < ema25;
  const distributionOk = distSlope < 0 || belowFastEma || belowEma99 || emaBear;
  if (!distributionOk) return { pass: false, reason: 'no distribution context' };

  const o = opens[spikeIdx], h = highs[spikeIdx], l = lows[spikeIdx], c = closes[spikeIdx];
  const range = h - l;
  const closePos = range > 0 ? (c - l) / range : 1;
  const upperWick = h - Math.max(o, c);
  const upperWickFrac = range > 0 ? upperWick / range : 0;
  const closeUnderEma = (Number.isFinite(ema99) && c < ema99) || (Number.isFinite(ema25) && c < ema25);
  const spikeReject = upperWickFrac >= C.wickRejectMin && closePos <= C.closePosMax;

  let confirmIdx = null;
  for (let i = spikeIdx + 1; i <= Math.min(n - 1, spikeIdx + C.confirmMaxAge); i++) {
    const mid = l + range * 0.5;
    if (closes[i] < opens[i] && closes[i] < mid) {
      confirmIdx = i;
      break;
    }
  }

  const confirmed = (spikeReject && closeUnderEma) || confirmIdx != null;
  const scPump = clamp01((pumpPct - C.pumpMinPct) / 0.25);
  const scDist = clamp01((postPumpDropPct - C.postPumpDropMinPct) / 0.12);
  const scSlope = clamp01(Math.abs(Math.min(0, distSlope)) / 0.006);
  const scSpike = clamp01(Math.max(spikeMeta.movePct / 0.05, spikeMeta.atrMove / 3));
  const scVol = clamp01((spikeMeta.volX - C.spikeVolMult) / 3.5);
  const scRsi = Number.isFinite(rsi6) ? clamp01((rsi6 - 70) / 18) : 0.4;
  const scReject = clamp01((upperWickFrac - 0.2) / 0.55) * 0.6 + clamp01((0.75 - closePos) / 0.5) * 0.4;
  const score = Math.round(100 * (
    scPump * 0.14 + scDist * 0.14 + scSlope * 0.10 + scSpike * 0.20 +
    scVol * 0.14 + scRsi * 0.10 + scReject * 0.18
  ));

  const stage = confirmed ? 'confirmed_short' : 'watch_spike';
  if (confirmed && score < C.minShortScore) return { pass: false, reason: `score too low (${score})` };
  if (!confirmed && score < C.minWatchScore) return { pass: false, reason: `watch score too low (${score})` };

  const entry = confirmed ? (confirmIdx != null ? closes[confirmIdx] : c) : c;
  const sl = +(h + 0.6 * A).toFixed(10);
  const tp = +(Math.min(ema25 || entry, troughAfterPump) || (entry - 2 * A)).toFixed(10);
  const altEntry = +(Math.min(h - range * 0.35, entry * 1.004)).toFixed(10);

  return {
    pass: true,
    action: confirmed ? 'SHORT' : 'WATCH',
    type: 'post_pump_kill_short',
    stage,
    score,
    grade: gradeScore(score),
    entry: +entry.toFixed(10),
    altEntry,
    sl,
    tp,
    reason: confirmed
      ? 'Post-pump distribution + kill-short spike rejected -> SHORT fade'
      : 'Post-pump distribution + kill-short spike detected, wait for rejection',
    note: `PPKS | pump=${(pumpPct * 100).toFixed(1)}% | drop=${(postPumpDropPct * 100).toFixed(1)}% | spike=${(spikeMeta.movePct * 100).toFixed(1)}%/${spikeMeta.atrMove.toFixed(1)}ATR | vol=${spikeMeta.volX.toFixed(1)}x | wick=${(upperWickFrac * 100).toFixed(0)}% | closePos=${(closePos * 100).toFixed(0)}% | RSI6=${Number.isFinite(rsi6) ? rsi6.toFixed(1) : '-'}`,
    factors: {
      pumpPct: +(pumpPct * 100).toFixed(2),
      postPumpDropPct: +(postPumpDropPct * 100).toFixed(2),
      distBars,
      distSlopePct: +(distSlope * 100).toFixed(3),
      belowEma99: belowEma99 ? 1 : 0,
      emaBear: emaBear ? 1 : 0,
      spikeMovePct: +(spikeMeta.movePct * 100).toFixed(2),
      spikeAtrMove: +spikeMeta.atrMove.toFixed(2),
      spikeVolRatio: +spikeMeta.volX.toFixed(2),
      upperWickFrac: +upperWickFrac.toFixed(2),
      closePos: +closePos.toFixed(2),
      rsi6: Number.isFinite(rsi6) ? +rsi6.toFixed(1) : null,
      rsi14: Number.isFinite(rsi14) ? +rsi14.toFixed(1) : null,
      spikeHigh: +h.toFixed(10),
      confirmIdx,
    },
  };
}

export function detectPostDumpKillLong(candles, state = {}, opts = {}) {
  const C = {
    lookback: 192,
    dumpMinPct: 0.08,
    postDumpBounceMinPct: 0.018,
    baseMinBars: 8,
    sweepSearchBack: 3,
    sweepMinMovePct: 0.012,
    sweepAtrMult: 1.2,
    sweepVolMult: 1.4,
    sweepLookback: 18,
    sweepBufferPct: 0.0015,
    lowerWickMin: 0.32,
    closePosMin: 0.38,
    confirmMaxAge: 2,
    minWatchScore: 48,
    minLongScore: 56,
    ...opts,
  };

  const n = candles.length;
  if (n < 70) return { pass: false, reason: 'not enough candles' };

  const opens = candles.map((k) => +k.open);
  const highs = candles.map((k) => +k.high);
  const lows = candles.map((k) => +k.low);
  const closes = candles.map((k) => +k.close);
  const vols = candles.map((k) => +k.volume);
  const A = atr(highs, lows, closes, 14);
  if (!Number.isFinite(A) || A <= 0) return { pass: false, reason: 'ATR invalid' };

  const ema13 = Number.isFinite(state.ema13) ? state.ema13 : calcEma(closes, 13);
  const ema25 = Number.isFinite(state.ema25) ? state.ema25 : calcEma(closes, 25);
  const ema99 = Number.isFinite(state.ema99) ? state.ema99 : calcEma(closes, 99);
  const rsi6 = Number.isFinite(state.rsi6) ? state.rsi6 : calcRsi(closes, 6);
  const rsi14 = Number.isFinite(state.rsi14) ? state.rsi14 : calcRsi(closes, 14);

  const scanEnd = n - 2;
  const start = Math.max(0, scanEnd - C.lookback);

  let sweepIdx = null;
  let sweepMeta = null;
  for (let i = scanEnd; i >= Math.max(start + 30, scanEnd - C.sweepSearchBack); i--) {
    const prevClose = closes[i - 1];
    const body = closes[i] - opens[i];
    const range = highs[i] - lows[i];
    if (body >= 0 || range <= 0) continue;

    const avgVol = sma(vols, 20, i);
    if (!Number.isFinite(avgVol) || avgVol <= 0) continue;
    const movePct = (prevClose - lows[i]) / Math.max(prevClose, 1e-9);
    const atrMove = (prevClose - lows[i]) / A;
    const recentLow = Math.min(...lows.slice(Math.max(0, i - C.sweepLookback), i));
    const swept = lows[i] <= recentLow * (1 - C.sweepBufferPct);
    const volX = vols[i] / avgVol;
    const rsiCold = Number.isFinite(rsi6) ? rsi6 <= 32 : true;

    if (swept && volX >= C.sweepVolMult && (movePct >= C.sweepMinMovePct || atrMove >= C.sweepAtrMult) && rsiCold) {
      sweepIdx = i;
      sweepMeta = { avgVol, movePct, atrMove, recentLow, volX };
      break;
    }
  }
  if (sweepIdx == null) return { pass: false, reason: 'no kill-long sweep' };

  const dumpEnd = Math.max(start, sweepIdx - C.baseMinBars);
  const dumpLowIdx = minIndex(lows, start, dumpEnd);
  const preDumpHigh = maxValue(highs, start, dumpLowIdx);
  const dumpPct = (preDumpHigh - lows[dumpLowIdx]) / Math.max(preDumpHigh, 1e-9);
  const peakAfterDump = maxValue(highs, dumpLowIdx, sweepIdx - 1);
  const postDumpBouncePct = (peakAfterDump - lows[dumpLowIdx]) / Math.max(lows[dumpLowIdx], 1e-9);
  const baseBars = sweepIdx - dumpLowIdx;
  if (dumpPct < C.dumpMinPct) return { pass: false, reason: `dump too small (${(dumpPct * 100).toFixed(1)}%)` };
  if (baseBars < C.baseMinBars) return { pass: false, reason: `base too short (${baseBars})` };
  if (postDumpBouncePct < C.postDumpBounceMinPct) return { pass: false, reason: `post-dump bounce too small (${(postDumpBouncePct * 100).toFixed(1)}%)` };

  const baseStart = Math.max(dumpLowIdx, sweepIdx - 28);
  const baseCloses = closes.slice(baseStart, sweepIdx);
  const baseSlope = slopePct(baseCloses);
  const beforeSweepClose = closes[sweepIdx - 1];
  const belowFastEma = Number.isFinite(ema25) && beforeSweepClose < ema25;
  const belowEma99 = Number.isFinite(ema99) && beforeSweepClose < ema99;
  const emaBear = Number.isFinite(ema13) && Number.isFinite(ema25) && ema13 < ema25;
  const baseOk = baseSlope >= -0.006 || belowFastEma || belowEma99 || emaBear;
  if (!baseOk) return { pass: false, reason: 'no post-dump base context' };

  const o = opens[sweepIdx], h = highs[sweepIdx], l = lows[sweepIdx], c = closes[sweepIdx];
  const range = h - l;
  const closePos = range > 0 ? (c - l) / range : 0;
  const lowerWick = Math.min(o, c) - l;
  const lowerWickFrac = range > 0 ? lowerWick / range : 0;
  const closeAboveFast = (Number.isFinite(ema13) && c > ema13) || (Number.isFinite(ema25) && c > ema25);
  const sweepReject = lowerWickFrac >= C.lowerWickMin && closePos >= C.closePosMin;

  let confirmIdx = null;
  for (let i = sweepIdx + 1; i <= Math.min(n - 1, sweepIdx + C.confirmMaxAge); i++) {
    const mid = l + range * 0.5;
    if (closes[i] > opens[i] && closes[i] > mid) {
      confirmIdx = i;
      break;
    }
  }

  const confirmed = (sweepReject && closeAboveFast) || confirmIdx != null;
  const scDump = clamp01((dumpPct - C.dumpMinPct) / 0.25);
  const scBounce = clamp01((postDumpBouncePct - C.postDumpBounceMinPct) / 0.12);
  const scBase = clamp01((baseSlope + 0.006) / 0.012);
  const scSweep = clamp01(Math.max(sweepMeta.movePct / 0.05, sweepMeta.atrMove / 3));
  const scVol = clamp01((sweepMeta.volX - C.sweepVolMult) / 3.5);
  const scRsi = Number.isFinite(rsi6) ? clamp01((34 - rsi6) / 18) : 0.4;
  const scReject = clamp01((lowerWickFrac - 0.2) / 0.55) * 0.6 + clamp01((closePos - 0.35) / 0.5) * 0.4;
  const score = Math.round(100 * (
    scDump * 0.14 + scBounce * 0.12 + scBase * 0.10 + scSweep * 0.20 +
    scVol * 0.14 + scRsi * 0.12 + scReject * 0.18
  ));

  const stage = confirmed ? 'confirmed_long' : 'watch_long_sweep';
  if (confirmed && score < C.minLongScore) return { pass: false, reason: `score too low (${score})` };
  if (!confirmed && score < C.minWatchScore) return { pass: false, reason: `watch score too low (${score})` };

  const entry = confirmed ? (confirmIdx != null ? closes[confirmIdx] : c) : c;
  const sl = +(l - 0.6 * A).toFixed(10);
  const tp = +(Math.max(ema25 || entry, peakAfterDump) || (entry + 2 * A)).toFixed(10);
  const altEntry = +(Math.max(l + range * 0.35, entry * 0.996)).toFixed(10);

  return {
    pass: true,
    action: confirmed ? 'LONG' : 'WATCH',
    type: 'post_dump_kill_long',
    stage,
    score,
    grade: gradeScore(score),
    entry: +entry.toFixed(10),
    altEntry,
    sl,
    tp,
    reason: confirmed
      ? 'Post-dump base + kill-long sweep reclaimed -> LONG reversal'
      : 'Post-dump base + kill-long sweep detected, wait for reclaim',
    note: `PDKL | dump=${(dumpPct * 100).toFixed(1)}% | bounce=${(postDumpBouncePct * 100).toFixed(1)}% | sweep=${(sweepMeta.movePct * 100).toFixed(1)}%/${sweepMeta.atrMove.toFixed(1)}ATR | vol=${sweepMeta.volX.toFixed(1)}x | wick=${(lowerWickFrac * 100).toFixed(0)}% | closePos=${(closePos * 100).toFixed(0)}% | RSI6=${Number.isFinite(rsi6) ? rsi6.toFixed(1) : '-'}`,
    factors: {
      dumpPct: +(dumpPct * 100).toFixed(2),
      postDumpBouncePct: +(postDumpBouncePct * 100).toFixed(2),
      baseBars,
      baseSlopePct: +(baseSlope * 100).toFixed(3),
      belowEma99: belowEma99 ? 1 : 0,
      emaBear: emaBear ? 1 : 0,
      sweepMovePct: +(sweepMeta.movePct * 100).toFixed(2),
      sweepAtrMove: +sweepMeta.atrMove.toFixed(2),
      sweepVolRatio: +sweepMeta.volX.toFixed(2),
      lowerWickFrac: +lowerWickFrac.toFixed(2),
      closePos: +closePos.toFixed(2),
      rsi6: Number.isFinite(rsi6) ? +rsi6.toFixed(1) : null,
      rsi14: Number.isFinite(rsi14) ? +rsi14.toFixed(1) : null,
      sweepLow: +l.toFixed(10),
      confirmIdx,
    },
  };
}

export async function runPostPumpKillShortScan(symbols, klineCache, snapshotMap) {
  const signals = [];
  let processed = 0;
  for (const symbol of symbols) {
    try {
      const klines = klineCache.getIfCached(symbol, '15m', 220);
      if (!klines || klines.length < 70) continue;
      processed++;
      const closes = klines.map((k) => +k.close);
      const state = {
        ema13: calcEma(closes, 13),
        ema25: calcEma(closes, 25),
        ema99: calcEma(closes, 99),
        rsi6: calcRsi(closes, 6),
        rsi14: calcRsi(closes, 14),
      };
      const snap = snapshotMap.get(symbol);
      const detections = [
        detectPostPumpKillShort(klines, state),
        detectPostDumpKillLong(klines, state),
      ].filter((det) => det.pass);
      for (const det of detections) {
        signals.push({
          symbol,
          action: det.action,
          type: det.type,
          stage: det.stage,
          score: det.score,
          grade: det.grade,
          entry: det.entry,
          altEntry: det.altEntry,
          sl: det.sl,
          tp: det.tp,
          reason: det.reason,
          note: det.note,
          factors: det.factors,
          blockLong: det.stage === 'confirmed_short',
          blockShort: det.stage === 'confirmed_long',
          markPrice: snap?.markPrice,
          change24h: snap?.change24hPct,
          volume: snap?.quoteVolume,
          scannedAt: Date.now(),
        });
      }
    } catch {
      // skip bad symbol
    }
  }
  return { signals: signals.sort((a, b) => b.score - a.score), processed };
}
