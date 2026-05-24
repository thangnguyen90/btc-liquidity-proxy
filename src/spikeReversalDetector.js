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

function clamp01(v) { return Math.max(0, Math.min(1, v)); }

function makeHelpers(closes, highs, lows) {
  function sma(arr, m) {
    if (arr.length < m) return NaN;
    let s = 0;
    for (let i = arr.length - m; i < arr.length; i++) s += arr[i];
    return s / m;
  }

  function atr(period) {
    const n = closes.length;
    const trs = [];
    for (let i = 1; i < n; i++) {
      const hi = highs[i], lo = lows[i], pc = closes[i - 1];
      trs.push(Math.max(hi - lo, Math.abs(hi - pc), Math.abs(lo - pc)));
    }
    if (trs.length < period) return NaN;
    let a = 0;
    for (let k = 0; k < period; k++) a += trs[k];
    a /= period;
    for (let k = period; k < trs.length; k++) a = (a * (period - 1) + trs[k]) / period;
    return a;
  }

  return { sma, atr };
}

// ── Spike Reversal (Kill Short → Dump) detector ────────────────────────────────
// Pattern: giá spike UP mạnh (kill shorts, squeeze) với vol cao →
//   smart money distribute tại đỉnh → reversal candle xác nhận → SHORT entry.
//
// Khác vol_climax trong pumpDetector:
//   - vol_climax: 3.5x vol, 1 phase, không check reversal
//   - spike_reversal: 2.0x vol, 2 phase, bắt buộc reversal confirmation candle
//   - Entry timing: SAU reversal (không phải trong spike candle)

