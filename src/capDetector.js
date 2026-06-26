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

// ── Shared ATR / SMA / Bollinger helpers ──────────────────────────────────────

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

  function boll(len, k, endIdx) {
    const tail = closes.slice(endIdx - len, endIdx);
    const m = tail.reduce((s, v) => s + v, 0) / len;
    const variance = tail.reduce((s, v) => s + (v - m) * (v - m), 0) / len;
    const sd = Math.sqrt(variance);
    return { mid: m, upper: m + k * sd, lower: m - k * sd };
  }

  return { sma, atr, boll, n };
}

// ── LONG: Selling Climax → Spring / Automatic Rally ───────────────────────────
// Wyckoff phase A: panic selling at new low with volume spike + shakeout wick
// → confirmed by price re-entering BB + RSI kick + early EMA turn

function detectCapitulationSpringAction(candles, state = {}, cfg = {}) {
  const C = Object.assign({
    lookback:       30,    // bars to establish the prior low
    scanTail:       8,     // look for SC in last N bars
    volLB:          20,    // volume moving average period
    bbLen:          20,
    bbK:            2,
    rsiKick:        30,    // RSI6 must be > this after SC
    atrPeriod:      14,
    scVolX:         2.0,   // SC volume >= 2× avg
    scRangeATR:     1.2,   // SC range >= 1.2× ATR
    scWickFrac:     0.4,   // lower wick >= 40% of body (shakeout)
    confirmBars:    5,
    entryOffsetPct: 0.0015,
    pullbackFrac:   0.35,
    slAtrMult:      0.6,
    tpAtrMult:      2.0,
    minScore:       45,
  }, cfg || {});

  const minLen = Math.max(C.lookback, C.bbLen, C.atrPeriod) + 5;
  if (!Array.isArray(candles) || candles.length < minLen)
    return { pass: false, action: null, reason: 'Not enough candles' };

  const n      = candles.length;
  const closes = candles.map((c) => +c.close);
  const highs  = candles.map((c) => +c.high);
  const lows   = candles.map((c) => +c.low);
  const vols   = candles.map((c) => +c.volume);
  const { sma, atr, boll } = makeHelpers(closes, highs, lows);

  const A         = atr(C.atrPeriod);
  const avgVol    = sma(vols, C.volLB);
  const floorIdx  = Math.max(n - C.scanTail, 1);

  // EMA99 trend filter: không LONG khi giá dưới EMA99 quá sâu (> 20%)
  if (isFinite(state.ema99) && closes[n - 1] < state.ema99 * 0.80)
    return { pass: false, action: null, reason: 'Price > 20% below EMA99 — deep downtrend' };

  // lookback low excludes the scanTail window so the SC is truly a new low
  const lookbackLow = Math.min(...lows.slice(Math.max(0, floorIdx - C.lookback), floorIdx));

  // ── Step 1: find Selling Climax ──────────────────────────────────────────────
  let sc = null, scIdx = -1;
  for (let i = floorIdx; i < n; i++) {
    const o = +candles[i].open, h = +candles[i].high;
    const l = +candles[i].low,  c = +candles[i].close, v = +candles[i].volume;
    const range  = h - l;
    const body   = Math.abs(c - o);
    const lowerW = Math.min(o, c) - l; // FIXED: was (o<c?o:l)-l → gave 0 for bearish candles
    if (
      l <= lookbackLow &&
      v >= avgVol * C.scVolX &&
      range >= A * C.scRangeATR &&
      body > 0 && lowerW >= body * C.scWickFrac
    ) {
      sc = { o, h, l, c, v, idx: i }; scIdx = i; break;
    }
  }
  if (!sc) return { pass: false, action: null, reason: 'No selling climax in recent bars' };

  // BB computed at the SC bar (not current bar) to avoid look-ahead
  const bbAtSc = boll(C.bbLen, C.bbK, scIdx);

  // ── Step 2: confirmation (Spring / AR) ──────────────────────────────────────
  let confirm = null;
  const maxJ = Math.min(n - 1, scIdx + C.confirmBars);
  for (let j = scIdx + 1; j <= maxJ; j++) {
    const o = +candles[j].open, h = +candles[j].high;
    const l = +candles[j].low,  c = +candles[j].close;
    const reentered = c > bbAtSc.lower;
    const rsiOK     = state.rsi6 == null ? true : state.rsi6 > C.rsiKick;
    const ribbonOK  = isFinite(state.ema5) && isFinite(state.ema13) && state.ema5 > state.ema13;
    const prevHigh  = +(candles[j - 1]?.high ?? h);
    const engulfUp  = c > o && c > Math.max(prevHigh, sc.o);
    if (rsiOK && (reentered || engulfUp || ribbonOK)) {
      confirm = { h, c, idx: j }; break;
    }
  }
  if (!confirm) return { pass: false, action: null, reason: 'No confirmation after SC' };

  // ── Step 3: Entry / SL / TP ──────────────────────────────────────────────────
  const triggerHigh = Math.max(confirm.h, +(candles[confirm.idx - 1]?.high ?? confirm.h));
  const entry    = +(triggerHigh    * (1 + C.entryOffsetPct)).toFixed(8);
  const altEntry = +(Math.max(state.ema5 || confirm.c, state.ema13 || confirm.c) * (1 + C.entryOffsetPct * 0.5)).toFixed(8);
  const sl       = +(sc.l - C.slAtrMult * A).toFixed(8);
  const tp       = +(entry + C.tpAtrMult * A).toFixed(8);

  // ── Step 4: Score ─────────────────────────────────────────────────────────────
  const volX    = sc.v / avgVol;
  const rangeX  = (sc.h - sc.l) / A;
  const lowerWick = Math.min(sc.o, sc.c) - sc.l;
  const wickFrac = Math.min(1, lowerWick / Math.max(1e-9, Math.abs(sc.c - sc.o)));
  let score = 0;
  // SC quality: volume + range + wick (max 40)
  score += Math.min(40,
    20 * Math.log2(Math.max(1, volX)) +
    10 * (rangeX >= 1.5 ? 1 : rangeX / 1.5) +
    10 * Math.min(1, wickFrac)
  );
  // Confirmation quality: BB re-entry + RSI + EMA (max 35)
  const bbBack = closes[confirm.idx] > bbAtSc.lower ? 1 : 0;
  const rsiPts = state.rsi6 != null ? Math.max(0, (state.rsi6 - 30) / 30) : 0.5;
  const emaPts = (state.ema5 > state.ema13 && state.ema13 > state.ema25) ? 1 : (state.ema5 > state.ema13 ? 0.6 : 0);
  score += 35 * (0.5 * bbBack + 0.3 * rsiPts + 0.2 * emaPts);
  // Follow-through: current volume + distance from EMA13 (max 25)
  const vNowX = vols[n - 1] / avgVol;
  const ext   = Math.min(2.5, Math.abs(closes[n - 1] - (state.ema13 || closes[n - 1])) / Math.max(1e-9, A));
  score += 25 * (Math.min(1, vNowX / 2) * (ext >= 0.4 ? 1 : ext / 0.4));
  score = Math.max(0, Math.min(100, Math.round(score)));

  if (score < C.minScore) return { pass: false, action: null, reason: `Score too low (${score})` };

  return {
    pass:       true,
    action:     'LONG',
    type:       'sc_spring',
    blockShort: true,
    entry, altEntry, sl, tp, score,
    grade:  gradeScore(score),
    reason: 'Selling Climax → Spring/AR: re-entry BB + RSI kick + EMA turn',
    note:   `SC vol=${volX.toFixed(2)}x · range=${rangeX.toFixed(2)}× ATR | ATR=${A.toFixed(8)}`,
    factors: {
      volRatio: +volX.toFixed(2),
      rangeX:   +rangeX.toFixed(2),
      bbBack,
      rsi6val:  state.rsi6 != null ? +state.rsi6.toFixed(1) : null,
      emaBull:  isFinite(state.ema5) && isFinite(state.ema13) && state.ema5 > state.ema13 ? 1 : 0,
      vNowX:    +vNowX.toFixed(2),
    },
  };
}

