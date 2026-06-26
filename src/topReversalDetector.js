function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function gradeScore(score) {
  if (score >= 85) return 'A';
  if (score >= 70) return 'B';
  if (score >= 55) return 'C';
  return 'D';
}

function emaSeries(values, period) {
  const out = new Array(values.length);
  if (!values.length) return out;
  const alpha = 2 / (period + 1);
  out[0] = values[0];
  for (let i = 1; i < values.length; i++) {
    out[i] = alpha * values[i] + (1 - alpha) * out[i - 1];
  }
  return out;
}

function sma(values, period, end) {
  const start = Math.max(0, end - period + 1);
  let sum = 0;
  let count = 0;
  for (let i = start; i <= end; i++) {
    sum += Number(values[i] ?? 0);
    count++;
  }
  return count ? sum / count : NaN;
}

function calcRsi(values, period = 14, end = values.length - 1) {
  if (end < period + 1) return NaN;
  let gain = 0;
  let loss = 0;
  for (let i = end - period + 1; i <= end; i++) {
    const delta = values[i] - values[i - 1];
    if (delta > 0) gain += delta;
    else loss -= delta;
  }
  const rs = gain / Math.max(loss, 1e-9);
  return 100 - 100 / (1 + rs);
}

function extrema(values, start, end, mode) {
  let idx = start;
  let value = mode === 'max' ? -Infinity : Infinity;
  for (let i = start; i <= end; i++) {
    if (mode === 'max' ? values[i] > value : values[i] < value) {
      idx = i;
      value = values[i];
    }
  }
  return { idx, value };
}

function prep(candles) {
  const open = candles.map((row) => Number(row.open));
  const high = candles.map((row) => Number(row.high));
  const low = candles.map((row) => Number(row.low));
  const close = candles.map((row) => Number(row.close));
  const volume = candles.map((row) => Number(row.volume));
  return {
    open,
    high,
    low,
    close,
    volume,
    ema13: emaSeries(close, 13),
    ema25: emaSeries(close, 25),
    ema99: emaSeries(close, 99),
  };
}

function getTopReversalQuality({ risePct, dropPct, rejectPct, emaBreakPct, redBars, vol5x = 0, vol15x = 0 }) {
  const hardFactors = [
    dropPct >= 0.18,
    rejectPct >= 0.12,
    emaBreakPct >= 0.06,
  ].filter(Boolean).length;
  const blowoffTop = risePct >= 0.50 && rejectPct >= 0.12 && redBars >= 5;
  const hardDcaEligible = hardFactors >= 2
    && redBars >= 3
    && vol5x >= Number(process.env.TOP_REVERSAL_QUALITY_DCA_MIN_VOL5X ?? 8)
    && vol15x >= Number(process.env.TOP_REVERSAL_QUALITY_DCA_MIN_VOL15X ?? 8);
  const volumeDistribution = !blowoffTop
    && hardFactors < 2
    && risePct >= 0.30
    && dropPct >= 0.10
    && rejectPct >= 0.10
    && redBars >= 3
    && vol5x >= 100
    && vol15x >= 100;
  const qualityBreakdown = hardFactors >= 2 || blowoffTop || volumeDistribution;
  const qualityDcaEligible = hardDcaEligible || blowoffTop || volumeDistribution;
  const qualityTier = hardFactors >= 2 || blowoffTop
    ? 'QUALITY'
    : volumeDistribution ? 'VOLUME_DISTRIBUTION' : 'SCOUT_ONLY';
  const reasons = [
    dropPct >= 0.18 ? 'drop>=18%' : null,
    rejectPct >= 0.12 ? 'reject>=12%' : null,
    emaBreakPct >= 0.06 ? 'emaBreak>=6%' : null,
    blowoffTop ? 'blowoffTop' : null,
    volumeDistribution ? `volumeDistribution vol=${vol5x.toFixed(0)}x/${vol15x.toFixed(0)}x` : null,
    qualityBreakdown && !qualityDcaEligible ? `dcaWeakVol vol=${vol5x.toFixed(1)}x/${vol15x.toFixed(1)}x` : null,
  ].filter(Boolean);
  return {
    qualityBreakdown,
    qualityDcaEligible,
    qualityTier,
    hardBreakdownCount: hardFactors,
    blowoffTop,
    volumeDistribution,
    reasons,
  };
}

