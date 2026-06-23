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

function prep(candles) {
  const O = candles.map((k) => Number(k.open));
  const H = candles.map((k) => Number(k.high));
  const L = candles.map((k) => Number(k.low));
  const C = candles.map((k) => Number(k.close));
  const V = candles.map((k) => Number(k.volume));
  return {
    O, H, L, C, V,
    ema13: emaSeries(C, 13),
    ema25: emaSeries(C, 25),
    ema99: emaSeries(C, 99),
  };
}

function closeReturns(candles, bars) {
  if (!Array.isArray(candles) || candles.length < bars + 2) return [];
  const end = candles.length - 2;
  const start = Math.max(1, end - bars + 1);
  const out = [];
  for (let i = start; i <= end; i++) {
    const prev = Number(candles[i - 1]?.close);
    const current = Number(candles[i]?.close);
    if (!Number.isFinite(prev) || !Number.isFinite(current) || prev <= 0) return [];
    out.push((current - prev) / prev);
  }
  return out;
}

function pearson(xs, ys) {
  const n = Math.min(xs.length, ys.length);
  if (n < 8) return null;
  const x = xs.slice(-n);
  const y = ys.slice(-n);
  const mx = x.reduce((sum, value) => sum + value, 0) / n;
  const my = y.reduce((sum, value) => sum + value, 0) / n;
  let covariance = 0;
  let xVariance = 0;
  let yVariance = 0;
  for (let i = 0; i < n; i++) {
    const dx = x[i] - mx;
    const dy = y[i] - my;
    covariance += dx * dy;
    xVariance += dx * dx;
    yVariance += dy * dy;
  }
  const denominator = Math.sqrt(xVariance * yVariance);
  return denominator > 1e-12 ? covariance / denominator : null;
}

function computeBtcRelation(coinCandles, btcCandles, bars = 30) {
  const coinReturns = closeReturns(coinCandles, bars);
  const btcReturns = closeReturns(btcCandles, bars);
  const n = Math.min(coinReturns.length, btcReturns.length);
  if (n < 8) return null;
  const coin = coinReturns.slice(-n);
  const btc = btcReturns.slice(-n);
  const corr = pearson(coin, btc);
  const coinMean = coin.reduce((sum, value) => sum + value, 0) / n;
  const btcMean = btc.reduce((sum, value) => sum + value, 0) / n;
  let covariance = 0;
  let btcVariance = 0;
  for (let i = 0; i < n; i++) {
    covariance += (coin[i] - coinMean) * (btc[i] - btcMean);
    btcVariance += (btc[i] - btcMean) ** 2;
  }
  const beta = btcVariance > 1e-12 ? covariance / btcVariance : null;
  const coinMovePct = coinCandles.length > n
    ? (Number(coinCandles[coinCandles.length - 2].close)
      / Number(coinCandles[coinCandles.length - n - 2].close) - 1) * 100
    : null;
  const btcMovePct = btcCandles.length > n
    ? (Number(btcCandles[btcCandles.length - 2].close)
      / Number(btcCandles[btcCandles.length - n - 2].close) - 1) * 100
    : null;
  const opposed = Number.isFinite(coinMovePct) && Number.isFinite(btcMovePct)
    && Math.abs(coinMovePct) >= 0.3
    && Math.abs(btcMovePct) >= 0.15
    && Math.sign(coinMovePct) !== Math.sign(btcMovePct);
  return {
    corr: corr == null ? null : Number(corr.toFixed(2)),
    beta: beta == null ? null : Number(beta.toFixed(2)),
    coinMovePct: Number.isFinite(coinMovePct) ? Number(coinMovePct.toFixed(2)) : null,
    btcMovePct: Number.isFinite(btcMovePct) ? Number(btcMovePct.toFixed(2)) : null,
    opposed,
    bars: n,
  };
}

function conflictStrength(signal) {
  const f = signal?.factors ?? {};
  return Number(signal?.score ?? 0)
    + (signal?.stage === 'RECLAIM_CONFIRMED' ? 5 : 0)
    + Math.min(Number(f.reclaimPct ?? 0), 12) * 0.35
    + Math.min(Number(f.vol5mX ?? 0), 20) * 0.15
    - Math.min(Number(f.pullbackAge5m ?? 0), 20) * 0.35;
}