// ── SHORT: Buying Climax → UTAD / Distribution ────────────────────────────────
// Mirror of SC: euphoric buying spike at new high with volume spike + rejection wick
// → confirmed by close back below BB upper + RSI exhaustion + early EMA bear turn

function detectBuyingClimaxAction(candles, state = {}, cfg = {}) {
  const C = Object.assign({
    lookback:       30,
    scanTail:       8,
    volLB:          20,
    bbLen:          20,
    bbK:            2,
    rsiKick:        70,    // RSI6 must be < this after BC (exhaustion)
    atrPeriod:      14,
    bcVolX:         2.0,
    bcRangeATR:     1.2,
    bcWickFrac:     0.4,   // upper wick >= 40% of body (rejection)
    confirmBars:    5,
    entryOffsetPct: 0.0015,
    pullbackFrac:   0.35,
    slAtrMult:      0.6,
    tpAtrMult:      2.0,
    minScore:       45,
  }, cfg || {});

  const minLen = Math.max(C.lookback, C.bbLen, C.atrPeriod) + 5;
  if (!Array.isArray(candles) || candles.length < minLen)
    return { pass: false, action: null, reason: 'Not enough candles' };

  const n      = candles.length;
  const closes = candles.map((c) => +c.close);
  const highs  = candles.map((c) => +c.high);
  const lows   = candles.map((c) => +c.low);
  const vols   = candles.map((c) => +c.volume);
  const { sma, atr, boll } = makeHelpers(closes, highs, lows);

  const A          = atr(C.atrPeriod);
  const avgVol     = sma(vols, C.volLB);
  const floorIdx   = Math.max(n - C.scanTail, 1);

  // EMA99 trend filter: không SHORT khi giá trên EMA99 quá cao (> 20%)
  if (isFinite(state.ema99) && closes[n - 1] > state.ema99 * 1.20)
    return { pass: false, action: null, reason: 'Price > 20% above EMA99 — strong uptrend' };

  const lookbackHigh = Math.max(...highs.slice(Math.max(0, floorIdx - C.lookback), floorIdx));

  // ── Step 1: find Buying Climax ───────────────────────────────────────────────
  let bc = null, bcIdx = -1;
  for (let i = floorIdx; i < n; i++) {
    const o = +candles[i].open, h = +candles[i].high;
    const l = +candles[i].low,  c = +candles[i].close, v = +candles[i].volume;
    const range  = h - l;
    const body   = Math.abs(c - o);
    const upperW = h - Math.max(o, c); // rejection wick above body
    if (
      h >= lookbackHigh &&
      v >= avgVol * C.bcVolX &&
      range >= A * C.bcRangeATR &&
      body > 0 && upperW >= body * C.bcWickFrac
    ) {
      bc = { o, h, l, c, v, idx: i }; bcIdx = i; break;
    }
  }
  if (!bc) return { pass: false, action: null, reason: 'No buying climax in recent bars' };

  const bbAtBc = boll(C.bbLen, C.bbK, bcIdx);

  // ── Step 2: confirmation (UTAD / distribution) ───────────────────────────────
  let confirm = null;
  const maxJ = Math.min(n - 1, bcIdx + C.confirmBars);
  for (let j = bcIdx + 1; j <= maxJ; j++) {
    const o = +candles[j].open, h = +candles[j].high;
    const l = +candles[j].low,  c = +candles[j].close;
    const reentered = c < bbAtBc.upper;
    const rsiOK     = state.rsi6 == null ? true : state.rsi6 < C.rsiKick;
    const ribbonOK  = isFinite(state.ema5) && isFinite(state.ema13) && state.ema5 < state.ema13;
    const prevLow   = +(candles[j - 1]?.low ?? l);
    const engulfDn  = c < o && c < Math.min(prevLow, bc.o);
    if (rsiOK && (reentered || engulfDn || ribbonOK)) {
      confirm = { l, c, idx: j }; break;
    }
  }
  if (!confirm) return { pass: false, action: null, reason: 'No confirmation after BC' };

  // ── Step 3: Entry / SL / TP ──────────────────────────────────────────────────
  const triggerLow = Math.min(confirm.l, +(candles[confirm.idx - 1]?.low ?? confirm.l));
  const entry    = +(triggerLow    * (1 - C.entryOffsetPct)).toFixed(8);
  const altEntry = +(Math.min(state.ema5 || confirm.c, state.ema13 || confirm.c) * (1 - C.entryOffsetPct * 0.5)).toFixed(8);
  const sl       = +(bc.h + C.slAtrMult * A).toFixed(8);
  const tp       = +(entry - C.tpAtrMult * A).toFixed(8);

  // ── Step 4: Score (mirror of SC scorer) ──────────────────────────────────────
  const volX    = bc.v / avgVol;
  const rangeX  = (bc.h - bc.l) / A;
  const upperWick = bc.h - Math.max(bc.o, bc.c);
  const wickFrac = Math.min(1, upperWick / Math.max(1e-9, Math.abs(bc.c - bc.o)));
  let score = 0;
  score += Math.min(40,
    20 * Math.log2(Math.max(1, volX)) +
    10 * (rangeX >= 1.5 ? 1 : rangeX / 1.5) +
    10 * Math.min(1, wickFrac)
  );
  const bbBack = closes[confirm.idx] < bbAtBc.upper ? 1 : 0;
  const rsiPts = state.rsi6 != null ? Math.max(0, (70 - state.rsi6) / 30) : 0.5;
  const emaPts = (state.ema5 < state.ema13 && state.ema13 < state.ema25) ? 1 : (state.ema5 < state.ema13 ? 0.6 : 0);
  score += 35 * (0.5 * bbBack + 0.3 * rsiPts + 0.2 * emaPts);
  const vNowX = vols[n - 1] / avgVol;
  const ext   = Math.min(2.5, Math.abs(closes[n - 1] - (state.ema13 || closes[n - 1])) / Math.max(1e-9, A));
  score += 25 * (Math.min(1, vNowX / 2) * (ext >= 0.4 ? 1 : ext / 0.4));
  score = Math.max(0, Math.min(100, Math.round(score)));

  if (score < C.minScore) return { pass: false, action: null, reason: `Score too low (${score})` };

  return {
    pass:      true,
    action:    'SHORT',
    type:      'bc_utad',
    blockLong: true,
    entry, altEntry, sl, tp, score,
    grade:  gradeScore(score),
    reason: 'Buying Climax → UTAD/Distribution: re-entry BB + RSI exhaustion + EMA turn',
    note:   `BC vol=${volX.toFixed(2)}x · range=${rangeX.toFixed(2)}× ATR | ATR=${A.toFixed(8)}`,
    factors: {
      volRatio: +volX.toFixed(2),
      rangeX:   +rangeX.toFixed(2),
      bbBack,
      rsi6val:  state.rsi6 != null ? +state.rsi6.toFixed(1) : null,
      emaBear:  isFinite(state.ema5) && isFinite(state.ema13) && state.ema5 < state.ema13 ? 1 : 0,
      vNowX:    +vNowX.toFixed(2),
    },
  };
}