function getTopReversalStrongCase({
  risePct,
  dropPct,
  rejectPct,
  emaBreakPct,
  peakAge,
  redBars,
  vol5x = 0,
  vol15x = 0,
  earlyConfirmed = false,
}) {
  const peakFresh = peakAge <= 4;
  const distributionBand = risePct >= 0.30
    && risePct <= 0.62
    && dropPct >= 0.095
    && dropPct <= 0.165
    && rejectPct >= 0.095
    && rejectPct <= 0.18
    && emaBreakPct >= 0.01
    && emaBreakPct <= 0.065
    && peakFresh
    && redBars >= 3
    && vol5x >= 10
    && vol15x >= 15;
  const earlyPeakFade = earlyConfirmed
    && risePct >= 0.20
    && dropPct >= 0.055
    && dropPct <= 0.075
    && rejectPct >= 0.075
    && peakAge <= 3
    && redBars >= 3
    && vol5x >= 4
    && vol15x >= 4;
  const score = Math.round(100 * (
    clamp01((risePct - 0.20) / 0.35) * 0.18
    + clamp01((dropPct - 0.055) / 0.095) * 0.22
    + clamp01((rejectPct - 0.075) / 0.075) * 0.20
    + clamp01((4 - peakAge) / 4) * 0.14
    + clamp01((redBars - 2) / 3) * 0.10
    + clamp01((vol5x - 4) / 60) * 0.08
    + clamp01((vol15x - 4) / 80) * 0.08
  ));
  const pass = distributionBand || earlyPeakFade;
  const type = distributionBand ? 'STRONG_PEAK_SIMILAR' : earlyPeakFade ? 'EARLY_PEAK_SIMILAR' : null;
  const reasons = [
    distributionBand ? 'rise/drop/reject giống nhóm peak cao' : null,
    earlyPeakFade ? 'early fade giống nhóm scout thắng' : null,
    peakFresh ? 'đỉnh còn mới' : null,
    redBars >= 3 ? `redBars=${redBars}/5` : null,
    vol5x >= 10 || vol15x >= 15 ? `vol=${vol5x.toFixed(1)}x/${vol15x.toFixed(1)}x` : null,
  ].filter(Boolean);
  return {
    strongCase: pass,
    strongCaseType: type,
    strongCaseScore: pass ? Math.max(55, Math.min(99, score)) : score,
    strongCaseReasons: reasons,
  };
}