export function detectSpikeReversal(candles, state, opts = {}) {
  const CFG = {
    spikeLookback:    4,      // tìm spike trong N nến gần nhất (trừ nến hiện tại)
    spikeMinBodyPct:  0.035,  // body spike ≥ 3.5% của giá (bullish body)
    spikeMinMovePct:  0.050,  // hoặc high-open ≥ 5% (wick spike)
    spikeVolMult:     2.0,    // vol spike ≥ 2.0x average
    spikeEmaAtrMult:  2.0,    // spike high phải > EMA13 + N×ATR (overextended)
    rsiOBAfterSpike:  65,     // RSI14 ≥ 65 (soft check — chỉ trừ score nếu fail)
    revMinBodyPct:    0.005,  // reversal body ≥ 0.5%
    revVolMult:       1.2,    // reversal vol ≥ 1.2x avg
    revMaxAge:        3,      // reversal phải trong N nến sau spike
    revRejectFrac:    0.30,   // close ≤ spikeH − 30% spikeRange (rejection rõ)
    slAtrMult:        0.8,    // SL = spikeHigh + N×ATR
    tpAtrMult:        2.0,    // TP fallback = entry − N×ATR
    minScore:         55,
    atrPeriod:        14,
    volLookback:      20,
    ...opts,
  };

  const n = candles.length;
  if (n < 40) return { pass: false, reason: 'not enough candles' };

  const opens  = candles.map((k) => +k.open);
  const closes = candles.map((k) => +k.close);
  const highs  = candles.map((k) => +k.high);
  const lows   = candles.map((k) => +k.low);
  const vols   = candles.map((k) => +k.volume);

  const { sma, atr } = makeHelpers(closes, highs, lows);

  const A = atr(CFG.atrPeriod);
  if (!isFinite(A) || A <= 0) return { pass: false, reason: 'ATR invalid' };

  // avgVol: tính từ N nến trước nến hiện tại (tránh spike inflate avg của chính nó)
  const avgVol = sma(vols.slice(0, n - 1), CFG.volLookback);
  if (!avgVol || avgVol <= 0) return { pass: false, reason: 'no avg vol' };

  const ema13 = state.ema13;
  const ema25 = state.ema25;
  const rsi14 = state.rsi14;

  // ── Phase 1: Tìm spike candle ──────────────────────────────────────────────
  // Lookback: từ nến [n-2] về trước N nến (bỏ nến đang chạy = index n-1)
  let spikeIdx = null;
  for (let i = n - 2; i >= Math.max(1, n - 1 - CFG.spikeLookback); i--) {
    const o = opens[i], c = closes[i], h = highs[i];

    // Phải là nến tăng (bullish)
    if (c <= o) continue;

    const bodyPct = (c - o) / Math.max(o, 1e-9);
    const movePct = (h - o) / Math.max(o, 1e-9);  // high-open (wick spike case)

    // Body hoặc wick move đủ lớn
    const bodyOK = bodyPct >= CFG.spikeMinBodyPct;
    const moveOK = movePct >= CFG.spikeMinMovePct;
    if (!bodyOK && !moveOK) continue;

    // Volume spike
    const volRatio = vols[i] / avgVol;
    if (volRatio < CFG.spikeVolMult) continue;

    // Overextension: spike high phải vượt EMA13 đủ xa
    if (isFinite(ema13) && ema13 > 0 && isFinite(A)) {
      if (h < ema13 + CFG.spikeEmaAtrMult * A) continue;
    }

    spikeIdx = i;
    break; // lấy spike gần nhất
  }

  if (spikeIdx === null) return { pass: false, reason: 'no spike candle found' };

  const spikeH    = highs[spikeIdx];
  const spikeO    = opens[spikeIdx];
  const spikeC    = closes[spikeIdx];
  const spikeLow  = lows[spikeIdx];
  const spikeBody = spikeC - spikeO;
  const spikeBodyPct  = spikeBody / Math.max(spikeO, 1e-9);
  const spikeMovePct  = (spikeH - spikeO) / Math.max(spikeO, 1e-9);
  const spikeVolRatio = vols[spikeIdx] / avgVol;
  const spikeRange    = spikeH - spikeLow;

  // Overextension score (dùng close của spike vs EMA13)
  const overextPct = (isFinite(ema13) && ema13 > 0)
    ? (spikeH - ema13) / Math.max(ema13, 1e-9)
    : 0;

  // ── Phase 2a: RSI check (soft) ─────────────────────────────────────────────
  // Dùng RSI hiện tại — sau spike thường vẫn elevated
  const rsiOK = isFinite(rsi14) && rsi14 >= CFG.rsiOBAfterSpike;

  // ── Phase 2b: Reversal confirmation ────────────────────────────────────────
  // Tìm nến đỏ đầu tiên sau spike, trong vòng revMaxAge nến
  let revIdx = null;
  for (let i = spikeIdx + 1; i <= Math.min(n - 1, spikeIdx + CFG.revMaxAge); i++) {
    if (closes[i] < opens[i]) {
      revIdx = i;
      break;
    }
  }

  if (revIdx === null) return { pass: false, reason: 'no bearish reversal candle after spike' };

  const revO      = opens[revIdx];
  const revC      = closes[revIdx];
  const revBody   = Math.abs(revO - revC);
  const revBodyPct = revBody / Math.max(revO, 1e-9);
  const revVolRatio = vols[revIdx] / avgVol;

  if (revBodyPct < CFG.revMinBodyPct) {
    return { pass: false, reason: `reversal body too small (${(revBodyPct * 100).toFixed(2)}%)` };
  }

  if (revVolRatio < CFG.revVolMult) {
    return { pass: false, reason: `reversal vol too low (${revVolRatio.toFixed(2)}x)` };
  }

  // Rejection: close phải cách đỉnh spike đủ xa
  const rejectDist = spikeH - revC;
  const rejectFrac = spikeRange > 0 ? rejectDist / spikeRange : 0;
  if (rejectFrac < CFG.revRejectFrac) {
    return { pass: false, reason: `rejection insufficient (${(rejectFrac * 100).toFixed(0)}% < ${CFG.revRejectFrac * 100}%)` };
  }

  // ── Scoring ────────────────────────────────────────────────────────────────
  const sc_spikeBody = clamp01((Math.max(spikeBodyPct, spikeMovePct) - CFG.spikeMinBodyPct) / (0.15 - CFG.spikeMinBodyPct));
  const sc_spikeVol  = clamp01((spikeVolRatio - CFG.spikeVolMult) / (6.0 - CFG.spikeVolMult));
  const sc_overext   = clamp01(overextPct / 0.15); // 15% overext = full
  const sc_rsiOB     = isFinite(rsi14)
    ? clamp01((rsi14 - CFG.rsiOBAfterSpike) / (90 - CFG.rsiOBAfterSpike))
    : (rsiOK ? 0.5 : 0.2); // neutral fallback
  const sc_revBody   = clamp01(revBodyPct / 0.03);  // 3% body = full
  const sc_revVol    = clamp01((revVolRatio - CFG.revVolMult) / (3.0 - CFG.revVolMult));
  const sc_reject    = clamp01((rejectFrac - CFG.revRejectFrac) / (1.0 - CFG.revRejectFrac));

  const W = { spikeBody: 0.20, spikeVol: 0.20, overext: 0.15, rsiOB: 0.15, revBody: 0.10, revVol: 0.10, revReject: 0.10 };
  const raw01 =
    sc_spikeBody * W.spikeBody +
    sc_spikeVol  * W.spikeVol  +
    sc_overext   * W.overext   +
    sc_rsiOB     * W.rsiOB     +
    sc_revBody   * W.revBody   +
    sc_revVol    * W.revVol    +
    sc_reject    * W.revReject;

  const score = Math.max(0, Math.min(100, Math.round(raw01 * 100)));

  if (score < CFG.minScore) return { pass: false, reason: `score too low (${score})` };

  // ── Entry / SL / TP ────────────────────────────────────────────────────────
  const entry    = revC;
  const altEntry = +(entry * 1.003).toFixed(8);  // slight pullback entry
  const sl       = +(spikeH + CFG.slAtrMult * A).toFixed(8);

  // TP: EMA25 nếu đủ xa (< entry − ATR), fallback entry − 2×ATR
  const tpByEma25 = (isFinite(ema25) && ema25 < entry - A) ? +ema25.toFixed(8) : null;
  const tpByAtr   = +(entry - CFG.tpAtrMult * A).toFixed(8);
  const tp        = tpByEma25 ?? tpByAtr;

  const barsSinceSpike = revIdx - spikeIdx;

  return {
    pass:       true,
    action:     'SHORT',
    type:       'spike_reversal',
    blockShort: false,
    entry,
    altEntry,
    sl,
    tp,
    score,
    grade: gradeScore(score),
    reason: 'Spike UP → Reversal: kill short spike + vol cao + nến đỏ xác nhận',
    note: `SPIKE_REV | spikeVol=${spikeVolRatio.toFixed(1)}x | body=${(spikeBodyPct * 100).toFixed(1)}% | RSI14=${isFinite(rsi14) ? rsi14.toFixed(1) : '-'} | reject=${(rejectFrac * 100).toFixed(0)}% | bars=${barsSinceSpike}`,
    factors: {
      spikeIdx:      spikeIdx,
      spikeBodyPct:  +(spikeBodyPct * 100).toFixed(2),
      spikeMovePct:  +(spikeMovePct * 100).toFixed(2),
      spikeVolRatio: +spikeVolRatio.toFixed(2),
      overextPct:    +(overextPct * 100).toFixed(2),
      rsi14:         isFinite(rsi14) ? +rsi14.toFixed(1) : null,
      revBodyPct:    +(revBodyPct * 100).toFixed(2),
      revVolRatio:   +revVolRatio.toFixed(2),
      rejectFrac:    +rejectFrac.toFixed(2),
      barsSinceSpike,
      spikeH:        +spikeH.toFixed(8),
      ema25:         isFinite(ema25) ? +ema25.toFixed(8) : null,
    },
  };
}