// ── LONG: Liquidation Flush + Quick Recovery ─────────────────────────────────
// Sharp drop + volume spike + quick bounce — targets Binance liquidation cascades.
// In downtrend (price >8% below EMA99): flips to SHORT "failed_bounce" instead.

function detectLiqFlush(candles, state = {}, cfg = {}) {
  const C = Object.assign({
    scanTail:        8,
    volLB:           20,
    atrPeriod:       14,
    flushMinBodyPct: 0.012,
    flushVolX:       2.0,
    flushWickPct:    0.25,
    revVolX:         1.5,
    revRecovPct:     0.50,
    rsiMax:          52,      // only applied for LONG direction
    confirmBars:     3,
    minScore:        50,
    ema99Thresh:     0.92,    // below this → flip to failed_bounce SHORT
    blockDeepFlushShort: true,
    blockDeepFlushEmaGapPct: 10,
    blockDeepFlushBouncePct: 60,
    blockDeepFlushVolX: 4,
    blockDeepFlushEmaGapHardPct: 12,
    blockDeepFlushBounceSoftPct: 50,
  }, cfg || {});

  const minLen = Math.max(C.volLB, C.atrPeriod) + C.scanTail + 5;
  if (!Array.isArray(candles) || candles.length < minLen)
    return { pass: false, action: null, reason: 'Not enough candles' };

  const n      = candles.length;
  const closes = candles.map((c) => +c.close);
  const highs  = candles.map((c) => +c.high);
  const lows   = candles.map((c) => +c.low);
  const opens  = candles.map((c) => +c.open);
  const vols   = candles.map((c) => +c.volume);
  const { sma, atr } = makeHelpers(closes, highs, lows);

  const A      = atr(C.atrPeriod);
  const avgVol = sma(vols, C.volLB);
  if (!isFinite(A) || A <= 0) return { pass: false, action: null, reason: 'ATR invalid' };

  // EMA99 determines direction: below threshold → failed_bounce SHORT, else → liq_flush LONG
  const inDowntrend = isFinite(state.ema99) && closes[n - 1] < state.ema99 * C.ema99Thresh;
  const ema99GapPct = isFinite(state.ema99)
    ? +((1 - closes[n - 1] / state.ema99) * 100).toFixed(1)
    : 0;

  const floorIdx = Math.max(n - C.scanTail, 1);

  // ── Step 1: flush candle ─────────────────────────────────────────────────────
  let flush = null, flushIdx = -1;
  for (let i = floorIdx; i < n - 1; i++) {
    const o = opens[i], h = highs[i], l = lows[i], c = closes[i], v = vols[i];
    if (c >= o) continue;
    const bodyPct   = (o - c) / Math.max(1e-9, o);
    if (bodyPct < C.flushMinBodyPct) continue;
    if (v < avgVol * C.flushVolX) continue;
    const range     = h - l;
    const lowerWick = Math.min(o, c) - l;
    if (range > 0 && lowerWick < range * C.flushWickPct) continue;
    flush = { o, h, l, c, v, idx: i, bodyPct }; flushIdx = i; break;
  }
  if (!flush) return { pass: false, action: null, reason: 'No flush candle found' };

  // ── Step 2: reversal candle ──────────────────────────────────────────────────
  let rev = null;
  const maxJ = Math.min(n - 1, flushIdx + C.confirmBars);
  for (let j = flushIdx + 1; j <= maxJ; j++) {
    const o = opens[j], h = highs[j], l = lows[j], c = closes[j], v = vols[j];
    if (c <= o) continue;
    if (v < avgVol * C.revVolX) continue;
    const flushRange = Math.max(1e-9, flush.o - flush.c);
    const recovery   = (c - flush.c) / flushRange;
    if (recovery < C.revRecovPct) continue;
    rev = { o, h, l, c, v, idx: j, recovery }; break;
  }
  if (!rev) return { pass: false, action: null, reason: 'No reversal after flush' };

  // ── Step 3: RSI at flush (only filter for LONG) ───────────────────────────────
  const rsiAtFlush = calcRsi(closes.slice(0, flushIdx + 1), 6);
  if (!inDowntrend && isFinite(rsiAtFlush) && rsiAtFlush > C.rsiMax)
    return { pass: false, action: null, reason: `RSI too high at flush (${rsiAtFlush.toFixed(1)})` };

  // ── Step 4: Score ─────────────────────────────────────────────────────────────
  const flushVolX = flush.v / avgVol;
  const revVolX   = rev.v / avgVol;
  let score = 0;
  score += Math.min(1, Math.log2(Math.max(1, flushVolX)) / 2) * 20;
  score += Math.min(1, flush.bodyPct / 0.03) * 15;
  score += Math.min(1, Math.log2(Math.max(1, revVolX)) / 2) * 20;
  score += Math.min(1, rev.recovery / 0.8) * 15;
  const rsiNow   = state.rsi6 ?? rsiAtFlush;
  const rsiDelta = isFinite(rsiNow) && isFinite(rsiAtFlush) ? rsiNow - rsiAtFlush : 0;
  score += Math.min(1, Math.max(0, Math.abs(rsiDelta) / 15)) * 20;
  if (inDowntrend) {
    // Bonus for depth below EMA99 (deeper = stronger downtrend = better failed bounce)
    score += Math.min(10, ema99GapPct * 0.5);
  } else {
    const emaOkLong = (isFinite(state.ema13) && isFinite(state.ema25) && state.ema13 > state.ema25)
      || (isFinite(state.ema25) && closes[n - 1] > state.ema25);
    if (emaOkLong) score += 10;
    else score += 5;
  }
  score = Math.max(0, Math.min(100, Math.round(score)));

  if (score < C.minScore) return { pass: false, action: null, reason: `Score too low (${score})` };

  const commonFactors = {
    flushVolX:  +flushVolX.toFixed(2),
    revVolX:    +revVolX.toFixed(2),
    dropPct:    +(flush.bodyPct * 100).toFixed(2),
    recovery:   +(rev.recovery * 100).toFixed(0),
    rsiDelta:   +rsiDelta.toFixed(1),
    ema99GapPct,
  };

  if (inDowntrend) {
    const bouncePct = rev.recovery * 100;
    const bottomFlushShortRisk = C.blockDeepFlushShort && (
      (flushVolX >= C.blockDeepFlushVolX
        && bouncePct >= C.blockDeepFlushBouncePct
        && ema99GapPct >= C.blockDeepFlushEmaGapPct)
      || (ema99GapPct >= C.blockDeepFlushEmaGapHardPct
        && (flushVolX >= C.blockDeepFlushVolX || bouncePct >= C.blockDeepFlushBounceSoftPct))
    );
    if (bottomFlushShortRisk) {
      return {
        pass: false,
        action: null,
        reason: `Bottom flush short blocked: bounce ${bouncePct.toFixed(0)}%, EMA99 gap ${ema99GapPct}%, flush vol ${flushVolX.toFixed(1)}x`,
        blockedType: 'BOTTOM_FLUSH_SHORT_RISK',
        factors: commonFactors,
      };
    }
    // ── Failed Bounce SHORT ────────────────────────────────────────────────────
    const entry    = +(rev.l * 0.999).toFixed(8);
    const altEntry = +(closes[n - 1] * 0.999).toFixed(8);
    const sl       = +(rev.h + 0.3 * A).toFixed(8);
    const tp       = +(flush.l - 1.0 * A).toFixed(8);
    return {
      pass: true, action: 'SHORT', type: 'failed_bounce',
      entry, altEntry, sl, tp, score,
      grade:  gradeScore(score),
      reason: `Failed bounce: flush bounce rejected in downtrend (${ema99GapPct}% below EMA99)`,
      note:   `Flush vol=${flushVolX.toFixed(1)}× · Bounce ${(rev.recovery * 100).toFixed(0)}% → fail · EMA99 gap=${ema99GapPct}%`,
      factors: { ...commonFactors, emaOk: 0 },
    };
  }

  // ── Normal Liq Flush LONG ────────────────────────────────────────────────────
  const emaOk = (isFinite(state.ema13) && isFinite(state.ema25) && state.ema13 > state.ema25)
    || (isFinite(state.ema25) && closes[n - 1] > state.ema25);
  const entry    = +(rev.h * 1.001).toFixed(8);
  const altEntry = +(closes[n - 1] * 1.001).toFixed(8);
  const sl       = +(flush.l - 0.4 * A).toFixed(8);
  const tp       = +(entry + 2.0 * A).toFixed(8);
  return {
    pass: true, action: 'LONG', type: 'liq_flush', blockShort: true,
    entry, altEntry, sl, tp, score,
    grade:  gradeScore(score),
    reason: `Liq flush: ${(flush.bodyPct * 100).toFixed(1)}% drop → ${(rev.recovery * 100).toFixed(0)}% recovery`,
    note:   `Flush vol=${flushVolX.toFixed(1)}× · Rev vol=${revVolX.toFixed(1)}× · RSI Δ=+${rsiDelta.toFixed(0)}`,
    factors: { ...commonFactors, emaOk: emaOk ? 1 : 0 },
  };
}