function detectFailReclaimLong({
  d5,
  d15,
  last5,
  last15,
  peak,
  priorLow,
  risePct,
  dropPct,
  peakAge,
  vol5x,
  vol15x,
  redBars,
  closeNow,
  emaBreakPct,
  rsi5,
  rsi15,
  rejectPct,
  quality,
  snapshot,
  change24h,
}) {
  const lookback = 10;
  const recentStart = Math.max(1, last5 - lookback);
  const recentLow = extrema(d5.low, recentStart, last5, 'min');
  const recentHigh = extrema(d5.high, recentStart, last5, 'max');
  const pullbackPct = (recentHigh.value - recentLow.value) / Math.max(recentHigh.value, 1e-9);
  const reclaimPct = (closeNow - recentLow.value) / Math.max(recentLow.value, 1e-9);
  const avgVol5 = sma(d5.volume, 30, Math.max(0, last5 - 1));
  const lastVolX = avgVol5 > 0 ? d5.volume[last5] / avgVol5 : 0;
  const greenBars = d5.close.slice(last5 - 2, last5 + 1)
    .filter((close, offset) => close > d5.open[last5 - 2 + offset]).length;
  const hadWeakBreak = d5.low
    .slice(Math.max(0, last5 - 8), last5)
    .some((low, offset) => {
      const idx = Math.max(0, last5 - 8) + offset;
      return low < d5.ema25[idx] || d5.close[idx] < d5.ema25[idx];
    });
  const reclaimEma = closeNow > d5.ema13[last5] && closeNow > d5.ema25[last5];
  const reclaimBreakdownHigh = closeNow > d5.high[Math.max(0, last5 - 1)]
    || closeNow > d5.ema13[last5] * 1.006;
  const weakShortSetup = !quality.qualityBreakdown
    && risePct >= 0.18
    && risePct < 0.45
    && peakAge <= 10
    && rejectPct < 0.12
    && emaBreakPct < 0.06;
  const pass = weakShortSetup
    && hadWeakBreak
    && reclaimEma
    && reclaimBreakdownHigh
    && pullbackPct >= 0.045
    && pullbackPct <= 0.22
    && reclaimPct >= 0.025
    && greenBars >= 2
    && lastVolX >= 1.2
    && Number.isFinite(rsi5)
    && rsi5 >= 45
    && rsi5 <= 78;
  if (!pass) return null;

  const entry = Number(snapshot.markPrice ?? snapshot.lastPrice ?? closeNow);
  if (!Number.isFinite(entry) || entry <= 0) return null;
  const slBase = Math.min(recentLow.value, d5.ema25[last5] * 0.985);
  const sl = Math.min(slBase, entry * 0.965);
  const riskPct = Math.max((entry - sl) / entry, 0.018);
  const tp = entry * (1 + riskPct * 1.8);
  const runnerTp = Math.max(peak.value, entry * (1 + riskPct * 2.8));
  const score = Math.round(100 * (
    clamp01((reclaimPct - 0.025) / 0.12) * 0.24
    + clamp01((pullbackPct - 0.045) / 0.12) * 0.18
    + clamp01((lastVolX - 1.2) / 5) * 0.18
    + clamp01((greenBars - 1) / 2) * 0.14
    + clamp01((0.12 - rejectPct) / 0.12) * 0.10
    + clamp01((0.06 - emaBreakPct) / 0.06) * 0.08
    + clamp01((risePct - 0.18) / 0.22) * 0.08
  ));

  return {
    pass: true,
    type: 'top_reversal_fail_reclaim_long',
    subtype: 'TOP_REVERSAL_FAIL_RECLAIM_LONG',
    action: 'LONG',
    stage: 'FAIL_RECLAIM_LONG',
    confirmed: true,
    qualityBreakdown: false,
    hardBreakdownCount: quality.hardBreakdownCount,
    blowoffTop: false,
    qualityReasons: ['weakShort', 'emaReclaim', 'greenVolume'],
    score: Math.max(55, Math.min(95, score)),
    grade: gradeScore(Math.max(55, Math.min(95, score))),
    entry: Number(entry.toFixed(10)),
    sl: Number(sl.toFixed(10)),
    tp: Number(tp.toFixed(10)),
    runnerTp: Number(runnerTp.toFixed(10)),
    reason: 'Weak top-reversal short failed; price reclaimed EMA13/25 with green volume after pullback.',
    note: [
      `failReclaim=Y`,
      `rise=${(risePct * 100).toFixed(1)}%`,
      `pullback=${(pullbackPct * 100).toFixed(1)}%`,
      `reclaim=${(reclaimPct * 100).toFixed(1)}%`,
      `drop=${(dropPct * 100).toFixed(1)}%`,
      `reject=${(rejectPct * 100).toFixed(1)}%`,
      `emaBreak=${(emaBreakPct * 100).toFixed(1)}%`,
      `greenBars=${greenBars}/3`,
      `lastVol=${lastVolX.toFixed(1)}x`,
      `qualityDca=NO`,
    ].join(' | '),
    factors: {
      risePct: Number((risePct * 100).toFixed(2)),
      dropFromPeakPct: Number((dropPct * 100).toFixed(2)),
      pullbackPct: Number((pullbackPct * 100).toFixed(2)),
      reclaimPct: Number((reclaimPct * 100).toFixed(2)),
      peakAge15m: peakAge,
      peakPrice: Number(peak.value.toFixed(10)),
      priorLow: Number(priorLow.value.toFixed(10)),
      vol5mX: Number(vol5x.toFixed(2)),
      vol15mX: Number(vol15x.toFixed(2)),
      lastVolX: Number(lastVolX.toFixed(2)),
      greenBars3: greenBars,
      redBars5m: redBars,
      rejectPct: Number((rejectPct * 100).toFixed(2)),
      emaBreakPct: Number((emaBreakPct * 100).toFixed(2)),
      hardBreakdownCount: quality.hardBreakdownCount,
      qualityBreakdown: false,
      qualityReasons: ['weakShort', 'emaReclaim', 'greenVolume'],
      ema13_5m: Number(d5.ema13[last5].toFixed(10)),
      ema25_5m: Number(d5.ema25[last5].toFixed(10)),
      ema99_5m: Number(d5.ema99[last5].toFixed(10)),
      rsi5m: Number.isFinite(rsi5) ? Number(rsi5.toFixed(1)) : null,
      rsi15m: Number.isFinite(rsi15) ? Number(rsi15.toFixed(1)) : null,
      change24h,
    },
  };
}

