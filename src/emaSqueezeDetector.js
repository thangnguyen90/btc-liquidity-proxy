// ── EMA Squeeze Detector ──────────────────────────────────────────────────────
// Phát hiện coin có EMA13, EMA25, EMA99 tụ lại gần nhau (compression),
// sau đó breakout mạnh lên trên cụm EMA với volume xác nhận.
//
// Hai stage:
//   SQUEEZE   – EMA vẫn đang nén, chưa breakout — cảnh báo sớm để canh
//   BREAKOUT  – Giá vừa vượt lên trên cụm EMA + vol spike — entry ngay

export function detectEmaSqueeze(candles, state = {}, cfg = {}) {
  // ── Config ──────────────────────────────────────────────────────────────────
  const C = Object.assign({
    ema1: 13, ema2: 25, ema3: 99,       // EMA periods (Binance default)
    tightPct:     0.03,                   // spread < 3% = rất chặt
    moderatePct:  0.06,                   // spread 3-6% = chặt vừa
    maxSpreadPct: 0.10,                   // > 10% → không qualify
    minSqueezeBars: 15,                   // nén ít nhất 15 nến liên tiếp
    lookback: 40,                         // nhìn lại 40 nến để đo compression
    baseLookback: 48,                     // nền phẳng trước pump
    baseRangeMaxPct: 0.10,                // nền trước breakout không được quá rộng
    volSpikeX: 2.5,                       // vol breakout > pre-base MA20 × 2.5
    preRampVolX: 1.35,                    // squeeze sớm: volume bắt đầu nhú so với nền
    minPumpMovePct: 0.025,                // breakout phải rời nền tối thiểu 2.5%
    rsiMin: 40, rsiMax: 98,               // breakout vertical pump có thể RSI rất cao
    squeezeRsiMax: 72,                    // stage SQUEEZE chưa nên quá nóng
    breakoutMaxBars: 8,                   // breakout confirmed còn giữ vài nến sau pump
    breakoutMinBodyPct: 0.004,            // candle breakout body ≥ 0.4%
    atrPeriod: 14,
    slAtrMult: 0.6,
    tpRMultiple: 2.5,
    minScore: 55,
    entryBufferPct: 0.002,                // entry = maxEma × 1.002 (SQUEEZE stage)
    volLB: 20,                            // volume lookback for average
    side: 'LONG',                         // LONG = pump squeeze, SHORT = dump squeeze
    breakoutMaxSpreadPct: 0.22,           // sau khi đã pump, EMA có thể giãn mạnh
    recentBreakoutMaxBars: 24,             // case đã nén rồi mới dump/pump mạnh sau đó
    recentBreakoutMaxSpreadPct: 0.45,      // sau cú dump/pump EMA có thể giãn rất rộng
    recentSqueezeMinBars: 6,               // nến nén gần đây đủ để xác nhận base kiểu ALLO
    recentBaseRangeMaxPct: 0.25,           // nền sau pump mạnh có thể rộng hơn flat-base chuẩn
    recentBreakMinMovePct: 0.08,           // dump/pump khỏi nền ít nhất 8%
    recentBreakVolX: 1.4,                  // vol xác nhận nhẹ hơn vì entry có thể trễ sau breakdown
  }, cfg || {});
  C.side = String(C.side || 'LONG').toUpperCase() === 'SHORT' ? 'SHORT' : 'LONG';
  const isShortSide = C.side === 'SHORT';

  // ── Guards ──────────────────────────────────────────────────────────────────
  const need = C.ema3 + C.lookback + 10;
  if (!Array.isArray(candles) || candles.length < need) {
    return { pass: false, reason: `Not enough candles (need ${need}, got ${candles?.length ?? 0})` };
  }

  // ── Series ──────────────────────────────────────────────────────────────────
  const n  = candles.length;
  const O  = candles.map((c) => +c.open);
  const H  = candles.map((c) => +c.high);
  const L  = candles.map((c) => +c.low);
  const Cc = candles.map((c) => +c.close);
  const V  = candles.map((c) => +c.volume);

  // ── Helpers ─────────────────────────────────────────────────────────────────
  const sma = (arr, m, ei) => {
    const end = ei ?? arr.length - 1;
    const start = Math.max(0, end - m + 1);
    let s = 0, c = 0;
    for (let i = start; i <= end; i++) { s += arr[i]; c++; }
    return c ? s / c : 0;
  };

  const emaSeries = (arr, p) => {
    const a = 2 / (p + 1), out = new Array(arr.length);
    out[0] = arr[0];
    for (let i = 1; i < arr.length; i++) out[i] = a * arr[i] + (1 - a) * out[i - 1];
    return out;
  };

  const calcRsi = (arr, p = 14) => {
    if (arr.length < p + 2) return NaN;
    let gain = 0, loss = 0;
    const st = arr.length - p;
    for (let i = st; i < arr.length; i++) {
      const d = arr[i] - arr[i - 1];
      if (d > 0) gain += d; else loss -= d;
    }
    const rs = gain / Math.max(1e-9, loss);
    return 100 - 100 / (1 + rs);
  };

  const atrAt = (ei, period) => {
    let s = 0, c = 0;
    for (let i = Math.max(1, ei - period + 1); i <= ei; i++) {
      const tr = Math.max(H[i] - L[i], Math.abs(H[i] - Cc[i - 1]), Math.abs(L[i] - Cc[i - 1]));
      s += tr; c++;
    }
    return c ? s / c : 0;
  };

  const gradeScore = (s) => s >= 85 ? 'A' : s >= 70 ? 'B' : s >= 55 ? 'C' : 'D';

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const lerp  = (t, lo, hi) => lo + clamp(t, 0, 1) * (hi - lo);

  // ── Tính EMA series ─────────────────────────────────────────────────────────
  const ema13Ser = emaSeries(Cc, C.ema1);
  const ema25Ser = emaSeries(Cc, C.ema2);
  const ema99Ser = emaSeries(Cc, C.ema3);

  const lastIdx = n - 1;

  // ── Đo compression trong lookback window ────────────────────────────────────
  // Không tính nến hiện tại (lastIdx) vì có thể đang hình thành
  const lbStart = Math.max(C.ema3 + 1, lastIdx - C.lookback);
  const lbEnd   = lastIdx - 1;

  let squeezeBars = 0;
  let tightBars   = 0;
  const spreads   = [];

  for (let i = lbStart; i <= lbEnd; i++) {
    const maxE = Math.max(ema13Ser[i], ema25Ser[i], ema99Ser[i]);
    const minE = Math.min(ema13Ser[i], ema25Ser[i], ema99Ser[i]);
    const sp   = Cc[i] > 1e-12 ? (maxE - minE) / Cc[i] : 0;
    spreads.push(sp);
    if (sp < C.moderatePct) squeezeBars++;
    if (sp < C.tightPct)    tightBars++;
  }

  if (squeezeBars < C.minSqueezeBars) {
    return { pass: false, reason: `Không đủ bars nén: ${squeezeBars}/${C.minSqueezeBars} (spread < ${(C.moderatePct * 100).toFixed(0)}%)` };
  }

  // ── Trạng thái hiện tại ─────────────────────────────────────────────────────
  const ema13now = ema13Ser[lastIdx];
  const ema25now = ema25Ser[lastIdx];
  const ema99now = ema99Ser[lastIdx];
  const maxEmaNow = Math.max(ema13now, ema25now, ema99now);
  const minEmaNow = Math.min(ema13now, ema25now, ema99now);
  const spreadNow = Cc[lastIdx] > 1e-12 ? (maxEmaNow - minEmaNow) / Cc[lastIdx] : 0;

  const rsi14   = calcRsi(Cc, 14);
  const atrNow  = atrAt(lastIdx, C.atrPeriod);
  const avgVol  = sma(V, C.volLB, lastIdx - 1);

  // ── Xác định BREAKOUT/BREAKDOWN stage ───────────────────────────────────────
  let breakoutIdx = null;
  let breakoutRank = -Infinity;
  const breakSearchBars = Math.max(C.breakoutMaxBars, C.recentBreakoutMaxBars);
  const breakStart = Math.max(lbStart, lastIdx - breakSearchBars + 1);

  for (let i = breakStart; i <= lastIdx; i++) {
    const maxEi = Math.max(ema13Ser[i], ema25Ser[i], ema99Ser[i]);
    const minEi = Math.min(ema13Ser[i], ema25Ser[i], ema99Ser[i]);
    const bodySize = Math.abs(Cc[i] - O[i]);
    const bodyPct  = Cc[i] > 1e-12 ? bodySize / Cc[i] : 0;
    const passBreak = isShortSide
      ? Cc[i] < minEi && bodyPct >= C.breakoutMinBodyPct && Cc[i] < O[i]
      : Cc[i] > maxEi && bodyPct >= C.breakoutMinBodyPct && Cc[i] > O[i];
    if (passBreak) {
      const localBaseStart = Math.max(C.ema3 + 1, i - C.baseLookback);
      const localBaseEnd = Math.max(localBaseStart, i - 1);
      const localBaseHigh = Math.max(...H.slice(localBaseStart, localBaseEnd + 1));
      const localBaseLow = Math.min(...L.slice(localBaseStart, localBaseEnd + 1));
      const localBaseMid = (localBaseHigh + localBaseLow) / 2;
      const localBaseRangePct = localBaseMid > 1e-12 ? (localBaseHigh - localBaseLow) / localBaseMid : 1;
      const localPreVol = sma(V, C.volLB, localBaseEnd);
      const localVolRatio = localPreVol > 0 ? V[i] / localPreVol : 0;
      const freshness = 1 - (lastIdx - i) / Math.max(1, C.breakoutMaxBars);
      const localEventHigh = Math.max(...H.slice(i, lastIdx + 1));
      const localEventLow = Math.min(...L.slice(i, lastIdx + 1));
      const localMovePct = isShortSide
        ? (localBaseLow - localEventLow) / Math.max(1e-12, localBaseLow)
        : (localEventHigh - localBaseHigh) / Math.max(1e-12, localBaseHigh);
      const flatBonus = localBaseRangePct <= C.baseRangeMaxPct ? 100 : 0;
      const rank = flatBonus + localVolRatio * 10 + localMovePct * 100 + bodyPct * 100 + freshness;
      if (rank >= breakoutRank) {
        breakoutRank = rank;
        breakoutIdx = i;
      }
    }
  }

  const volCurrent = V[lastIdx];
  const volPrev    = sma(V, 3, lastIdx - 1);  // vol trung bình 3 nến trước
  const eventIdx   = breakoutIdx ?? lastIdx;
  const baseStart  = Math.max(C.ema3 + 1, eventIdx - C.baseLookback);
  const baseEnd    = Math.max(baseStart, eventIdx - 1);
  const baseHigh   = Math.max(...H.slice(baseStart, baseEnd + 1));
  const baseLow    = Math.min(...L.slice(baseStart, baseEnd + 1));
  const baseMid    = (baseHigh + baseLow) / 2;
  const baseRangePct = baseMid > 1e-12 ? (baseHigh - baseLow) / baseMid : 1;
  const flatBaseOk = baseRangePct <= C.baseRangeMaxPct;
  const preAvgVol  = sma(V, C.volLB, baseEnd);
  const breakoutVol = breakoutIdx !== null ? V[breakoutIdx] : 0;
  const breakoutVolRatio = preAvgVol > 0 ? breakoutVol / preAvgVol : 0;
  const rampVolRatio = preAvgVol > 0 ? Math.max(volCurrent, volPrev) / preAvgVol : 0;
  const pumpHigh = Math.max(...H.slice(eventIdx, lastIdx + 1));
  const dumpLow = Math.min(...L.slice(eventIdx, lastIdx + 1));
  const pumpMovePct = baseHigh > 1e-12 ? (pumpHigh - baseHigh) / baseHigh : 0;
  const dumpMovePct = baseLow > 1e-12 ? (baseLow - dumpLow) / baseLow : 0;
  const eventMovePct = isShortSide ? dumpMovePct : pumpMovePct;
  const closeInBase = baseHigh > baseLow ? (Cc[lastIdx] - baseLow) / (baseHigh - baseLow) : 0.5;

  const volOk      = breakoutVolRatio >= C.volSpikeX;
  const rsiOk      = Number.isFinite(rsi14) && (isShortSide
    ? rsi14 >= 2 && rsi14 <= 60
    : rsi14 >= C.rsiMin && rsi14 <= C.rsiMax);
  const squeezeRsiOk = Number.isFinite(rsi14) && (isShortSide
    ? rsi14 >= 24 && rsi14 <= 60
    : rsi14 >= C.rsiMin && rsi14 <= C.squeezeRsiMax);

  const breakoutAge = breakoutIdx !== null ? lastIdx - breakoutIdx : null;
  const recentBreakoutOk = breakoutIdx !== null
    && baseRangePct <= C.recentBaseRangeMaxPct
    && rsiOk
    && tightBars >= C.recentSqueezeMinBars
    && breakoutVolRatio >= C.recentBreakVolX
    && eventMovePct >= C.recentBreakMinMovePct
    && spreadNow <= C.recentBreakoutMaxSpreadPct;

  if (spreadNow > (breakoutIdx !== null ? C.breakoutMaxSpreadPct : C.maxSpreadPct)) {
    if (!recentBreakoutOk) {
      return { pass: false, reason: `EMA spread hiện tại quá rộng: ${(spreadNow * 100).toFixed(1)}%` };
    }
  }

  const isBreakout = breakoutIdx !== null
    && (flatBaseOk || recentBreakoutOk)
    && (volOk || recentBreakoutOk)
    && rsiOk
    && eventMovePct >= C.minPumpMovePct;
  const isSqueeze  = !isBreakout
    && flatBaseOk
    && squeezeRsiOk
    && spreadNow <= C.moderatePct
    && (isShortSide
      ? Cc[lastIdx] >= minEmaNow * 0.98 && Cc[lastIdx] <= maxEmaNow * 1.005
      : Cc[lastIdx] <= maxEmaNow * 1.02 && Cc[lastIdx] >= minEmaNow * 0.995)
    && (isShortSide ? closeInBase <= 0.45 : closeInBase >= 0.55)
    && rampVolRatio >= C.preRampVolX     // volume bắt đầu thức dậy
    && Math.abs(Cc[lastIdx] - (isShortSide ? minEmaNow : maxEmaNow)) / Math.max(1e-12, Cc[lastIdx]) <= 0.035;

  if (!isBreakout && !isSqueeze) {
    const why = !flatBaseOk && !recentBreakoutOk
      ? `Nền trước pump quá rộng: ${(baseRangePct * 100).toFixed(1)}%`
      : breakoutIdx !== null && !volOk && !recentBreakoutOk
        ? `Breakout nhưng vol breakout thấp: ${breakoutVolRatio.toFixed(1)}x (cần ${C.volSpikeX}x)`
        : breakoutIdx !== null && eventMovePct < C.minPumpMovePct
          ? `${isShortSide ? 'Breakdown' : 'Breakout'} chưa rời nền đủ: ${(eventMovePct * 100).toFixed(1)}%`
          : !rsiOk
            ? `RSI ${rsi14?.toFixed(0)} ngoài range [${C.rsiMin}-${C.rsiMax}]`
            : `Không detect stage (spread=${(spreadNow * 100).toFixed(1)}%, base=${(baseRangePct * 100).toFixed(1)}%, ramp=${rampVolRatio.toFixed(1)}x)`;
    return { pass: false, reason: why };
  }

  const stage = isBreakout
    ? (isShortSide ? 'BREAKDOWN' : 'BREAKOUT')
    : (isShortSide ? 'SQUEEZE_SHORT' : 'SQUEEZE');
  const isRecentBreakout = isBreakout && recentBreakoutOk
    && (breakoutAge > C.breakoutMaxBars || spreadNow > C.breakoutMaxSpreadPct);

  // ── Scoring ─────────────────────────────────────────────────────────────────
  // 1. Compression tightness (25pts): tightBars / squeezeBars ratio
  const tightRatio  = squeezeBars > 0 ? tightBars / squeezeBars : 0;
  const tightnessScore = Math.round(lerp(tightRatio, 0, 1) * 25);

  // 2. Compression duration (20pts): squeezeBars / lookback window
  const lbTotal = lbEnd - lbStart + 1;
  const durationScore = Math.round(lerp(squeezeBars / Math.max(1, lbTotal), 0.3, 1) * 20);

  // 3. Current EMA tightness (10pts): spreadNow vs tightPct
  const nowTightScore = Math.round(lerp(1 - spreadNow / C.moderatePct, 0, 1) * 10);

  // 4. RSI position (15pts): best at 50-65, penalty outside range
  let rsiScore = 0;
  if (Number.isFinite(rsi14)) {
    if (rsi14 >= 50 && rsi14 <= 65)      rsiScore = 15;
    else if (rsi14 >= 42 && rsi14 < 50)  rsiScore = Math.round(lerp((rsi14 - 42) / 8, 0, 1) * 12);
    else if (rsi14 > 65 && rsi14 <= 75)  rsiScore = Math.round(lerp(1 - (rsi14 - 65) / 10, 0, 1) * 10);
    else                                   rsiScore = 5;
  }

  // 5. Volume spike — BREAKOUT only (20pts)
  let volScore = 0;
  if (isBreakout) {
    const volRatio = breakoutVolRatio;
    volScore = Math.round(clamp(lerp((volRatio - C.volSpikeX) / (5 - C.volSpikeX), 0, 1), 0, 1) * 20);
  } else {
    volScore = Math.round(clamp(lerp((rampVolRatio - C.preRampVolX) / 1.5, 0, 1), 0, 1) * 10);
  }

  // 6. Breakout freshness — BREAKOUT only (10pts): nến mới hơn = điểm cao hơn
  let freshnessScore = 0;
  if (isBreakout && breakoutIdx !== null) {
    const age = breakoutAge;  // 0 = nến hiện tại, 4 = 4 nến trước
    freshnessScore = Math.round(lerp(1 - age / C.breakoutMaxBars, 0, 1) * 10);
  }

  const baseScore = Math.round(clamp(1 - baseRangePct / C.baseRangeMaxPct, 0, 1) * 15);
  const pumpScore = isBreakout ? Math.round(clamp(eventMovePct / 0.12, 0, 1) * 15) : 0;
  const rawScore = tightnessScore + durationScore + nowTightScore + rsiScore + volScore + freshnessScore + baseScore + pumpScore;
  const score    = Math.min(100, Math.max(0, rawScore));

  if (score < C.minScore) {
    return { pass: false, reason: `Score ${score} < min ${C.minScore}` };
  }

  // ── Entry / SL / TP ─────────────────────────────────────────────────────────
  let entry, altEntry, sl, tp;

  if (isBreakout) {
    entry    = Cc[lastIdx];
    altEntry = entry * (1 + (isShortSide ? -C.entryBufferPct : C.entryBufferPct));
    if (isShortSide) {
      const slBase = Math.min(ema25now, ema99now);
      sl = slBase + atrNow * C.slAtrMult;
      tp = entry - (sl - entry) * C.tpRMultiple;
    } else {
      const slBase = Math.max(ema25now, ema99now);
      sl = slBase - atrNow * C.slAtrMult;
      tp = entry + (entry - sl) * C.tpRMultiple;
    }
  } else {
    if (isShortSide) {
      entry    = minEmaNow * (1 - C.entryBufferPct);
      altEntry = minEmaNow * (1 - C.entryBufferPct * 2);
      sl       = maxEmaNow + atrNow * C.slAtrMult;
      tp       = entry - (sl - entry) * C.tpRMultiple;
    } else {
      entry    = maxEmaNow * (1 + C.entryBufferPct);
      altEntry = maxEmaNow * (1 + C.entryBufferPct * 2);
      sl       = minEmaNow - atrNow * C.slAtrMult;
      tp       = entry + (entry - sl) * C.tpRMultiple;
    }
  }

  // Validate TP/SL theo hướng lệnh
  if (isShortSide ? (sl <= entry || tp >= entry) : (sl >= entry || tp <= entry)) {
    return { pass: false, reason: 'SL/TP không hợp lệ' };
  }

  // ── Build output ─────────────────────────────────────────────────────────────
  const volRatioFmt = isBreakout
    ? breakoutVolRatio.toFixed(1)
    : rampVolRatio.toFixed(1);
  const noteBase = [
    `spread=${(spreadNow * 100).toFixed(1)}%`,
    `base=${(baseRangePct * 100).toFixed(1)}%`,
    `nén=${squeezeBars}/${lbTotal}bars`,
    `tight=${tightBars}`,
    `RSI=${Number.isFinite(rsi14) ? rsi14.toFixed(0) : '?'}`,
    isBreakout ? `breakVol=${volRatioFmt}x` : `rampVol=${volRatioFmt}x`,
    isBreakout ? `${isShortSide ? 'dump' : 'pump'}=${(eventMovePct * 100).toFixed(1)}%` : `${isShortSide ? 'minEMA' : 'maxEMA'}=${(isShortSide ? minEmaNow : maxEmaNow).toFixed(6)}`,
    isBreakout && breakoutIdx !== null ? `${isShortSide ? 'breakdown' : 'breakout'}-${breakoutAge}bars` : '',
    isRecentBreakout ? `recentSqueezeBreak=Y` : '',
  ].filter(Boolean).join(' | ');

  const reason = isBreakout
    ? isRecentBreakout
      ? `Recent EMA squeeze base → ${isShortSide ? 'BREAKDOWN/DUMP' : 'BREAKOUT/PUMP'} sau nén: EMA đã giãn ${(spreadNow * 100).toFixed(1)}% nhưng trước đó có ${tightBars} nến nén chặt, ${isShortSide ? 'dump' : 'pump'} ${(eventMovePct * 100).toFixed(1)}% trong ${breakoutAge} nến`
      : `Flat-base EMA squeeze → ${isShortSide ? 'BREAKDOWN/DUMP' : 'BREAKOUT/PUMP'} xác nhận (vol ${volRatioFmt}×, ${isShortSide ? 'dump' : 'pump'} ${(eventMovePct * 100).toFixed(1)}%)`
    : `Flat-base EMA squeeze đang chuẩn bị ${isShortSide ? 'xả/thủng xuống' : 'bơm'} (base ${(baseRangePct * 100).toFixed(1)}%, ramp vol ${volRatioFmt}×)`;

  return {
    pass:   true,
    stage,
    action: C.side,
    score,
    grade:  gradeScore(score),
    entry,
    altEntry,
    sl,
    tp,
    spreadPct:   spreadNow,
    baseRangePct,
    breakoutVolRatio: isBreakout ? +breakoutVolRatio.toFixed(2) : null,
    pumpMovePct: isBreakout ? +(eventMovePct * 100).toFixed(2) : null,
    squeezeBars,
    tightBars,
    lbTotal,
    rsi:         Number.isFinite(rsi14) ? +rsi14.toFixed(1) : null,
    volRatio:    isBreakout ? +breakoutVolRatio.toFixed(2) : +rampVolRatio.toFixed(2),
    ema13:       ema13now,
    ema25:       ema25now,
    ema99:       ema99now,
    breakoutAge: isBreakout && breakoutIdx !== null ? breakoutAge : null,
    reason,
    note: noteBase,
  };
}

