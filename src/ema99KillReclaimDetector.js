// ── EMA99 Kill Reclaim Detector ──────────────────────────────────────────────
// LONG: coin đã bơm, bị kill xuống quanh EMA99 trên 5m rồi reclaim để đi tiếp.
// SHORT: đối xứng, coin đã dump, wick lên quanh EMA99 rồi reject để rơi tiếp.

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
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
  for (let i = 1; i < values.length; i++) out[i] = alpha * values[i] + (1 - alpha) * out[i - 1];
  return out;
}

function calcRsi(values, period = 14, end = values.length - 1) {
  if (end < period + 1) return NaN;
  let gain = 0;
  let loss = 0;
  for (let i = end - period + 1; i <= end; i++) {
    const d = values[i] - values[i - 1];
    if (d > 0) gain += d;
    else loss -= d;
  }
  const rs = gain / Math.max(1e-9, loss);
  return 100 - 100 / (1 + rs);
}

function sma(values, period, end) {
  if (end < 0) return NaN;
  const start = Math.max(0, end - period + 1);
  let sum = 0;
  let count = 0;
  for (let i = start; i <= end; i++) {
    sum += Number(values[i] ?? 0);
    count++;
  }
  return count ? sum / count : NaN;
}

function atrAt(highs, lows, closes, period, end) {
  if (end < 1) return NaN;
  const start = Math.max(1, end - period + 1);
  let sum = 0;
  let count = 0;
  for (let i = start; i <= end; i++) {
    sum += Math.max(highs[i] - lows[i], Math.abs(highs[i] - closes[i - 1]), Math.abs(lows[i] - closes[i - 1]));
    count++;
  }
  return count ? sum / count : NaN;
}

function extrema(values, start, end, mode) {
  let idx = start;
  let val = mode === 'max' ? -Infinity : Infinity;
  for (let i = start; i <= end; i++) {
    if (mode === 'max' ? values[i] > val : values[i] < val) {
      val = values[i];
      idx = i;
    }
  }
  return { idx, val };
}

function scoreLong(meta, C) {
  return Math.round(100 * (
    clamp01((meta.contextMovePct - C.contextMinPct) / 0.22) * 0.16 +
    clamp01((C.emaTouchPct - meta.killDistPct) / C.emaTouchPct) * 0.16 +
    clamp01((meta.wickReject - C.minWickReject) / 0.55) * 0.16 +
    clamp01((meta.reclaimPct - C.reclaimMinPct) / 0.05) * 0.18 +
    clamp01((meta.volRatio - C.minVolRatio) / 3.5) * 0.14 +
    clamp01((C.maxKillAgeBars - meta.killAge) / C.maxKillAgeBars) * 0.10 +
    clamp01((meta.rsi14 - 45) / 35) * 0.10
  ));
}

function scoreShort(meta, C) {
  return Math.round(100 * (
    clamp01((meta.contextMovePct - C.contextMinPct) / 0.22) * 0.16 +
    clamp01((C.emaTouchPct - meta.killDistPct) / C.emaTouchPct) * 0.16 +
    clamp01((meta.wickReject - C.minWickReject) / 0.55) * 0.16 +
    clamp01((meta.reclaimPct - C.reclaimMinPct) / 0.05) * 0.18 +
    clamp01((meta.volRatio - C.minVolRatio) / 3.5) * 0.14 +
    clamp01((C.maxKillAgeBars - meta.killAge) / C.maxKillAgeBars) * 0.10 +
    clamp01((55 - meta.rsi14) / 35) * 0.10
  ));
}