function resolveOppositeSideConflicts(signals, opts = {}) {
  const minDiff = Number(opts.conflictMinDiff ?? process.env.SHAKEOUT_RECLAIM_CONFLICT_MIN_DIFF ?? 8);
  const bySymbol = new Map();
  for (const sig of signals) {
    if (!bySymbol.has(sig.symbol)) bySymbol.set(sig.symbol, []);
    bySymbol.get(sig.symbol).push(sig);
  }

  const resolved = [];
  for (const group of bySymbol.values()) {
    const hasLong = group.some((s) => s.action === 'LONG');
    const hasShort = group.some((s) => s.action === 'SHORT');
    if (!hasLong || !hasShort) {
      resolved.push(...group);
      continue;
    }

    const ranked = group
      .map((sig) => ({ sig, strength: conflictStrength(sig) }))
      .sort((a, b) => b.strength - a.strength);
    const best = ranked[0];
    const opposite = ranked.find((row) => row.sig.action !== best.sig.action);
    if (!opposite || best.strength - opposite.strength >= minDiff) {
      resolved.push({
        ...best.sig,
        conflictResolved: true,
        conflictStrength: Number(best.strength.toFixed(2)),
      });
    }
  }
  return resolved;
}

function assessTrapRisk({ side, m5, m15 }) {
  const isShort = String(side ?? 'LONG').toUpperCase() === 'SHORT';
  const reasons = [];
  let penalty = 0;

  if (!isShort) {
    if (m15.movePct >= 0.35 && m5.retracePct >= 0.28) {
      reasons.push('15m pump quá mạnh nhưng 5m đã trả lại nhiều, dễ thành phân phối');
      penalty += 10;
    }
    if (m5.pullbackAge >= 12 && m5.reclaimPct < 0.05) {
      reasons.push('reclaim chậm/yếu sau nhiều nến pullback');
      penalty += 8;
    }
    if (m5.dropPct >= 0.07 && m5.wickRejectPct < 0.35) {
      reasons.push('cú rũ sâu nhưng wick đỡ yếu, lực bán còn chủ động');
      penalty += 7;
    }
    if (m5.rsi14 >= 68 && m15.rsi14 >= 68 && m5.reclaimPct < 0.07) {
      reasons.push('RSI 5m/15m nóng, reclaim không đủ mạnh');
      penalty += 6;
    }
  } else {
    if (m15.movePct >= 0.35 && m5.retracePct >= 0.28) {
      reasons.push('15m dump quá mạnh nhưng 5m hồi sâu, dễ thành short trap');
      penalty += 10;
    }
    if (m5.pullbackAge >= 12 && m5.reclaimPct < 0.05) {
      reasons.push('reject chậm/yếu sau nhiều nến pullback');
      penalty += 8;
    }
    if (m5.dropPct >= 0.07 && m5.wickRejectPct < 0.35) {
      reasons.push('cú kéo giết short sâu nhưng wick từ chối yếu');
      penalty += 7;
    }
    if (m5.rsi14 <= 32 && m15.rsi14 <= 32 && m5.reclaimPct < 0.07) {
      reasons.push('RSI 5m/15m quá lạnh, reject không đủ mạnh');
      penalty += 6;
    }
  }

  return {
    risk: penalty >= 10 ? 'HIGH' : penalty >= 6 ? 'MEDIUM' : 'LOW',
    penalty,
    reasons,
  };
}