// ── SHORT: Liquidation Top / Long Squeeze ─────────────────────────────────────
// Euphoric spike + volume rejection + quick reversal down

function detectLiqTop(candles, state = {}, cfg = {}) {
  const C = Object.assign({
    scanTail:        8,
    volLB:           20,
    atrPeriod:       14,
    spikeMinBodyPct: 0.012,
    spikeVolX:       2.0,
    spikeWickPct:    0.25,
    revVolX:         1.5,
    revRecovPct:     0.50,
    rsiMin:          48,
    confirmBars:     3,
    minScore:        50,
  }, cfg || {});

  const minLen = Math.max(C.volLB, C.atrPeriod) + C.scanTail + 5;
  if (!Array.isArray(candles) || candles.length < minLen)
    return { pass: false, action: null, reason: 'Not enough candles' };

  const n      = candles.length;
  const closes = candles.map((c) => +c.close);
  const highs  = candles.map((c) => +c.high);
  const lows   = candles.map((c) => +c.low);
  const opens  = candles.map((c) => +c.open);
  const vols   = candles.map((c) => +c.volume);
  const { sma, atr } = makeHelpers(closes, highs, lows);

  const A      = atr(C.atrPeriod);
  const avgVol = sma(vols, C.volLB);
  if (!isFinite(A) || A <= 0) return { pass: false, action: null, reason: 'ATR invalid' };

  // EMA99 determines direction: above threshold → failed_top LONG, else → liq_top SHORT
  const inUptrend = isFinite(state.ema99) && closes[n - 1] > state.ema99 * 1.08;
  const ema99GapPct = isFinite(state.ema99)
    ? +((closes[n - 1] / state.ema99 - 1) * 100).toFixed(1)
    : 0;

  const floorIdx = Math.max(n - C.scanTail, 1);

  // ── Step 1: spike candle ─────────────────────────────────────────────────────
  let spike = null, spikeIdx = -1;
  for (let i = floorIdx; i < n - 1; i++) {
    const o = opens[i], h = highs[i], l = lows[i], c = closes[i], v = vols[i];
    if (c <= o) continue;
    const bodyPct   = (c - o) / Math.max(1e-9, o);
    if (bodyPct < C.spikeMinBodyPct) continue;
    if (v < avgVol * C.spikeVolX) continue;
    const range     = h - l;
    const upperWick = h - Math.max(o, c);
    if (range > 0 && upperWick < range * C.spikeWickPct) continue;
    spike = { o, h, l, c, v, idx: i, bodyPct }; spikeIdx = i; break;
  }
  if (!spike) return { pass: false, action: null, reason: 'No spike candle found' };

  // ── Step 2: reversal candle ──────────────────────────────────────────────────
  let rev = null;
  const maxJ = Math.min(n - 1, spikeIdx + C.confirmBars);
  for (let j = spikeIdx + 1; j <= maxJ; j++) {
    const o = opens[j], h = highs[j], l = lows[j], c = closes[j], v = vols[j];
    if (c >= o) continue;
    if (v < avgVol * C.revVolX) continue;
    const spikeRange = Math.max(1e-9, spike.c - spike.o);
    const recovery   = (spike.c - c) / spikeRange;
    if (recovery < C.revRecovPct) continue;
    rev = { o, h, l, c, v, idx: j, recovery }; break;
  }
  if (!rev) return { pass: false, action: null, reason: 'No reversal after spike' };

  // ── Step 3: RSI at spike (only filter for SHORT) ──────────────────────────────
  const rsiAtSpike = calcRsi(closes.slice(0, spikeIdx + 1), 6);
  if (!inUptrend && isFinite(rsiAtSpike) && rsiAtSpike < C.rsiMin)
    return { pass: false, action: null, reason: `RSI too low at spike (${rsiAtSpike.toFixed(1)})` };

  // ── Step 4: Score ─────────────────────────────────────────────────────────────
  const spikeVolX = spike.v / avgVol;
  const revVolX   = rev.v / avgVol;
  let score = 0;
  score += Math.min(1, Math.log2(Math.max(1, spikeVolX)) / 2) * 20;
  score += Math.min(1, spike.bodyPct / 0.03) * 15;
  score += Math.min(1, Math.log2(Math.max(1, revVolX)) / 2) * 20;
  score += Math.min(1, rev.recovery / 0.8) * 15;
  const rsiNow   = state.rsi6 ?? rsiAtSpike;
  const rsiDelta = isFinite(rsiNow) && isFinite(rsiAtSpike) ? rsiAtSpike - rsiNow : 0;
  score += Math.min(1, Math.max(0, Math.abs(rsiDelta) / 15)) * 20;
  if (inUptrend) {
    score += Math.min(10, ema99GapPct * 0.5);
  } else {
    const emaOkShort = (isFinite(state.ema13) && isFinite(state.ema25) && state.ema13 < state.ema25)
      || (isFinite(state.ema25) && closes[n - 1] < state.ema25);
    if (emaOkShort) score += 10;
    else score += 5;
  }
  score = Math.max(0, Math.min(100, Math.round(score)));

  if (score < C.minScore) return { pass: false, action: null, reason: `Score too low (${score})` };

  const commonFactors = {
    flushVolX:  +spikeVolX.toFixed(2),
    revVolX:    +revVolX.toFixed(2),
    dropPct:    +(spike.bodyPct * 100).toFixed(2),
    recovery:   +(rev.recovery * 100).toFixed(0),
    rsiDelta:   +rsiDelta.toFixed(1),
    ema99GapPct,
  };

  if (inUptrend) {
    // ── Failed Top LONG ────────────────────────────────────────────────────────
    // Dip after spike rejected in uptrend → continuation long
    const entry    = +(rev.h * 1.001).toFixed(8);
    const altEntry = +(closes[n - 1] * 1.001).toFixed(8);
    const sl       = +(rev.l - 0.3 * A).toFixed(8);
    const tp       = +(spike.h + 1.5 * A).toFixed(8);
    return {
      pass: true, action: 'LONG', type: 'failed_top', blockShort: true,
      entry, altEntry, sl, tp, score,
      grade:  gradeScore(score),
      reason: `Failed top: spike dip absorbed in uptrend (${ema99GapPct}% above EMA99)`,
      note:   `Spike vol=${spikeVolX.toFixed(1)}× · Dip ${(rev.recovery * 100).toFixed(0)}% → absorbed · EMA99 gap=+${ema99GapPct}%`,
      factors: { ...commonFactors, emaOk: 1 },
    };
  }

  // ── Normal Liq Top SHORT ─────────────────────────────────────────────────────
  const emaOk = (isFinite(state.ema13) && isFinite(state.ema25) && state.ema13 < state.ema25)
    || (isFinite(state.ema25) && closes[n - 1] < state.ema25);
  const entry    = +(rev.l * 0.999).toFixed(8);
  const altEntry = +(closes[n - 1] * 0.999).toFixed(8);
  const sl       = +(spike.h + 0.4 * A).toFixed(8);
  const tp       = +(entry - 2.0 * A).toFixed(8);
  return {
    pass: true, action: 'SHORT', type: 'liq_top', blockLong: true,
    entry, altEntry, sl, tp, score,
    grade:  gradeScore(score),
    reason: `Liq top: ${(spike.bodyPct * 100).toFixed(1)}% spike → ${(rev.recovery * 100).toFixed(0)}% reversal`,
    note:   `Spike vol=${spikeVolX.toFixed(1)}× · Rev vol=${revVolX.toFixed(1)}× · RSI Δ=−${rsiDelta.toFixed(0)}`,
    factors: { ...commonFactors, emaOk: emaOk ? 1 : 0 },
  };
}