// ── Scan orchestrator ──────────────────────────────────────────────────────────

export async function runSpikeReversalScan(symbols, klineCache, snapshotMap) {
  const results = [];
  let processed = 0;

  for (const symbol of symbols) {
    try {
      const klines = klineCache.getIfCached(symbol, '15m', 200);
      if (!klines || klines.length < 40) continue;
      processed++;

      const closes = klines.map((k) => +k.close);
      const state  = {
        ema13: calcEma(closes, 13),
        ema25: calcEma(closes, 25),
        rsi14: calcRsi(closes, 14),
      };

      const det = detectSpikeReversal(klines, state);
      if (!det.pass) continue;

      const snap     = snapshotMap.get(symbol);
      const markNow  = snap?.markPrice;

      // Chase penalty — SHORT: entry > tp, giá đã chạy xuống là bad
      let chasePct   = 0;
      let chaseScore = det.score;
      if (markNow && det.entry && det.tp && det.tp !== det.entry) {
        if (markNow < det.entry) {
          chasePct = (det.entry - markNow) / Math.max(1e-9, det.entry - det.tp);
        }
        chasePct = Math.max(0, chasePct);
        if (chasePct > 0.25) {
          const penalty = Math.min(40, Math.round((chasePct - 0.25) * 53));
          chaseScore = Math.max(0, det.score - penalty);
        }
      }

      results.push({
        symbol,
        action:     det.action,
        type:       det.type,
        score:      chaseScore,
        grade:      gradeScore(chaseScore),
        entry:      det.entry,
        altEntry:   det.altEntry,
        sl:         det.sl,
        tp:         det.tp,
        reason:     det.reason,
        note:       det.note + (chasePct > 0.1 ? ` | chase=${(chasePct * 100).toFixed(0)}%TP` : ''),
        factors:    { ...det.factors, chasePct: +chasePct.toFixed(3) },
        blockShort: false,
        markPrice:  markNow,
        change24h:  snap?.change24hPct,
        volume:     snap?.quoteVolume,
        scannedAt:  Date.now(),
      });
    } catch { /* skip bad symbol */ }
  }

  return { signals: results.sort((a, b) => b.score - a.score), processed };
}