function analyzeInterval(candles, opts = {}) {
  const cfg = {
    side: 'LONG',
    lookback: 72,
    maxHighAge: 18,
    minMovePct: 0.08,
    minDropPct: 0.035,
    minVolRatio: 1.8,
    maxMaDistPct: 0.055,
    ...opts,
  };
  if (!Array.isArray(candles) || candles.length < 120) return { pass: false, reason: 'not enough candles' };
  const d = prep(candles);
  const n = candles.length;
  const last = n - 2;
  const start = Math.max(99, last - cfg.lookback);
  const recentStart = Math.max(start + 8, last - cfg.maxHighAge);
  const isShort = String(cfg.side ?? 'LONG').toUpperCase() === 'SHORT';
  const high = isShort ? extrema(d.H, start, last, 'max') : extrema(d.H, recentStart, last, 'max');
  const low = isShort ? extrema(d.L, recentStart, last, 'min') : null;
  const lowBefore = isShort ? null : extrema(d.L, start, Math.max(start, high.idx - 1), 'min');
  const highBefore = isShort ? extrema(d.H, start, Math.max(start, low.idx - 1), 'max') : null;
  if (!isShort && high.idx <= lowBefore.idx) return { pass: false, reason: 'no pump impulse before pullback' };
  if (isShort && low.idx <= highBefore.idx) return { pass: false, reason: 'no dump impulse before pullback' };

  const movePct = isShort
    ? (highBefore.val - low.val) / Math.max(highBefore.val, 1e-9)
    : (high.val - lowBefore.val) / Math.max(lowBefore.val, 1e-9);
  if (movePct < cfg.minMovePct) return { pass: false, reason: `${isShort ? 'dump' : 'pump'} impulse ${(movePct * 100).toFixed(1)}% too small` };

  const afterLow = isShort ? null : extrema(d.L, high.idx, last, 'min');
  const afterHigh = isShort ? extrema(d.H, low.idx, last, 'max') : null;
  const dropPct = isShort
    ? (afterHigh.val - low.val) / Math.max(low.val, 1e-9)
    : (high.val - afterLow.val) / Math.max(high.val, 1e-9);
  if (dropPct < cfg.minDropPct) return { pass: false, reason: `${isShort ? 'short-kill bounce' : 'shakeout drop'} ${(dropPct * 100).toFixed(1)}% too small` };

  const impulseIdx = isShort ? low.idx : high.idx;
  const pullIdx = isShort ? afterHigh.idx : afterLow.idx;
  const pullPrice = isShort ? afterHigh.val : afterLow.val;
  const avgVolBefore = sma(d.V, 24, Math.max(start, impulseIdx - 1));
  const highVol = Math.max(...d.V.slice(Math.max(start, impulseIdx - 8), impulseIdx + 1));
  const pullVol = Math.max(...d.V.slice(Math.max(impulseIdx, last - 6), last + 1));
  const volRatio = avgVolBefore > 0 ? highVol / avgVolBefore : 0;
  const pullVolRatio = avgVolBefore > 0 ? pullVol / avgVolBefore : 0;
  if (volRatio < cfg.minVolRatio && pullVolRatio < cfg.minVolRatio) {
    return { pass: false, reason: `volume ${Math.max(volRatio, pullVolRatio).toFixed(1)}x too low` };
  }

  const maValues = [d.ema13[pullIdx], d.ema25[pullIdx], d.ema99[pullIdx]].filter((v) => Number.isFinite(v) && v > 0);
  const maDistPct = Math.min(...maValues.map((v) => Math.abs(pullPrice - v) / v));
  if (!Number.isFinite(maDistPct) || maDistPct > cfg.maxMaDistPct) {
    return { pass: false, reason: `pullback far from EMA (${(maDistPct * 100).toFixed(1)}%)` };
  }

  const atr = atrAt(d.H, d.L, d.C, 14, last);
  const rsi14 = calcRsi(d.C, 14, last);
  const reclaimPct = isShort
    ? (afterHigh.val - d.C[last]) / Math.max(afterHigh.val, 1e-9)
    : (d.C[last] - afterLow.val) / Math.max(afterLow.val, 1e-9);
  const lastGreen = d.C[last] > d.O[last];
  const lastRed = d.C[last] < d.O[last];
  const closeAboveEma25 = d.C[last] > d.ema25[last];
  const closeAboveEma13 = d.C[last] > d.ema13[last];
  const closeBelowEma25 = d.C[last] < d.ema25[last];
  const closeBelowEma13 = d.C[last] < d.ema13[last];
  const reclaimConfirmed = isShort
    ? reclaimPct >= 0.018 || closeBelowEma13 || (closeBelowEma25 && lastRed)
    : reclaimPct >= 0.018 || closeAboveEma13 || (closeAboveEma25 && lastGreen);
  const pullbackAge = last - pullIdx;
  const retracePct = dropPct / Math.max(movePct, 1e-9);
  const wickRejectPct = isShort
    ? (d.H[pullIdx] - Math.max(d.O[pullIdx], d.C[pullIdx])) / Math.max(d.H[pullIdx] - d.L[pullIdx], 1e-9)
    : (Math.min(d.O[pullIdx], d.C[pullIdx]) - d.L[pullIdx]) / Math.max(d.H[pullIdx] - d.L[pullIdx], 1e-9);

  return {
    pass: true,
    interval: cfg.interval || '5m',
    movePct,
    dropPct,
    retracePct,
    volRatio,
    pullVolRatio,
    maDistPct,
    reclaimPct,
    reclaimConfirmed,
    pullbackAge,
    wickRejectPct,
    rsi14,
    atr,
    highPrice: isShort ? highBefore.val : high.val,
    lowPrice: isShort ? low.val : lowBefore.val,
    pullLow: isShort ? low.val : afterLow.val,
    pullHigh: isShort ? afterHigh.val : high.val,
    close: d.C[last],
    ema13: d.ema13[last],
    ema25: d.ema25[last],
    ema99: d.ema99[last],
  };
}

