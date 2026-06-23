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

  if (risePct < 0.18) return { pass: false, reason: `rise ${(risePct * 100).toFixed(1)}% < 18%` };
  if (peakAge > 8) return { pass: false, reason: `peak age ${peakAge} > 8 bars` };
  if (dropPct < 0.08) return { pass: false, reason: `drop from peak ${(dropPct * 100).toFixed(1)}% < 8%` };
  if (vol15x < 2.2 || vol5x < 1.8) {
    return { pass: false, reason: `distribution volume ${vol5x.toFixed(1)}x/${vol15x.toFixed(1)}x too low` };
  }
  if ((!belowEma13 || !belowEma25) && rejectPct < 0.045) {
    return { pass: false, reason: '5m has not broken EMA/rejected enough' };
  }
  if (redBars < 2) return { pass: false, reason: `only ${redBars}/5 red bars` };

  const confirmed = belowEma13 && belowEma25 && redBars >= 3 && dropPct >= 0.10;
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
  if (score < minScore) return { pass: false, reason: `score ${score} < ${minScore}` };

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
    stage: confirmed ? 'TOP_CONFIRMED' : 'TOP_WATCH',
    confirmed,
    score,
    grade: gradeScore(score),
    entry: Number(entry.toFixed(10)),
    sl: null,
    tp: Number(tp1.toFixed(10)),
    runnerTp: Number(runnerTp.toFixed(10)),
    reason: confirmed
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
  const failures = new Map();
  let processed = 0;

  for (const symbol of symbols.slice(0, maxSymbols)) {
    const candles5m = klineCache.getIfCached(symbol, '5m', 180);
    const candles15m = klineCache.getIfCached(symbol, '15m', 180);
    if (!candles5m || candles5m.length < 125 || !candles15m || candles15m.length < 125) continue;
    processed++;
    const snapshot = snapshotMap.get(symbol) ?? {};
    const result = detectTopReversal(candles5m, candles15m, snapshot, opts);
    if (!result.pass) {
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
  return {
    signals,
    processed,
    diagnostics: {
      topFailures: [...failures.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 12)
        .map(([reason, count]) => ({ reason, count })),
    },
  };
}