export function detectTopReversal(candles5m, candles15m, snapshot = {}, opts = {}) {
  if (!Array.isArray(candles5m) || candles5m.length < 125) {
    return { pass: false, reason: '5m cache not ready' };
  }
  if (!Array.isArray(candles15m) || candles15m.length < 125) {
    return { pass: false, reason: '15m cache not ready' };
  }

  const minScore = Number(opts.minScore ?? process.env.TOP_REVERSAL_MIN_SCORE ?? 55);
  const d5 = prep(candles5m);
  const d15 = prep(candles15m);
  const last5 = candles5m.length - 2;
  const last15 = candles15m.length - 2;

  const peakStart = Math.max(99, last15 - 16);
  const peak = extrema(d15.high, peakStart, last15, 'max');
  const priorStart = Math.max(1, peak.idx - 64);
  const priorEnd = Math.max(priorStart, peak.idx - 4);
  const priorLow = extrema(d15.low, priorStart, priorEnd, 'min');
  const risePct = (peak.value - priorLow.value) / Math.max(priorLow.value, 1e-9);
  const peakAge = last15 - peak.idx;
  const dropPct = (peak.value - d15.close[last15]) / Math.max(peak.value, 1e-9);
  const change24h = Number(snapshot.change24hPct ?? snapshot.priceChangePercent ?? 0);

  const avgVol15 = sma(d15.volume, 24, Math.max(0, peak.idx - 1));
  const peakVol15 = Math.max(...d15.volume.slice(Math.max(0, peak.idx - 4), Math.min(last15 + 1, peak.idx + 5)));
  const vol15x = avgVol15 > 0 ? peakVol15 / avgVol15 : 0;

  const avgVol5 = sma(d5.volume, 30, Math.max(0, last5 - 6));
  const recentVol5 = Math.max(...d5.volume.slice(Math.max(0, last5 - 5), last5 + 1));
  const vol5x = avgVol5 > 0 ? recentVol5 / avgVol5 : 0;
  const redBars = d5.close.slice(last5 - 4, last5 + 1)
    .filter((close, offset) => close < d5.open[last5 - 4 + offset]).length;
  const closeNow = d5.close[last5];
  const belowEma13 = closeNow < d5.ema13[last5];
  const belowEma25 = closeNow < d5.ema25[last5];
  const emaBreakPct = (d5.ema25[last5] - closeNow) / Math.max(d5.ema25[last5], 1e-9);
  const rsi5 = calcRsi(d5.close, 14, last5);
  const rsi15 = calcRsi(d15.close, 14, last15);
  const recentHigh5 = extrema(d5.high, Math.max(1, last5 - 12), last5, 'max');
  const rejectPct = (recentHigh5.value - closeNow) / Math.max(recentHigh5.value, 1e-9);
  const quality = getTopReversalQuality({
    risePct,
    dropPct,
    rejectPct,
    emaBreakPct,
    redBars,
    vol5x,
    vol15x,
  });
  const failReclaimLong = detectFailReclaimLong({
    d5,
    d15,
    last5,
    last15,
    peak,
    priorLow,
    risePct,
    dropPct,
    peakAge,
    vol5x,
    vol15x,
    redBars,
    closeNow,
    emaBreakPct,
    rsi5,
    rsi15,
    rejectPct,
    quality,
    snapshot,
    change24h,
  });
  if (failReclaimLong) return failReclaimLong;

  const confirmed = belowEma13 && belowEma25 && redBars >= 3 && dropPct >= 0.10;
  const btcBullBias = String(opts.btcBullBias ?? 'neutral').toLowerCase();
  const earlyConfirmed = !confirmed
    && dropPct >= 0.055
    && dropPct < 0.08
    && belowEma13
    && belowEma25
    && redBars >= 3
    && rejectPct >= 0.06
    && vol5x >= 1.8
    && vol15x >= 2.2
    && Number.isFinite(rsi5)
    && rsi5 <= 72
    && btcBullBias !== 'bullish';
  const strongCase = getTopReversalStrongCase({
    risePct,
    dropPct,
    rejectPct,
    emaBreakPct,
    peakAge,
    redBars,
    vol5x,
    vol15x,
    earlyConfirmed,
  });
  const score = Math.round(100 * (
    clamp01((risePct - 0.18) / 0.42) * 0.22
    + clamp01((dropPct - 0.08) / 0.22) * 0.20
    + clamp01((vol5x - 1.8) / 8) * 0.15
    + clamp01((vol15x - 2.2) / 8) * 0.14
    + clamp01((8 - peakAge) / 8) * 0.10
    + clamp01((redBars - 2) / 3) * 0.08
    + clamp01(emaBreakPct / 0.05) * 0.06
    + (confirmed ? 0.05 : 0)
  ));
  const finalScore = earlyConfirmed ? Math.max(score, 55) : score;
  const makeNearMiss = (reason) => {
    const entry = Number(snapshot.markPrice ?? snapshot.lastPrice ?? closeNow);
    if (!Number.isFinite(entry) || entry <= 0) return { pass: false, reason };
    return {
      pass: false,
      nearMiss: true,
      type: 'top_reversal_near_miss',
      subtype: 'TOP_REVERSAL_NEAR_MISS',
      action: 'SHORT',
      stage: 'TOP_NEAR_MISS',
      confirmed: false,
      watchOnly: true,
      qualityBreakdown: false,
      qualityTier: 'SCOUT_ONLY',
      hardBreakdownCount: quality.hardBreakdownCount,
      blowoffTop: quality.blowoffTop,
      volumeDistribution: quality.volumeDistribution,
      qualityReasons: quality.reasons,
      score: Math.max(1, Math.min(99, score)),
      grade: gradeScore(Math.max(1, Math.min(99, score))),
      entry: Number(entry.toFixed(10)),
      sl: null,
      tp: Number((entry * 0.94).toFixed(10)),
      runnerTp: Number((entry * 0.88).toFixed(10)),
      reason,
      note: [
        'WATCH_ONLY=Y',
        `rise=${(risePct * 100).toFixed(1)}%`,
        `drop=${(dropPct * 100).toFixed(1)}%`,
        `peakAge=${peakAge}`,
        `vol5m=${vol5x.toFixed(1)}x`,
        `vol15m=${vol15x.toFixed(1)}x`,
        `redBars=${redBars}/5`,
        `reject=${(rejectPct * 100).toFixed(1)}%`,
        `emaBreak=${(emaBreakPct * 100).toFixed(1)}%`,
        'paper=NO',
      ].join(' | '),
      factors: {
        risePct: Number((risePct * 100).toFixed(2)),
        dropFromPeakPct: Number((dropPct * 100).toFixed(2)),
        peakAge15m: peakAge,
        peakPrice: Number(peak.value.toFixed(10)),
        priorLow: Number(priorLow.value.toFixed(10)),
        vol5mX: Number(vol5x.toFixed(2)),
        vol15mX: Number(vol15x.toFixed(2)),
        redBars5m: redBars,
        rejectPct: Number((rejectPct * 100).toFixed(2)),
        emaBreakPct: Number((emaBreakPct * 100).toFixed(2)),
        hardBreakdownCount: quality.hardBreakdownCount,
        blowoffTop: quality.blowoffTop,
        volumeDistribution: quality.volumeDistribution,
        qualityTier: 'SCOUT_ONLY',
        qualityBreakdown: false,
        qualityReasons: quality.reasons,
        ema13_5m: Number(d5.ema13[last5].toFixed(10)),
        ema25_5m: Number(d5.ema25[last5].toFixed(10)),
        ema99_5m: Number(d5.ema99[last5].toFixed(10)),
        rsi5m: Number.isFinite(rsi5) ? Number(rsi5.toFixed(1)) : null,
        rsi15m: Number.isFinite(rsi15) ? Number(rsi15.toFixed(1)) : null,
        change24h,
      },
    };
  };

  if (risePct < 0.18) {
    if (risePct >= 0.12 && (dropPct >= 0.04 || rejectPct >= 0.04 || vol5x >= 4)) {
      return makeNearMiss(`NEAR: rise ${(risePct * 100).toFixed(1)}% < 18%, nhưng đã có dấu hiệu phân phối`);
    }
    return { pass: false, reason: `rise ${(risePct * 100).toFixed(1)}% < 18%` };
  }
  if (peakAge > 8) {
    if (peakAge <= 16 && dropPct >= 0.04) {
      return makeNearMiss(`NEAR: peak age ${peakAge} > 8 bars, đỉnh hơi cũ nhưng vẫn đang xả`);
    }
    return { pass: false, reason: `peak age ${peakAge} > 8 bars` };
  }
  if (dropPct < 0.08 && !earlyConfirmed) {
    if (dropPct >= 0.03 && (rejectPct >= 0.04 || redBars >= 2 || vol5x >= 4)) {
      return makeNearMiss(`NEAR: drop from peak ${(dropPct * 100).toFixed(1)}% < 8%, đang chờ gãy sâu hơn`);
    }
    return { pass: false, reason: `drop from peak ${(dropPct * 100).toFixed(1)}% < 8%` };
  }
  if (vol15x < 2.2 || vol5x < 1.8) {
    if (risePct >= 0.18 && dropPct >= 0.08) {
      return makeNearMiss(`NEAR: volume phân phối ${vol5x.toFixed(1)}x/${vol15x.toFixed(1)}x còn yếu`);
    }
    return { pass: false, reason: `distribution volume ${vol5x.toFixed(1)}x/${vol15x.toFixed(1)}x too low` };
  }
  if ((!belowEma13 || !belowEma25) && rejectPct < 0.045) {
    if (risePct >= 0.18 && dropPct >= 0.08) {
      return makeNearMiss('NEAR: chưa gãy EMA/reject đủ, chờ nến xác nhận');
    }
    return { pass: false, reason: '5m has not broken EMA/rejected enough' };
  }
  if (redBars < 2) return makeNearMiss(`NEAR: only ${redBars}/5 red bars, lực bán chưa đủ rõ`);
  if (finalScore < minScore) {
    if (score >= 35) return makeNearMiss(`NEAR: score ${score} < ${minScore}, setup yếu nhưng đáng theo dõi`);
    return { pass: false, reason: `score ${score} < ${minScore}` };
  }

  const entry = Number(snapshot.markPrice ?? snapshot.lastPrice ?? closeNow);
  if (!Number.isFinite(entry) || entry <= 0) return { pass: false, reason: 'invalid entry' };
  const targetCandidates = [
    d5.ema99[last5],
    d15.ema25[last15],
    priorLow.value,
    entry * 0.94,
  ].filter((value) => Number.isFinite(value) && value > 0 && value < entry);
  const tp1 = targetCandidates.length ? Math.max(...targetCandidates) : entry * 0.94;
  const runnerTp = Math.min(tp1, entry * 0.88);

  return {
    pass: true,
    type: 'top_reversal_short',
    subtype: 'TOP_REVERSAL',
    action: 'SHORT',
    stage: earlyConfirmed ? 'TOP_EARLY_CONFIRMED' : confirmed ? 'TOP_CONFIRMED' : 'TOP_WATCH',
    confirmed: confirmed || earlyConfirmed,
    earlyConfirmed,
    watchOnly: earlyConfirmed,
    qualityBreakdown: earlyConfirmed ? false : quality.qualityBreakdown,
    qualityDcaEligible: earlyConfirmed ? false : quality.qualityDcaEligible,
    qualityTier: earlyConfirmed ? 'EARLY_CONFIRMED' : quality.qualityTier,
    hardBreakdownCount: quality.hardBreakdownCount,
    blowoffTop: quality.blowoffTop,
    volumeDistribution: quality.volumeDistribution,
    qualityReasons: quality.reasons,
    ...strongCase,
    score: finalScore,
    grade: gradeScore(finalScore),
    entry: Number(entry.toFixed(10)),
    sl: null,
    tp: Number(tp1.toFixed(10)),
    runnerTp: Number(runnerTp.toFixed(10)),
    reason: earlyConfirmed
      ? 'Early top reversal: drop 5-8% with EMA13/25 break, red bars, reject, volume, cooled RSI, and BTC not bullish.'
      : confirmed
      ? 'Strong 15m rise formed a recent top; distribution volume expanded and 5m broke EMA13/25.'
      : 'Strong 15m rise is rolling over near a recent top; 5m sell pressure is building.',
    note: [
      `rise=${(risePct * 100).toFixed(1)}%`,
      `drop=${(dropPct * 100).toFixed(1)}%`,
      `peakAge=${peakAge}`,
      `vol5m=${vol5x.toFixed(1)}x`,
      `vol15m=${vol15x.toFixed(1)}x`,
      `redBars=${redBars}/5`,
      `reject=${(rejectPct * 100).toFixed(1)}%`,
      `emaBreak=${(emaBreakPct * 100).toFixed(1)}%`,
      quality.qualityBreakdown ? `qualityDca=${quality.reasons.join('+')}` : 'qualityDca=NO',
      `qualityTier=${earlyConfirmed ? 'EARLY_CONFIRMED' : quality.qualityTier}`,
      strongCase.strongCase ? `strongCase=${strongCase.strongCaseType}:${strongCase.strongCaseScore}` : null,
      earlyConfirmed ? `btcBullBias=${btcBullBias}` : null,
      earlyConfirmed ? 'paper=EARLY_SCOUT' : null,
    ].join(' | '),
    factors: {
      risePct: Number((risePct * 100).toFixed(2)),
      dropFromPeakPct: Number((dropPct * 100).toFixed(2)),
      peakAge15m: peakAge,
      peakPrice: Number(peak.value.toFixed(10)),
      priorLow: Number(priorLow.value.toFixed(10)),
      vol5mX: Number(vol5x.toFixed(2)),
      vol15mX: Number(vol15x.toFixed(2)),
      redBars5m: redBars,
      rejectPct: Number((rejectPct * 100).toFixed(2)),
      emaBreakPct: Number((emaBreakPct * 100).toFixed(2)),
      earlyConfirmed,
      btcBullBias,
      hardBreakdownCount: quality.hardBreakdownCount,
      blowoffTop: quality.blowoffTop,
      volumeDistribution: quality.volumeDistribution,
      qualityTier: earlyConfirmed ? 'EARLY_CONFIRMED' : quality.qualityTier,
      qualityBreakdown: earlyConfirmed ? false : quality.qualityBreakdown,
      qualityDcaEligible: earlyConfirmed ? false : quality.qualityDcaEligible,
      qualityReasons: quality.reasons,
      ...strongCase,
      ema13_5m: Number(d5.ema13[last5].toFixed(10)),
      ema25_5m: Number(d5.ema25[last5].toFixed(10)),
      ema99_5m: Number(d5.ema99[last5].toFixed(10)),
      rsi5m: Number.isFinite(rsi5) ? Number(rsi5.toFixed(1)) : null,
      rsi15m: Number.isFinite(rsi15) ? Number(rsi15.toFixed(1)) : null,
      change24h,
    },
  };
}

