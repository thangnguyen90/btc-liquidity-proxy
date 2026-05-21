// ── Indicator helpers ──────────────────────────────────────────────────────────

function calcEma(closes, period) {
  if (closes.length < period) return NaN;
  const alpha = 2 / (period + 1);
  let ema = 0;
  for (let i = 0; i < period; i++) ema += closes[i];
  ema /= period;
  for (let i = period; i < closes.length; i++) {
    ema = alpha * closes[i] + (1 - alpha) * ema;
  }
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

function makeHelpers(closes, highs, lows) {
  const n = closes.length;

  function sma(arr, m) {
    let s = 0;
    for (let i = arr.length - m; i < arr.length; i++) s += arr[i];
    return s / m;
  }

  function atr(period) {
    const trs = [];
    for (let i = 1; i < n; i++) {
      const hi = highs[i], lo = lows[i], pc = closes[i - 1];
      trs.push(Math.max(hi - lo, Math.abs(hi - pc), Math.abs(lo - pc)));
    }
    let a = 0;
    for (let k = 0; k < period; k++) a += trs[k];
    a /= period;
    for (let k = period; k < trs.length; k++) a = (a * (period - 1) + trs[k]) / period;
    return a;
  }

  return { sma, atr, n };
}

// ── Kill Short (Short Squeeze / Stop Hunt) detector ───────────────────────────
// Pattern: price spike-down sweeping recent lows (stop hunting shorts),
// then strong reversal candle with volume → shorts liquidated.
//
// Differs from SC→Spring (capDetector):
//   - Occurs mid-uptrend / after shallow pullback (not after long downtrend)
//   - Volume spike on REVERSAL candle, not sweep candle
//   - RSI only mildly oversold (< 50) at sweep, not deeply (<30)
//   - No BB re-entry requirement

function detectKillShort(candles, state, cfg = {}) {
  const n = candles.length;
  if (n < 30) return { pass: false, reason: 'not enough candles' };

  const opens  = candles.map((k) => +k.open);
  const closes = candles.map((k) => +k.close);
  const highs  = candles.map((k) => +k.high);
  const lows   = candles.map((k) => +k.low);
  const vols   = candles.map((k) => +k.volume);

  const { sma, atr } = makeHelpers(closes, highs, lows);

  const A = atr(14);
  if (!isFinite(A) || A <= 0) return { pass: false, reason: 'ATR invalid' };

  const avgVol = sma(vols, 20);
  if (!avgVol || avgVol <= 0) return { pass: false, reason: 'no avg vol' };

  const C = {
    sweepLookback:  20,   // nến để tìm recent low
    sweepSearchBack: 6,   // tìm sweep candle trong 6 nến gần nhất (trừ nến hiện tại)
    sweepVolX:       1.5, // volume sweep tối thiểu
    sweepWickFrac:   0.4, // lower wick / body tối thiểu
    revVolX:         1.5, // volume reversal tối thiểu
    revClosePosMin:  0.55,// close pos trong nến reversal (close near high)
    engulfPct:       0.97,// close ≥ 97% sweep high
    rsiAtSweepMax:   55,  // RSI tại sweep candle (không quá bullish)
    minScore:        55,
    ...cfg,
  };

  // Recent low: minimum of lows trong sweepLookback nến (không tính 2 nến cuối)
  const recentLowEnd = n - 2;
  const recentLowStart = Math.max(0, n - 2 - C.sweepLookback);
  let recentLow = Infinity;
  for (let i = recentLowStart; i < recentLowEnd; i++) {
    if (lows[i] < recentLow) recentLow = lows[i];
  }
  if (!isFinite(recentLow)) return { pass: false, reason: 'no recent low' };

  // Tìm sweep candle: spike xuống dưới recent low với wick + volume
  let sweepIdx = null;
  for (let i = n - 2; i >= Math.max(1, n - 1 - C.sweepSearchBack); i--) {
    const lo = lows[i];
    const o = opens[i], c = closes[i];
    const bd = Math.abs(c - o);
    const lowerW = Math.min(o, c) - lo;
    if (
      lo <= recentLow &&
      bd > 0 &&
      lowerW >= bd * C.sweepWickFrac &&
      vols[i] >= avgVol * C.sweepVolX
    ) {
      sweepIdx = i;
      break;
    }
  }
  if (sweepIdx === null) return { pass: false, reason: 'no sweep candle' };

  // RSI tại sweep candle (tính trên closes[0..sweepIdx])
  const rsiAtSweep = calcRsi(closes.slice(0, sweepIdx + 1), 6);
  if (isFinite(rsiAtSweep) && rsiAtSweep > C.rsiAtSweepMax) {
    return { pass: false, reason: `RSI at sweep too high (${rsiAtSweep.toFixed(1)})` };
  }

  // Reversal candle: ngay sau sweep (có thể là nến hiện tại)
  const revIdx = sweepIdx + 1;
  if (revIdx >= n) return { pass: false, reason: 'no reversal candle yet' };

  const revO = opens[revIdx];
  const revC = closes[revIdx];
  const revH = highs[revIdx];
  const revL = lows[revIdx];
  const sweepH = highs[sweepIdx];
  const sweepL = lows[sweepIdx];

  if (revC <= revO) return { pass: false, reason: 'reversal candle is bearish' };

  const closePos = (revC - revL) / Math.max(1e-9, revH - revL);
  if (closePos < C.revClosePosMin) return { pass: false, reason: `close pos too low (${closePos.toFixed(2)})` };

  const revVolX = vols[revIdx] / avgVol;
  if (revVolX < C.revVolX) return { pass: false, reason: `reversal vol too low (${revVolX.toFixed(2)}x)` };

  const engulfs = revC >= sweepH * C.engulfPct;

  // EMA context: giá không ở deep downtrend
  const ema13 = state.ema13;
  const ema25 = state.ema25;
  const lastClose = closes[n - 1];
  const emaOk = (isFinite(ema13) && isFinite(ema25) && ema13 > ema25) ||
                (isFinite(ema25) && lastClose > ema25);

  // ── Scoring ──────────────────────────────────────────────────────────────────
  const sweepO = opens[sweepIdx], sweepC = closes[sweepIdx];
  const sweepBd = Math.abs(sweepC - sweepO);
  const sweepLowerW = Math.min(sweepO, sweepC) - sweepL;
  const wickFrac = sweepBd > 0 ? Math.min(1, sweepLowerW / sweepBd) : 0;
  const sweepVolX = vols[sweepIdx] / avgVol;

  // Sweep quality (max 30)
  const sweepWickScore    = Math.min(1, wickFrac / 0.8) * 15;
  const sweepVolScore     = Math.min(1, Math.log2(Math.max(1, sweepVolX)) / 2) * 15;

  // Reversal quality (max 40)
  const reversalVolScore  = Math.min(1, Math.log2(Math.max(1, revVolX)) / 2) * 20;
  const closePosScore     = Math.min(1, closePos / 0.8) * 10;
  const engulfScore       = engulfs ? 10 : 0;

  // RSI recovery (max 20)
  const rsiNow = state.rsi6;
  const rsiDelta = (isFinite(rsiNow) && isFinite(rsiAtSweep)) ? rsiNow - rsiAtSweep : 0;
  const rsiRecovScore = Math.min(1, Math.max(0, rsiDelta) / 20) * 20;

  // EMA bonus (max 10)
  const emaBonus = emaOk ? 10 : 0;

  const score = Math.max(0, Math.min(100, Math.round(
    sweepWickScore + sweepVolScore +
    reversalVolScore + closePosScore + engulfScore +
    rsiRecovScore + emaBonus
  )));

  if (score < C.minScore) return { pass: false, reason: `score too low (${score})` };

  // ── Entry / SL / TP ──────────────────────────────────────────────────────────
  const entry    = +(revH * 1.0015).toFixed(8);
  const altEntry = +(revC * 1.001).toFixed(8);
  const sl       = +(sweepL - 0.5 * A).toFixed(8);
  const tp       = +(entry + 2.5 * A).toFixed(8);

  return {
    pass:       true,
    action:     'LONG',
    type:       'kill_short',
    blockShort: true,
    entry,
    altEntry,
    sl,
    tp,
    score,
    grade: gradeScore(score),
    reason: 'Kill Short: sweep lows + high-vol reversal engulf',
    note: `Sweep vol=${sweepVolX.toFixed(2)}× · Rev vol=${revVolX.toFixed(2)}× · Wick=${(wickFrac * 100).toFixed(0)}% · Close pos=${(closePos * 100).toFixed(0)}%`,
    factors: {
      sweepVolX: +sweepVolX.toFixed(2),
      revVolX:   +revVolX.toFixed(2),
      wickFrac:  +wickFrac.toFixed(2),
      closePos:  +closePos.toFixed(2),
      rsiDelta:  isFinite(rsiDelta) ? +rsiDelta.toFixed(1) : null,
      rsiAtSweep: isFinite(rsiAtSweep) ? +rsiAtSweep.toFixed(1) : null,
      emaOk:     emaOk ? 1 : 0,
      engulfs:   engulfs ? 1 : 0,
    },
  };
}

// ── Scan orchestrator ──────────────────────────────────────────────────────────

export async function runKillShortScan(symbols, klineCache, snapshotMap) {
  const results = [];
  let processed = 0;
  for (const symbol of symbols) {
    try {
      const klines = klineCache.getIfCached(symbol, '15m', 200);
      if (!klines || klines.length < 30) continue;
      processed++;

      const closes = klines.map((k) => +k.close);
      const state  = {
        ema5:  calcEma(closes, 5),
        ema13: calcEma(closes, 13),
        ema25: calcEma(closes, 25),
        rsi6:  calcRsi(closes, 6),
      };

      const det = detectKillShort(klines, state);
      if (!det.pass) continue;

      const snap = snapshotMap.get(symbol);

      results.push({
        symbol,
        action:     det.action,
        type:       det.type,
        score:      det.score,
        grade:      det.grade,
        entry:      det.entry,
        altEntry:   det.altEntry,
        sl:         det.sl,
        tp:         det.tp,
        reason:     det.reason,
        note:       det.note,
        factors:    det.factors ?? {},
        blockShort: det.blockShort ?? false,
        markPrice:  snap?.markPrice,
        change24h:  snap?.change24hPct,
        volume:     snap?.quoteVolume,
        scannedAt:  Date.now(),
      });
    } catch { /* skip bad symbol */ }
  }
  return { signals: results.sort((a, b) => b.score - a.score), processed };
}