export function detectEma99KillReclaim(candles, state = {}, opts = {}) {
  const C = {
    side: 'LONG',
    interval: '5m',
    emaFast1: 13,
    emaFast2: 25,
    emaSlow: 99,
    lookback: 120,
    contextMinPct: 0.10,
    maxKillAgeBars: 8,
    emaTouchPct: 0.018,
    reclaimMinPct: 0.004,
    minWickReject: 0.28,
    minVolRatio: 1.15,
    minScore: 55,
    slBufferAtr: 0.35,
    tpRMultiple: 2.2,
    ...opts,
  };
  C.side = String(C.side || 'LONG').toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG';
  const isShort = C.side === 'SHORT';

  const n = candles?.length ?? 0;
  if (!Array.isArray(candles) || n < C.emaSlow + 30) return { pass: false, reason: `not enough candles (${n})` };

  const O = candles.map((k) => Number(k.open));
  const H = candles.map((k) => Number(k.high));
  const L = candles.map((k) => Number(k.low));
  const Cl = candles.map((k) => Number(k.close));
  const V = candles.map((k) => Number(k.volume));
  const ema13 = emaSeries(Cl, C.emaFast1);
  const ema25 = emaSeries(Cl, C.emaFast2);
  const ema99 = emaSeries(Cl, C.emaSlow);

  const lastIdx = Math.max(0, n - 2); // nến cuối thường đang chạy, dùng nến đã đóng
  const start = Math.max(C.emaSlow + 1, lastIdx - C.lookback);
  const killStart = Math.max(start + 20, lastIdx - C.maxKillAgeBars);
  const rsi14 = Number.isFinite(state.rsi14) ? Number(state.rsi14) : calcRsi(Cl, 14, lastIdx);
  const atr = atrAt(H, L, Cl, 14, lastIdx);
  if (!Number.isFinite(atr) || atr <= 0) return { pass: false, reason: 'ATR invalid' };

  const beforeKillEnd = Math.max(start + 5, killStart - 1);
  const trendHigh = extrema(H, start, beforeKillEnd, 'max');
  const trendLow = extrema(L, start, beforeKillEnd, 'min');
  const contextMovePct = isShort
    ? (trendHigh.val - trendLow.val) / Math.max(trendHigh.val, 1e-9)
    : (trendHigh.val - trendLow.val) / Math.max(trendLow.val, 1e-9);
  if (contextMovePct < C.contextMinPct) {
    return { pass: false, reason: `${isShort ? 'dump' : 'pump'} context too small (${(contextMovePct * 100).toFixed(1)}%)` };
  }
  if (!isShort && trendHigh.idx <= trendLow.idx) return { pass: false, reason: 'no pump before EMA99 kill' };
  if (isShort && trendLow.idx <= trendHigh.idx) return { pass: false, reason: 'no dump before EMA99 reject' };

  let best = null;
  for (let i = killStart; i <= lastIdx; i++) {
    const e99 = ema99[i];
    if (!Number.isFinite(e99) || e99 <= 0) continue;
    const range = H[i] - L[i];
    if (range <= 0) continue;
    const dist = isShort
      ? Math.abs(H[i] - e99) / e99
      : Math.abs(L[i] - e99) / e99;
    const crossed = isShort
      ? H[i] >= e99 * (1 - C.emaTouchPct) && L[i] <= e99 * (1 + C.emaTouchPct)
      : L[i] <= e99 * (1 + C.emaTouchPct) && H[i] >= e99 * (1 - C.emaTouchPct);
    if (!crossed || dist > C.emaTouchPct * 1.6) continue;

    const wickReject = isShort
      ? (H[i] - Math.max(O[i], Cl[i])) / range
      : (Math.min(O[i], Cl[i]) - L[i]) / range;
    if (wickReject < C.minWickReject) continue;

    const avgVol = sma(V, 20, i - 1);
    const volRatio = Number.isFinite(avgVol) && avgVol > 0 ? V[i] / avgVol : 0;
    if (volRatio < C.minVolRatio) continue;

    const age = lastIdx - i;
    const afterHigh = Math.max(...H.slice(i, lastIdx + 1));
    const afterLow = Math.min(...L.slice(i, lastIdx + 1));
    const reclaimPct = isShort
      ? (e99 - afterLow) / Math.max(e99, 1e-9)
      : (afterHigh - e99) / Math.max(e99, 1e-9);
    const fastOk = isShort
      ? Cl[lastIdx] < Math.min(ema13[lastIdx], ema25[lastIdx], e99)
      : Cl[lastIdx] > Math.max(ema13[lastIdx], ema25[lastIdx], e99);
    const impulseOk = isShort
      ? Cl[lastIdx] < O[lastIdx] || Cl[lastIdx] < Cl[Math.max(i, lastIdx - 1)]
      : Cl[lastIdx] > O[lastIdx] || Cl[lastIdx] > Cl[Math.max(i, lastIdx - 1)];
    if (reclaimPct < C.reclaimMinPct || (!fastOk && !impulseOk)) continue;

    const meta = {
      killIdx: i,
      killAge: age,
      killPrice: isShort ? H[i] : L[i],
      killDistPct: dist,
      wickReject,
      volRatio,
      reclaimPct,
      contextMovePct,
      rsi14: Number.isFinite(rsi14) ? rsi14 : 50,
      fastOk,
      impulseOk,
    };
    const score = isShort ? scoreShort(meta, C) : scoreLong(meta, C);
    if (!best || score > best.score) best = { ...meta, score };
  }

  if (!best) return { pass: false, reason: `no EMA99 ${isShort ? 'reject' : 'reclaim'} kill` };
  if (best.score < C.minScore) return { pass: false, reason: `score too low (${best.score})` };

  const entry = Cl[lastIdx];
  const sl = isShort
    ? best.killPrice + C.slBufferAtr * atr
    : best.killPrice - C.slBufferAtr * atr;
  const risk = Math.abs(entry - sl);
  const tp = isShort
    ? entry - risk * C.tpRMultiple
    : entry + risk * C.tpRMultiple;
  const score = Math.max(0, Math.min(100, best.score));
  const stage = isShort ? 'EMA99_REJECT_SHORT' : 'EMA99_RECLAIM_LONG';

  return {
    pass: true,
    type: isShort ? 'ema99_kill_reject_short' : 'ema99_kill_reclaim_long',
    stage,
    action: isShort ? 'SHORT' : 'LONG',
    interval: C.interval,
    score,
    grade: gradeScore(score),
    entry: Number(entry.toFixed(10)),
    sl: Number(sl.toFixed(10)),
    tp: Number(tp.toFixed(10)),
    ema13: Number(ema13[lastIdx].toFixed(10)),
    ema25: Number(ema25[lastIdx].toFixed(10)),
    ema99: Number(ema99[lastIdx].toFixed(10)),
    rsi14: Number.isFinite(rsi14) ? Number(rsi14.toFixed(1)) : null,
    reason: isShort
      ? 'Dump mạnh rồi wick lên EMA99 để kill long, sau đó reject xuống tiếp'
      : 'Pump mạnh rồi rũ xuống EMA99 để kill long yếu, sau đó reclaim bật tiếp',
    note: [
      `${C.interval}`,
      `context=${(best.contextMovePct * 100).toFixed(1)}%`,
      `killAge=${best.killAge}`,
      `ema99Dist=${(best.killDistPct * 100).toFixed(2)}%`,
      `wick=${(best.wickReject * 100).toFixed(0)}%`,
      `reclaim=${(best.reclaimPct * 100).toFixed(1)}%`,
      `vol=${best.volRatio.toFixed(1)}x`,
    ].join(' | '),
    factors: {
      contextMovePct: Number((best.contextMovePct * 100).toFixed(2)),
      killAgeBars: best.killAge,
      killPrice: Number(best.killPrice.toFixed(10)),
      ema99DistPct: Number((best.killDistPct * 100).toFixed(3)),
      wickRejectPct: Number((best.wickReject * 100).toFixed(1)),
      reclaimPct: Number((best.reclaimPct * 100).toFixed(2)),
      volRatio: Number(best.volRatio.toFixed(2)),
      rsi14: Number.isFinite(rsi14) ? Number(rsi14.toFixed(1)) : null,
      fastOk: best.fastOk,
      impulseOk: best.impulseOk,
    },
  };
}