// ── Normalize kline row ────────────────────────────────────────────────────────
function normalizeKline(k) {
  if (!k) return null;
  if (typeof k.open === 'number') return k;
  const [openTime, open, high, low, close, volume, closeTime, quoteVolume] = k;
  return { openTime: +openTime, open: +open, high: +high, low: +low, close: +close, volume: +volume, closeTime: +closeTime, quoteVolume: +quoteVolume };
}

// ── Scan ─────────────────────────────────────────────────────────────────────
export async function runEmaSqueezeScan(symbols, klineCache, snapshotMap, opts = {}) {
  const results   = [];
  let   processed = 0;
  const intervals = String(opts.intervals ?? process.env.EMA_SQUEEZE_INTERVALS ?? '5m,15m,1h')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const excludeMajors = opts.excludeMajors ?? true;
  const majorSymbols = new Set(String(opts.majorSymbols ?? process.env.EMA_SQUEEZE_EXCLUDE_SYMBOLS ?? 'BTCUSDT,ETHUSDT,BNBUSDT,SOLUSDT,XRPUSDT,DOGEUSDT,ADAUSDT,TONUSDT,TRXUSDT,LINKUSDT,BCHUSDT,LTCUSDT,AVAXUSDT')
    .split(',')
    .map((s) => s.trim().toUpperCase())
    .filter(Boolean));
  const minQuoteVolume = Number(opts.minQuoteVolume ?? process.env.EMA_SQUEEZE_MIN_QUOTE_VOLUME ?? 3_000_000);
  const maxQuoteVolume = Number(opts.maxQuoteVolume ?? process.env.EMA_SQUEEZE_MAX_QUOTE_VOLUME ?? 150_000_000);

  for (const symbol of symbols) {
    try {
      if (excludeMajors && majorSymbols.has(symbol)) continue;
      const snap  = snapshotMap.get(symbol);
      const quoteVolume = Number(snap?.quoteVolume ?? 0);
      if (quoteVolume < minQuoteVolume || quoteVolume > maxQuoteVolume) continue;

      const state = snap?.markPrice ? { markPrice: snap.markPrice } : {};

      for (const interval of intervals) {
        const raw = klineCache.getIfCached(symbol, interval, 250);
        if (!raw || raw.length < 150) continue;

        const candles = raw.map(normalizeKline);
        if (candles.some((c) => !c)) continue;
        processed++;

        for (const side of ['LONG', 'SHORT']) {
          const det = detectEmaSqueeze(candles, state, { side });
          if (!det.pass) continue;
          if ((det.stage === 'SQUEEZE' || det.stage === 'SQUEEZE_SHORT') && Number(det.volRatio ?? 0) > 25) continue; // volume đã quá nổ, không còn là "chuẩn bị"

          // Chase penalty: nếu giá đã chạy xa entry
          const markNow = snap?.markPrice;
          let chasePct  = 0;
          let score     = det.score;

          if ((det.stage === 'BREAKOUT' || det.stage === 'BREAKDOWN') && markNow && det.entry && det.tp) {
            if (det.action === 'SHORT' && markNow < det.entry) {
              chasePct = (det.entry - markNow) / Math.max(1e-9, det.entry - det.tp);
            } else if (det.action === 'LONG' && markNow > det.entry) {
              chasePct = (markNow - det.entry) / Math.max(1e-9, det.tp - det.entry);
            }
            if (chasePct > 0.25) {
              const penalty = Math.min(40, Math.round((chasePct - 0.25) * 53));
              score = Math.max(0, det.score - penalty);
            }
          }

          const isSetupStage = det.stage === 'SQUEEZE' || det.stage === 'SQUEEZE_SHORT';
          if (score < (isSetupStage ? 65 : 55)) continue;

          results.push({
            symbol,
            interval,
            action:     det.action,
            type:       `ema_squeeze_${interval}_${det.stage.toLowerCase()}`,
            stage:      det.stage,
            score,
            grade:      score >= 85 ? 'A' : score >= 70 ? 'B' : score >= 55 ? 'C' : 'D',
            entry:      det.entry,
            altEntry:   det.altEntry,
            sl:         det.sl,
            tp:         det.tp,
            spreadPct:  det.spreadPct,
            baseRangePct: det.baseRangePct,
            breakoutVolRatio: det.breakoutVolRatio,
            pumpMovePct: det.pumpMovePct,
            squeezeBars: det.squeezeBars,
            tightBars:  det.tightBars,
            lbTotal:    det.lbTotal,
            rsi:        det.rsi,
            volRatio:   det.volRatio,
            ema13:      det.ema13,
            ema25:      det.ema25,
            ema99:      det.ema99,
            breakoutAge: det.breakoutAge,
            reason:     det.reason,
            note:       `${interval} | ${det.note}${chasePct > 0.1 ? ` | chase=${(chasePct * 100).toFixed(0)}%TP` : ''}`,
            markPrice:  markNow,
            change24h:  snap?.change24hPct,
            volume:     quoteVolume,
            scannedAt:  Date.now(),
          });
        }
      }
    } catch { /* skip */ }
  }

  // Sort: confirmed trước, setup sau; trong mỗi nhóm sort by score DESC
  const stageRank = { BREAKOUT: 0, BREAKDOWN: 1, SQUEEZE: 2, SQUEEZE_SHORT: 3 };
  const intervalRank = { '1h': 0, '15m': 1, '5m': 2 };
  results.sort((a, b) => {
    if (a.stage !== b.stage) return (stageRank[a.stage] ?? 9) - (stageRank[b.stage] ?? 9);
    if (a.interval !== b.interval) return (intervalRank[a.interval] ?? 9) - (intervalRank[b.interval] ?? 9);
    return b.score - a.score;
  });

  return { signals: results, processed };
}