function assessBottomRebound(candles15m, m5, m15, snapshot = {}) {
  if (!Array.isArray(candles15m) || candles15m.length < 80) return { pass: false };
  const d = prep(candles15m);
  const last = candles15m.length - 2;
  const recentStart = Math.max(1, last - 16);
  const low = extrema(d.L, recentStart, last, 'min');
  const priorStart = Math.max(1, low.idx - 64);
  const priorEnd = Math.max(priorStart, low.idx - 4);
  const priorHigh = extrema(d.H, priorStart, priorEnd, 'max');
  const declinePct = (priorHigh.val - low.val) / Math.max(priorHigh.val, 1e-9);
  const reboundPct = (d.C[last] - low.val) / Math.max(low.val, 1e-9);
  const lowAge = last - low.idx;
  const change24h = Number(snapshot.change24hPct ?? snapshot.priceChangePercent ?? 0);
  const vol5mX = Math.max(m5.volRatio, m5.pullVolRatio);
  const vol15mX = Math.max(m15.volRatio, m15.pullVolRatio);
  const structuralPass = declinePct >= 0.18
    && reboundPct >= 0.08
    && reboundPct <= 0.45
    && lowAge <= 8
    && vol5mX >= 3
    && vol15mX >= 3
    && m5.reclaimConfirmed
    && (change24h <= -8 || declinePct >= 0.28);
  const snapshotPass = change24h <= -12
    && m5.movePct >= 0.10
    && m15.movePct >= 0.10
    && vol5mX >= 5
    && vol15mX >= 5
    && m5.reclaimConfirmed;
  const pass = structuralPass || snapshotPass;
  return {
    pass,
    declinePct: Math.max(declinePct, change24h < 0 ? Math.abs(change24h) / 100 : 0),
    reboundPct: Math.max(reboundPct, m5.movePct),
    lowAge,
    lowPrice: low.val,
    priorHigh: priorHigh.val,
  };
}