export async function runEma99KillReclaimScan(symbols, klineCache, snapshotMap = new Map(), opts = {}) {
  const interval = opts.interval || '5m';
  const limit = Number(opts.limit ?? 180);
  const maxSymbols = Number(opts.maxSymbols ?? process.env.EMA99_KILL_RECLAIM_MAX_SYMBOLS ?? 400);
  const minScore = Number(opts.minScore ?? process.env.EMA99_KILL_RECLAIM_MIN_SCORE ?? 55);
  const list = symbols.slice(0, maxSymbols);
  const signals = [];
  let processed = 0;

  for (const symbol of list) {
    const candles = klineCache.getIfCached(symbol, interval, limit);
    if (!candles || candles.length < 130) continue;
    processed++;
    for (const side of ['LONG', 'SHORT']) {
      const det = detectEma99KillReclaim(candles, {}, { ...opts, side, interval, minScore });
      if (!det.pass) continue;
      const snap = snapshotMap.get(symbol) || {};
      signals.push({
        symbol,
        ...det,
        markPrice: Number(snap.markPrice ?? candles[candles.length - 1]?.close ?? det.entry),
        change24h: Number(snap.change24hPct ?? snap.priceChangePercent ?? 0),
        volume: Number(snap.quoteVolume ?? 0),
        scannedAt: Date.now(),
      });
    }
  }

  signals.sort((a, b) => b.score - a.score || Math.abs(b.change24h ?? 0) - Math.abs(a.change24h ?? 0));
  return { signals, processed };
}