export async function runTopReversalScan(symbols, klineCache, snapshotMap = new Map(), opts = {}) {
  const maxSymbols = Number(opts.maxSymbols ?? process.env.TOP_REVERSAL_MAX_SYMBOLS ?? 400);
  const signals = [];
  const nearMisses = [];
  const failures = new Map();
  let processed = 0;

  for (const symbol of symbols.slice(0, maxSymbols)) {
    const candles5m = klineCache.getIfCached(symbol, '5m', 130);
    const candles15m = klineCache.getIfCached(symbol, '15m', 130);
    if (!candles5m || candles5m.length < 125 || !candles15m || candles15m.length < 125) continue;
    processed++;
    const snapshot = snapshotMap.get(symbol) ?? {};
    const result = detectTopReversal(candles5m, candles15m, snapshot, opts);
    if (!result.pass) {
      if (result.nearMiss) {
        nearMisses.push({
          symbol,
          ...result,
          markPrice: Number(snapshot.markPrice ?? snapshot.lastPrice ?? result.entry),
          change24h: Number(snapshot.change24hPct ?? snapshot.priceChangePercent ?? 0),
          volume: Number(snapshot.quoteVolume ?? 0),
          scannedAt: Date.now(),
        });
      }
      const reason = String(result.reason ?? 'unknown')
        .replace(/\d+(?:\.\d+)?%/g, 'N%')
        .replace(/\d+(?:\.\d+)?x/g, 'Nx');
      failures.set(reason, (failures.get(reason) ?? 0) + 1);
      continue;
    }
    signals.push({
      symbol,
      ...result,
      markPrice: Number(snapshot.markPrice ?? snapshot.lastPrice ?? result.entry),
      change24h: Number(snapshot.change24hPct ?? snapshot.priceChangePercent ?? 0),
      volume: Number(snapshot.quoteVolume ?? 0),
      scannedAt: Date.now(),
    });
  }

  signals.sort((a, b) => b.score - a.score || b.factors.risePct - a.factors.risePct);
  nearMisses.sort((a, b) => b.score - a.score || b.factors.risePct - a.factors.risePct);
  return {
    signals,
    nearMisses: nearMisses.slice(0, Number(process.env.TOP_REVERSAL_NEAR_MISS_LIMIT ?? 30)),
    processed,
    diagnostics: {
      topFailures: [...failures.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([reason, count]) => ({ reason, count })),
    },
  };
}