export function detectShakeoutReclaim(candles5m, candles15m, snapshot = {}, opts = {}) {
  const minScore = Number(opts.minScore ?? process.env.SHAKEOUT_RECLAIM_MIN_SCORE ?? 55);
  const side = String(opts.side ?? 'LONG').toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG';
  const isShort = side === 'SHORT';
  const m5 = analyzeInterval(candles5m, { side, interval: '5m', minMovePct: 0.08, minDropPct: 0.035, minVolRatio: 1.7, maxMaDistPct: 0.06 });
  if (!m5.pass) return { pass: false, reason: `5m: ${m5.reason}` };
  const m15 = analyzeInterval(candles15m, { side, interval: '15m', lookback: 64, maxHighAge: 12, minMovePct: 0.10, minDropPct: 0.025, minVolRatio: 1.45, maxMaDistPct: 0.075 });
  if (!m15.pass) return { pass: false, reason: `15m: ${m15.reason}` };

  const confirmed = m5.reclaimConfirmed || m15.reclaimConfirmed;
  const rawScore = Math.round(100 * (
    clamp01((m5.movePct - 0.08) / 0.28) * 0.16 +
    clamp01((m15.movePct - 0.10) / 0.35) * 0.15 +
    clamp01((m5.dropPct - 0.035) / 0.13) * 0.14 +
    clamp01((0.78 - m5.retracePct) / 0.55) * 0.08 +
    clamp01((Math.max(m5.volRatio, m5.pullVolRatio) - 1.7) / 5.5) * 0.14 +
    clamp01((Math.max(m15.volRatio, m15.pullVolRatio) - 1.45) / 4.5) * 0.12 +
    clamp01((0.06 - m5.maDistPct) / 0.06) * 0.10 +
    clamp01((m5.reclaimPct - 0.004) / 0.05) * 0.07 +
    (confirmed ? 0.04 : 0)
  ));
  const trap = assessTrapRisk({ side, m5, m15 });
  const bottomRebound = !isShort
    ? assessBottomRebound(candles15m, m5, m15, snapshot)
    : { pass: false };
  const bottomRiskReasons = [];
  if (bottomRebound.pass) {
    const reclaimPct = m5.reclaimPct * 100;
    const reboundPct = bottomRebound.reboundPct * 100;
    const minReclaimPct = Number(process.env.SHAKEOUT_BOTTOM_RISK_MIN_RECLAIM_PCT ?? 3);
    const hotRsiThreshold = Number(process.env.SHAKEOUT_BOTTOM_RISK_HOT_RSI ?? 68);
    const minFailedReboundPct = Number(process.env.SHAKEOUT_BOTTOM_RISK_MIN_FAILED_REBOUND_PCT ?? 20);
    const hotRsi = Number(m5.rsi14) >= hotRsiThreshold && Number(m15.rsi14) >= hotRsiThreshold;
    const holdsFastEma = m5.close >= m5.ema13 && m5.close >= m5.ema25;
    if (trap.risk === 'HIGH') bottomRiskReasons.push('trapRisk HIGH');
    if (reclaimPct < minReclaimPct && hotRsi) {
      bottomRiskReasons.push(`reclaim ${reclaimPct.toFixed(1)}% weak while RSI is hot`);
    }
    if (reboundPct >= minFailedReboundPct && !holdsFastEma) {
      bottomRiskReasons.push(`rebound ${reboundPct.toFixed(1)}% failed to hold EMA13/25`);
    }
  }
  const bottomReboundRisk = bottomRebound.pass && bottomRiskReasons.length > 0;
  const bottomReboundQualified = bottomRebound.pass && !bottomReboundRisk;
  const score = Math.max(0, rawScore - trap.penalty);
  if (score < minScore) return { pass: false, reason: `score too low (${score})` };

  const markEntry = Number(snapshot.markPrice ?? snapshot.lastPrice ?? m5.close);
  const maxEntryCloseDivergence = Number(opts.maxEntryCloseDivergence ?? process.env.SHAKEOUT_RECLAIM_MAX_ENTRY_CLOSE_DIVERGENCE ?? 0.08);
  const markCloseDivergence = Math.abs(markEntry - m5.close) / Math.max(m5.close, 1e-9);
  if (!Number.isFinite(markEntry) || markEntry <= 0 || markCloseDivergence > maxEntryCloseDivergence) {
    return { pass: false, reason: `entry/close mismatch ${(markCloseDivergence * 100).toFixed(1)}%` };
  }

  const ema99EntryMaxScore = Number(opts.ema99EntryMaxScore ?? process.env.SHAKEOUT_RECLAIM_EMA99_ENTRY_MAX_SCORE ?? 70);
  const btcRegime = String(opts.btcRegime ?? 'FLAT').toUpperCase();
  const btcRelation = opts.btcRelation ?? computeBtcRelation(candles5m, opts.btcCandles5m);
  const btcFollowMinCorr = Number(
    opts.btcFollowMinCorr ?? process.env.SHAKEOUT_BTC_FOLLOW_MIN_CORR ?? 0.45,
  );
  const btcIndependentMaxCorr = Number(
    opts.btcIndependentMaxCorr ?? process.env.SHAKEOUT_BTC_INDEPENDENT_MAX_CORR ?? 0.15,
  );
  const btcHighBetaMin = Number(
    opts.btcHighBetaMin ?? process.env.SHAKEOUT_BTC_HIGH_BETA_MIN ?? 2,
  );
  const corr = Number(btcRelation?.corr);
  const beta = Number(btcRelation?.beta);
  const btcEntryClass = !isShort || btcRegime !== 'STRONG'
    ? 'NORMAL'
    : !btcRelation || !Number.isFinite(corr)
      ? 'BTC_UNKNOWN'
      : btcRelation.opposed || corr < btcIndependentMaxCorr
        ? 'INDEPENDENT'
        : corr < btcFollowMinCorr && Number.isFinite(beta) && Math.abs(beta) >= btcHighBetaMin
          ? 'HIGH_BETA'
          : corr >= btcFollowMinCorr ? 'BTC_ALIGNED' : 'MIXED';
  const btcIndependentShort = isShort
    && btcRegime === 'STRONG'
    && ['INDEPENDENT', 'HIGH_BETA'].includes(btcEntryClass);
  const btcStrongShortEma99 = isShort
    && btcRegime === 'STRONG'
    && !btcIndependentShort
    && Number.isFinite(m5.ema99)
    && m5.ema99 > 0;
  const useEma99Entry = (score <= ema99EntryMaxScore || btcStrongShortEma99)
    && Number.isFinite(m5.ema99)
    && m5.ema99 > 0;
  const rawEntry = useEma99Entry ? Number(m5.ema99) : markEntry;
  const maxPendingDistancePct = Math.max(
    0,
    Number(opts.maxPendingDistancePct ?? process.env.SHAKEOUT_RECLAIM_PENDING_MAX_DISTANCE_PCT ?? 5),
  );
  const rawEntryDistancePct = Math.abs(rawEntry - markEntry) / markEntry * 100;
  const entryWasClamped = useEma99Entry
    && !btcStrongShortEma99
    && maxPendingDistancePct > 0
    && rawEntryDistancePct > maxPendingDistancePct;
  const entry = entryWasClamped
    ? markEntry + Math.sign(rawEntry - markEntry) * markEntry * maxPendingDistancePct / 100
    : rawEntry;
  const slBuffer = Math.max(m5.atr || 0, entry * 0.006) * 0.55;
  const structureSl = isShort
    ? m5.pullHigh + slBuffer
    : m5.pullLow - slBuffer;
  const sl = isShort
    ? Math.max(structureSl, entry + slBuffer)
    : Math.min(structureSl, entry - slBuffer);
  const risk = Math.abs(entry - sl);
  const rawTp1 = isShort ? m5.lowPrice : m5.highPrice;
  const tp1Adjusted = isShort ? rawTp1 >= entry : rawTp1 <= entry;
  const tp1 = tp1Adjusted
    ? (isShort ? entry - risk * 1.1 : entry + risk * 1.1)
    : rawTp1;
  const tp = isShort ? Math.min(tp1, entry - risk * 2.2) : Math.max(tp1, entry + risk * 2.2);
  if (!Number.isFinite(entry) || entry <= 0) return { pass: false, reason: 'invalid entry' };
  const directionGeometryOk = isShort
    ? (tp < entry && entry < sl)
    : (sl < entry && entry < tp);
  if (!directionGeometryOk) {
    return { pass: false, reason: `invalid ${side} geometry entry=${entry} sl=${sl} tp=${tp}` };
  }
  const stage = confirmed ? 'RECLAIM_CONFIRMED' : 'SHAKEOUT_WATCH';

  return {
    pass: true,
    type: isShort
      ? 'shakeout_reject_short'
      : bottomReboundRisk
        ? 'shakeout_bottom_rebound_risk'
        : bottomReboundQualified ? 'shakeout_bottom_rebound_long' : 'shakeout_reclaim_long',
    subtype: bottomReboundRisk
      ? 'BOTTOM_REBOUND_RISK'
      : bottomReboundQualified ? 'BOTTOM_REBOUND' : null,
    bottomRebound: bottomRebound.pass,
    bottomReboundRisk,
    bottomReboundQualified,
    autoTradeBlocked: bottomReboundRisk,
    autoTradeBlockReason: bottomReboundRisk ? bottomRiskReasons.join('; ') : null,
    stage,
    action: side,
    score,
    grade: gradeScore(score),
    entry: Number(entry.toFixed(10)),
    entryMode: btcStrongShortEma99
      ? 'EMA99_BTC_STRONG_SHORT'
      : useEma99Entry ? 'EMA99_LOW_SCORE' : 'MARK',
    btcRegime,
    btcRelation,
    btcEntryClass,
    btcIndependentShort,
    btcStrongShortEma99,
    entryReference: Number(markEntry.toFixed(10)),
    entryRaw: Number(rawEntry.toFixed(10)),
    entryDistancePct: Number((Math.abs(entry - markEntry) / markEntry * 100).toFixed(2)),
    entryRawDistancePct: Number(rawEntryDistancePct.toFixed(2)),
    entryWasClamped,
    sl: Number(sl.toFixed(10)),
    tp: Number(tp.toFixed(10)),
    tp1: Number(tp1.toFixed(10)),
    ema13: Number(m5.ema13.toFixed(10)),
    ema25: Number(m5.ema25.toFixed(10)),
    ema99: Number(m5.ema99.toFixed(10)),
    ema99_5m: Number(m5.ema99.toFixed(10)),
    ema99_15m: Number(m15.ema99.toFixed(10)),
    reason: isShort
      ? (confirmed
        ? 'Dump volume 5m/15m expanded, pullback killed shorts near EMA zone, price rejected down again'
        : 'Dump volume 5m/15m expanded, price is pulling back to shake out weak shorts near EMA zone')
      : bottomReboundRisk
        ? `False-bottom risk: ${bottomRiskReasons.join('; ')}`
      : (confirmed
        ? 'Volume 5m/15m expanded, pullback shakeout hit EMA zone, price started reclaiming'
        : 'Volume 5m/15m expanded, price is pulling back to shake out weak longs near EMA zone'),
    note: [
      `5m ${isShort ? 'dump' : 'pump'}=${(m5.movePct * 100).toFixed(1)}% ${isShort ? 'bounce' : 'drop'}=${(m5.dropPct * 100).toFixed(1)}% vol=${Math.max(m5.volRatio, m5.pullVolRatio).toFixed(1)}x`,
      `15m ${isShort ? 'dump' : 'pump'}=${(m15.movePct * 100).toFixed(1)}% vol=${Math.max(m15.volRatio, m15.pullVolRatio).toFixed(1)}x`,
      `emaDist=${(m5.maDistPct * 100).toFixed(2)}%`,
      `${isShort ? 'reject' : 'reclaim'}=${(m5.reclaimPct * 100).toFixed(1)}%`,
      btcStrongShortEma99
        ? 'entry=EMA99 exact because BTC STRONG; no 5% clamp'
        : btcIndependentShort
          ? `entry=coin structure because ${btcEntryClass} vs BTC`
        : useEma99Entry ? `entry=EMA99 because score<=${ema99EntryMaxScore}` : 'entry=mark',
      entryWasClamped
        ? `entryClamped=${rawEntry.toFixed(10)}->${entry.toFixed(10)} maxDistance=${maxPendingDistancePct.toFixed(1)}%`
        : '',
      bottomRebound.pass
        ? `bottomRebound decline=${(bottomRebound.declinePct * 100).toFixed(1)}% rebound=${(bottomRebound.reboundPct * 100).toFixed(1)}% lowAge=${bottomRebound.lowAge}`
        : '',
      bottomReboundRisk ? `bottomReboundRisk=${bottomRiskReasons.join('; ')}` : '',
      tp1Adjusted ? `tp1 adjusted because raw target ${rawTp1.toFixed(10)} crossed entry` : '',
      trap.risk !== 'LOW' ? `trapRisk=${trap.risk}: ${trap.reasons.join('; ')}` : '',
    ].filter(Boolean).join(' | '),
    riskFlags: {
      trapRisk: trap.risk,
      trapPenalty: trap.penalty,
      trapReasons: trap.reasons,
      rawScore,
      bottomReboundRisk,
      bottomRiskReasons,
    },
    factors: {
      move5mPct: Number((m5.movePct * 100).toFixed(2)),
      move15mPct: Number((m15.movePct * 100).toFixed(2)),
      drop5mPct: Number((m5.dropPct * 100).toFixed(2)),
      retrace5mPct: Number((m5.retracePct * 100).toFixed(1)),
      vol5mX: Number(Math.max(m5.volRatio, m5.pullVolRatio).toFixed(2)),
      vol15mX: Number(Math.max(m15.volRatio, m15.pullVolRatio).toFixed(2)),
      emaZoneDistPct: Number((m5.maDistPct * 100).toFixed(3)),
      ema99_5m: Number(m5.ema99.toFixed(10)),
      ema99_15m: Number(m15.ema99.toFixed(10)),
      reclaimPct: Number((m5.reclaimPct * 100).toFixed(2)),
      pullbackAge5m: m5.pullbackAge,
      wickRejectPct: Number((m5.wickRejectPct * 100).toFixed(1)),
      tp1Adjusted,
      rawTp1: Number(rawTp1.toFixed(10)),
      rsi5m: Number.isFinite(m5.rsi14) ? Number(m5.rsi14.toFixed(1)) : null,
      rsi15m: Number.isFinite(m15.rsi14) ? Number(m15.rsi14.toFixed(1)) : null,
      confirmed,
      bottomDeclinePct: bottomRebound.pass ? Number((bottomRebound.declinePct * 100).toFixed(1)) : null,
      bottomReboundPct: bottomRebound.pass ? Number((bottomRebound.reboundPct * 100).toFixed(1)) : null,
      bottomLowAge15m: bottomRebound.pass ? bottomRebound.lowAge : null,
      bottomLowPrice: bottomRebound.pass ? Number(bottomRebound.lowPrice.toFixed(10)) : null,
      bottomReboundRisk,
      btcCorr: Number.isFinite(corr) ? corr : null,
      btcBeta: Number.isFinite(beta) ? beta : null,
      btcEntryClass,
    },
  };
}