// ── Scan orchestrator ──────────────────────────────────────────────────────────

export async function runCapScan(symbols, klineCache, snapshotMap) {
  const results = [];
  let processed = 0;
  for (const symbol of symbols) {
    try {
      const klines = klineCache.getIfCached(symbol, '15m', 200);
      if (!klines || klines.length < 80) continue;
      processed++;

      const closes = klines.map((k) => +k.close);
      const state  = {
        ema5:  calcEma(closes, 5),
        ema13: calcEma(closes, 13),
        ema25: calcEma(closes, 25),
        ema99: calcEma(closes, 99),
        rsi6:  calcRsi(closes, 6),
        rsi14: calcRsi(closes, 14),
      };

      const snap = snapshotMap.get(symbol);

      const candidates = [
        detectCapitulationSpringAction(klines, state),
        detectBuyingClimaxAction(klines, state),
        detectLiqFlush(klines, state),
        detectLiqTop(klines, state),
      ].filter((d) => d.pass);
      if (candidates.length === 0) continue;

      // Emit ALL passing detectors (not just winner) so rare types (Flush, Failed*) are visible
      for (const det of candidates) {
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
          blockLong:  det.blockLong  ?? false,
          markPrice:  snap?.markPrice,
          change24h:  snap?.change24hPct,
          volume:     snap?.quoteVolume,
          scannedAt:  Date.now(),
        });
      }
    } catch { /* skip bad symbol */ }
  }
  return { signals: results.sort((a, b) => b.score - a.score), processed };
}