export async function runShakeoutReclaimScan(symbols, klineCache, snapshotMap = new Map(), opts = {}) {
  const maxSymbols = Number(opts.maxSymbols ?? process.env.SHAKEOUT_RECLAIM_MAX_SYMBOLS ?? 9999);
  const list = symbols.slice(0, maxSymbols);
  const signals = [];
  const failureReasons = new Map();
  let processed = 0;
  let evaluated = 0;
  const btcCandles5m = klineCache.getIfCached('BTCUSDT', '5m', 180);
  const rememberFailure = (side, reason) => {
    const normalized = String(reason ?? 'unknown')
      .replace(/\d+(?:\.\d+)?%/g, 'N%')
      .replace(/\d+(?:\.\d+)?x/g, 'Nx')
      .replace(/\(\d+\)/g, '(N)');
    const key = `${side}: ${normalized}`;
    failureReasons.set(key, (failureReasons.get(key) ?? 0) + 1);
  };
  for (const symbol of list) {
    const candles5m = klineCache.getIfCached(symbol, '5m', 180);
    const candles15m = klineCache.getIfCached(symbol, '15m', 160);
    if (!candles5m || candles5m.length < 125 || !candles15m || candles15m.length < 125) continue;
    processed++;
    const snap = snapshotMap.get(symbol) || {};
    for (const side of ['LONG', 'SHORT']) {
      evaluated++;
      const det = detectShakeoutReclaim(candles5m, candles15m, snap, {
        ...opts,
        side,
        btcCandles5m,
      });
      if (!det.pass) {
        rememberFailure(side, det.reason);
        continue;
      }
      signals.push({
        symbol,
        ...det,
        markPrice: Number(snap.markPrice ?? candles5m[candles5m.length - 1]?.close ?? det.entry),
        change24h: Number(snap.change24hPct ?? snap.priceChangePercent ?? 0),
        volume: Number(snap.quoteVolume ?? 0),
        scannedAt: Date.now(),
      });
    }
  }
  const resolvedSignals = resolveOppositeSideConflicts(signals, opts);
  resolvedSignals.sort((a, b) => b.score - a.score || Math.abs(b.change24h ?? 0) - Math.abs(a.change24h ?? 0));
  const diagnostics = {
    evaluated,
    rawSignals: signals.length,
    conflictFiltered: signals.length - resolvedSignals.length,
    topFailures: [...failureReasons.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 16)
      .map(([reason, count]) => ({ reason, count })),
  };
  return { signals: resolvedSignals, processed, diagnostics };
}
