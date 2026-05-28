// ── Dump Ignition Detector ─────────────────────────────────────────────────────
// Detects squeeze → ribbon compression → bearish ignition candle (BB lower break)
// Two stages:
//   EARLY     – pre-ignition: close below ribbon + BB mid, not yet through BB lower
//   IGNITION  – full candle break: BB lower + vol spike + pivot break + EMA stack

export function detectDumpIgnition(candles, state = {}, cfg = {}) {
  // ── Config ──────────────────────────────────────────────────────────────────
  const C = Object.assign({
    searchBack:    120,
    scanTail:       12,
    bbLen:          20,
    bbK:             2,
    squeezePct:   0.25,
    lookbackBW:    200,
    atrPeriod:      14,
    volLB:          20,
    pivotLB:        30,
    microPivotLB:   12,
    // ribbon compression — loosened defaults vs original to catch real dumps
    maxRibbonPct:  0.015,  // 1.5% (was 0.8% — too tight for crypto)
    maxRibbonATR:    1.0,  // (was 0.6 — too tight)
    // STRICT ignition candle
    minBodyFrac:    0.50,
    maxLowerWickFrac: 0.30,
    minRangeATR:    1.0,
    volSpikeX:      1.8,
    // EARLY (pre-ignition)
    enableEarly:    true,
    requireMidBreak: true,
    allowLowerBandTouch: false,
    preBodyFrac:    0.40,
    preRangeATR:    0.70,
    preVolSpikeX:   1.20,
    // Live EMA
    useLiveEma:     true,
    liveRibbonLoosen: 1.30,
    liveBiasBoost:  0.15,
    // HTF
    minEma50SlopePct: 0.005,  // was 0.02 — too weak, lowered to 0.005
    // follow-through
    confirmBars:     2,
    // scoring
    passScore:      80,
    passScoreEarly: 75,
    W:    { squeeze: 20, ribbon: 15, bbBreak: 15, bodyQ: 15, vol: 15, alignment: 10, follow: 10 },
    Wpre: { squeeze: 25, ribbon: 20, midBreak: 15, bodyQ: 15, vol: 15, structure: 10, live: 10 },
    // execution
    entryAtrK:     0.10,
    slAtrK:         0.8,
    rMultipleTP:    2.5,
    priceDecimals:    6,
  }, cfg || {});

  // ── Guards ──────────────────────────────────────────────────────────────────
  const need = Math.max(C.searchBack, C.bbLen, C.atrPeriod, C.pivotLB) + 10;
  if (!Array.isArray(candles) || candles.length < need) {
    return { pass: false, reason: 'Not enough candles' };
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
  const stdev = (arr, mean) => {
    let v = 0;
    for (let i = 0; i < arr.length; i++) v += (arr[i] - mean) ** 2;
    return Math.sqrt(v / arr.length);
  };
  const percentile = (arr, p) => {
    if (!arr.length) return NaN;
    const a = [...arr].sort((x, y) => x - y);
    return a[Math.floor(p * (a.length - 1))];
  };
  const emaSeries = (arr, p) => {
    const a = 2 / (p + 1), out = new Array(arr.length);
    out[0] = arr[0];
    for (let i = 1; i < arr.length; i++) out[i] = a * arr[i] + (1 - a) * out[i - 1];
    return out;
  };
  const atrAt = (ei, period) => {
    let s = 0, c = 0;
    for (let i = Math.max(1, ei - period + 1); i <= ei; i++) {
      const tr = Math.max(H[i] - L[i], Math.abs(H[i] - Cc[i - 1]), Math.abs(L[i] - Cc[i - 1]));
      s += tr; c++;
    }
    return c ? s / c : 0;
  };
  const bbAt = (ei, len, k) => {
    const si = Math.max(0, ei - len + 1);
    const w  = Cc.slice(si, ei + 1);
    const m  = w.reduce((x, y) => x + y, 0) / w.length;
    const sd = stdev(w, m);
    return { mid: m, upper: m + k * sd, lower: m - k * sd };
  };
  const slopePctPerBar = (ser, bars) => {
    if (ser.length < bars + 1) return 0;
    const y1 = ser[ser.length - 1], y0 = ser[ser.length - 1 - bars];
    if (!isFinite(y1) || Math.abs(y1) < 1e-9) return 0;
    return ((y1 - y0) / bars) / Math.abs(y1) * 100;
  };
  const wickMetrics = (i) => {
    const r     = Math.max(1e-9, H[i] - L[i]);
    const body  = Math.abs(Cc[i] - O[i]);
    const upper = H[i] - Math.max(O[i], Cc[i]);
    const lower = Math.min(O[i], Cc[i]) - L[i];
    return { bodyFrac: body / r, upperFrac: upper / r, lowerFrac: lower / r };
  };
  const pivotLow  = (idx, lb) => { let p = L[idx]; for (let i = idx; i >= Math.max(2, idx - lb); i--) p = Math.min(p, L[i]); return p; };
  const pivotHigh = (idx, lb) => { let p = H[idx]; for (let i = idx; i >= Math.max(2, idx - lb); i--) p = Math.max(p, H[i]); return p; };

  // ── EMA series ──────────────────────────────────────────────────────────────
  const ema5  = emaSeries(Cc, 5);
  const ema13 = emaSeries(Cc, 13);
  const ema25 = emaSeries(Cc, 25);
  const ema50 = emaSeries(Cc, 50);

  // ── Bandwidth history → squeeze percentile ──────────────────────────────────
  const bwHist = [];
  for (let i = C.bbLen; i < n; i++) {
    const bb = bbAt(i, C.bbLen, C.bbK);
    bwHist.push((bb.upper - bb.lower) / Math.max(1e-9, bb.mid));
  }
  const bwP = percentile(bwHist.slice(-Math.min(bwHist.length, C.lookbackBW)), C.squeezePct);

  // ── Scan window — only the last scanTail bars ────────────────────────────────
  const from = Math.max(C.bbLen + 1, C.atrPeriod + 1, n - C.scanTail);
  let found = null, score = 0, stage = null;

  for (let i = from; i < n; i++) {
    const A      = atrAt(i - 1, C.atrPeriod);
    const bbPrev = bbAt(i - 1, C.bbLen, C.bbK);
    const bwPrev = (bbPrev.upper - bbPrev.lower) / Math.max(1e-9, bbPrev.mid);
    const squeezeOK = bwPrev <= bwP;

    const e5Prev = ema5[i - 1], e13Prev = ema13[i - 1], e25Prev = ema25[i - 1];
    const ribbonPrevWidth = Math.max(e5Prev, e13Prev, e25Prev) - Math.min(e5Prev, e13Prev, e25Prev);
    const ribbonPrevPct   = ribbonPrevWidth / Math.max(1e-9, Cc[i - 1]);
    const ribbonPrevATR   = ribbonPrevWidth / Math.max(1e-9, A);
    const ribbonOK = (ribbonPrevPct <= C.maxRibbonPct) && (ribbonPrevATR <= C.maxRibbonATR);

    const bbNow = bbAt(i, C.bbLen, C.bbK);
    const wm    = wickMetrics(i);
    const range = H[i] - L[i];
    const volAvg = sma(V, C.volLB, i - 1);
    const volX   = V[i] / Math.max(1e-9, volAvg);

    // ── EARLY stage ────────────────────────────────────────────────────────────
    if (C.enableEarly) {
      const hasLiveEMA = C.useLiveEma &&
        [state.ema5, state.ema13, state.ema25, state.ema50].every((v) => Number.isFinite(v));

      const e5Now  = hasLiveEMA ? state.ema5  : ema5[i];
      const e13Now = hasLiveEMA ? state.ema13 : ema13[i];
      const e25Now = hasLiveEMA ? state.ema25 : ema25[i];
      const e50Now = hasLiveEMA ? state.ema50 : ema50[i];

      const ribbonLiveWidth = Math.max(e5Now, e13Now, e25Now) - Math.min(e5Now, e13Now, e25Now);
      const ribbonLivePct   = ribbonLiveWidth / Math.max(1e-9, Cc[i]);
      const ribbonLiveOK    = ribbonLivePct <= C.maxRibbonPct * (hasLiveEMA ? C.liveRibbonLoosen : 1);

      const belowRibbon = Cc[i] < Math.min(e13Now, e25Now);
      const ema5Below13 = e5Now < e13Now;
      const midBreak    = Cc[i] < bbPrev.mid;
      const notLowerBand = C.allowLowerBandTouch
        ? true
        : (Cc[i] > bbPrev.lower && L[i] > bbPrev.lower);

      const liveBearish     = e5Now < e13Now && e13Now < e25Now;
      const liveFullBearish = liveBearish && e25Now < e50Now;
      const preVolNeed   = C.preVolSpikeX * (liveBearish ? (1 - C.liveBiasBoost) : 1);
      const preRangeNeed = C.preRangeATR  * (liveBearish ? (1 - C.liveBiasBoost) : 1);
      const passScoreEarlyAdj = C.passScoreEarly - (liveFullBearish ? 5 : liveBearish ? 3 : 0);

      const preBodyOK  = (Cc[i] < O[i]) && (wm.bodyFrac >= C.preBodyFrac);
      const preRangeOK = (range / Math.max(1e-9, A)) >= preRangeNeed;
      const preVolOK   = volX >= preVolNeed;

      if (squeezeOK && ribbonOK && ribbonLiveOK &&
          preBodyOK && preRangeOK && preVolOK &&
          belowRibbon && ema5Below13 &&
          (!C.requireMidBreak || midBreak) && notLowerBand) {

        const W = C.Wpre;
        let s = 0;
        const bwTight    = bwP > 0 ? Math.min(1, bwPrev / bwP) : 1;
        const ribLiveT   = Math.min(1, ribbonLivePct / (C.maxRibbonPct * (hasLiveEMA ? C.liveRibbonLoosen : 1)));
        const ribPrevT   = Math.min(1, ribbonPrevPct / C.maxRibbonPct);
        s += W.squeeze  * (1 - bwTight);
        s += W.ribbon   * (1 - (0.5 * ribLiveT + 0.5 * ribPrevT));
        if (C.requireMidBreak) s += W.midBreak;
        s += W.bodyQ    * Math.min(1, (wm.bodyFrac - C.preBodyFrac) / Math.max(0.01, 1 - C.preBodyFrac));
        s += W.vol      * Math.min(1, volX / preVolNeed);
        s += W.structure;
        if (hasLiveEMA) s += W.live * (liveFullBearish ? 1 : liveBearish ? 0.6 : 0);
        s = Math.round(Math.min(100, Math.max(0, s)));

        // Bug fix: only return if pass; otherwise continue to check next bar for STRICT
        if (s >= passScoreEarlyAdj) {
          const highPiv = pivotHigh(i, C.microPivotLB);
          const stop    = +((highPiv + C.slAtrK     * A).toFixed(C.priceDecimals));
          const retestRaw = Math.min(stop - A * 0.15, Math.max(Cc[i] + A * 0.25, bbPrev.mid));
          const entry   = +(retestRaw.toFixed(C.priceDecimals));
          const risk    = Math.max(1e-9, stop - entry);
          const tp      = +((entry - C.rMultipleTP * risk).toFixed(C.priceDecimals));
          return {
            pass: true, stage: 'EARLY', score: s,
            action: 'SHORT',
            entryPrice: entry, stopLoss: stop, takeProfit: tp,
            reason: 'Squeeze + ribbon nén → breakdown sớm, chờ hồi retest fail để SHORT',
            note: `liveEMA=${hasLiveEMA ? 'Y' : 'N'} | bias=${liveFullBearish ? 'full' : liveBearish ? 'soft' : 'none'} | volX=${volX.toFixed(2)} | rangeATR=${(range / Math.max(1e-9, A)).toFixed(2)} | ribbonPct=${(ribbonLivePct * 100).toFixed(2)}% | entryMode=retest`,
            meta: { idx: i, usedLiveEma: hasLiveEMA },
          };
        }
        // EARLY conditions met but score too low — continue to next bar (don't block STRICT)
        continue;
      }
    }

    // ── STRICT (ignition) stage ────────────────────────────────────────────────
    const bbBreakDn  = Cc[i] < bbNow.lower;
    const rangeOK    = range >= A * C.minRangeATR;
    const bodyOK     = (Cc[i] < O[i]) && (wm.bodyFrac >= C.minBodyFrac) && (wm.lowerFrac <= C.maxLowerWickFrac);
    const structLow  = Math.min(...L.slice(Math.max(0, i - C.pivotLB), i));
    const pivotBreak = L[i] <= structLow;

    // Use live EMA for alignment check if available (fix: STRICT also benefits from live EMA)
    const hasLive = C.useLiveEma &&
      [state.ema5, state.ema13, state.ema25, state.ema50].every((v) => Number.isFinite(v));
    const s5  = hasLive ? state.ema5  : ema5[i];
    const s13 = hasLive ? state.ema13 : ema13[i];
    const s25 = hasLive ? state.ema25 : ema25[i];
    const s50 = hasLive ? state.ema50 : ema50[i];

    const alignDown    = s5 < s13 && s13 < s25 && s25 < s50;
    const ema50Slope   = slopePctPerBar(ema50.slice(0, i + 1), 10);
    const ema50SlopeOK = ema50Slope <= -C.minEma50SlopePct;

    if (squeezeOK && ribbonOK && bbBreakDn && rangeOK && bodyOK &&
        volX >= C.volSpikeX && pivotBreak && alignDown && ema50SlopeOK) {

      // Bug fix: only check follow-through when we have enough bars ahead
      let follow = 0;
      if (i <= n - 1 - C.confirmBars) {
        follow = 1;
        for (let j = i + 1; j <= Math.min(n - 1, i + C.confirmBars); j++) {
          if (Cc[j] > H[i]) { follow = 0; break; }
        }
      }

      const W = C.W;
      let s = 0;
      const bwTight = bwP > 0 ? Math.min(1, bwPrev / bwP) : 1;
      const ribT    = Math.min(1, ribbonPrevPct / C.maxRibbonPct) * 0.5 +
                      Math.min(1, ribbonPrevATR / C.maxRibbonATR) * 0.5;
      s += W.squeeze   * (1 - bwTight);
      s += W.ribbon    * (1 - ribT);
      s += W.bbBreak   * Math.min(1, (bbNow.mid - Cc[i]) / Math.max(1e-9, bbNow.mid - bbNow.lower)); // continuous: how far below lower
      s += W.bodyQ     * Math.min(1, (wm.bodyFrac - C.minBodyFrac) / Math.max(0.01, 1 - C.minBodyFrac));
      s += W.vol       * Math.min(1, volX / C.volSpikeX);
      s += W.alignment; // flat — full EMA stack is binary
      s += W.follow    * follow;
      s = Math.round(Math.min(100, Math.max(0, s)));

      found = { idx: i, A, volX, score: s };
      stage = 'IGNITION';
      break;
    }
  }

  if (!found) return { pass: false, reason: 'No dump ignition in window' };

  // ── Execution for STRICT ─────────────────────────────────────────────────────
  const { idx: i, A, score: sc } = found;
  const stop  = +((Math.max(H[i], H[Math.max(0, i - 1)]) + C.slAtrK * A).toFixed(C.priceDecimals));
  const bb = bbAt(i, C.bbLen, C.bbK);
  const retestRaw = Math.min(stop - A * 0.15, Math.max(Cc[i] + A * 0.25, bb.lower));
  const entry = +(retestRaw.toFixed(C.priceDecimals));
  const risk  = Math.max(1e-9, stop - entry);
  const tp    = +((entry - C.rMultipleTP * risk).toFixed(C.priceDecimals));
  const pass  = sc >= C.passScore;

  return {
    pass,
    stage: 'IGNITION',
    score: sc,
    action: pass ? 'SHORT' : null,
    entryPrice: pass ? entry : undefined,
    stopLoss:   pass ? stop  : undefined,
    takeProfit: pass ? tp    : undefined,
    reason: pass
      ? 'Squeeze → ribbon nén → BB lower break, chờ hồi retest fail để SHORT'
      : 'IGNITION score below threshold',
    note: `volX=${found.volX.toFixed(2)} | ema50Slope=${slopePctPerBar(ema50, 10).toFixed(3)}%/bar | entryMode=retest`,
    meta: { idx: i },
  };
}

// ── Scanner ─────────────────────────────────────────────────────────────────────

function normalizeKline(k) {
  const candle = {
    open:   Number(k?.open   ?? k?.[1]),
    high:   Number(k?.high   ?? k?.[2]),
    low:    Number(k?.low    ?? k?.[3]),
    close:  Number(k?.close  ?? k?.[4]),
    volume: Number(k?.volume ?? k?.[5]),
  };
  return Object.values(candle).every(Number.isFinite) ? candle : null;
}

function clamp01(v) {
  return Math.max(0, Math.min(1, v));
}

function avg(values) {
  return values.length ? values.reduce((a, b) => a + b, 0) / values.length : NaN;
}

function detectPostPumpDumpRisk(candles, cfg = {}) {
  const C = Object.assign({
    lookback: 96,
    tail: 24,
    minRunupPct: 0.35,
    maxDrawdownFromPeakPct: 0.28,
    minRedVolShare: 0.52,
    minVolRecentX: 1.15,
    minCloseBelowEma: 0.001,
    minSupportBreakPct: 0.0015,
    minScore: 62,
    atrPeriod: 14,
    priceDecimals: 6,
  }, cfg || {});

  const n = candles.length;
  if (n < Math.max(120, C.lookback + 20)) return { pass: false, reason: 'Not enough candles' };

  const O = candles.map((c) => +c.open);
  const H = candles.map((c) => +c.high);
  const L = candles.map((c) => +c.low);
  const Cc = candles.map((c) => +c.close);
  const V = candles.map((c) => +c.volume);

  const ema = (arr, p) => {
    const out = new Array(arr.length);
    let e = arr[0];
    const a = 2 / (p + 1);
    out[0] = e;
    for (let i = 1; i < arr.length; i++) {
      e = a * arr[i] + (1 - a) * e;
      out[i] = e;
    }
    return out;
  };
  const rsi = (arr, period, endIdx) => {
    if (endIdx < period + 1) return NaN;
    let gains = 0, losses = 0;
    const start = Math.max(1, endIdx - period + 1);
    for (let i = start; i <= endIdx; i++) {
      const d = arr[i] - arr[i - 1];
      if (d > 0) gains += d; else losses -= d;
    }
    const ag = gains / period;
    const al = losses / period;
    return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  };
  const atr = (endIdx, period) => {
    let sum = 0, count = 0;
    for (let i = Math.max(1, endIdx - period + 1); i <= endIdx; i++) {
      sum += Math.max(H[i] - L[i], Math.abs(H[i] - Cc[i - 1]), Math.abs(L[i] - Cc[i - 1]));
      count++;
    }
    return count ? sum / count : NaN;
  };

  const start = n - C.lookback;
  const last = n - 1;
  let lowIdx = start;
  for (let i = start + 1; i < last; i++) {
    if (L[i] < L[lowIdx]) lowIdx = i;
  }
  let peakIdx = lowIdx;
  for (let i = lowIdx + 1; i < last; i++) {
    if (H[i] > H[peakIdx]) peakIdx = i;
  }
  if (peakIdx <= lowIdx + 4) return { pass: false, reason: 'no mature pump leg' };

  const runupPct = (H[peakIdx] - L[lowIdx]) / Math.max(L[lowIdx], 1e-9);
  if (runupPct < C.minRunupPct) return { pass: false, reason: 'runup too small' };

  const barsAfterPeak = last - peakIdx;
  if (barsAfterPeak < 4 || barsAfterPeak > C.tail) return { pass: false, reason: 'peak not in distribution window' };

  const peakHigh = H[peakIdx];
  const drawdownFromPeak = (peakHigh - Cc[last]) / Math.max(peakHigh, 1e-9);
  if (drawdownFromPeak > C.maxDrawdownFromPeakPct) return { pass: false, reason: 'already dumped too far' };

  const distStart = Math.max(peakIdx, last - C.tail + 1);
  const priorStart = Math.max(start, distStart - 40);
  const priorVol = avg(V.slice(priorStart, distStart));
  const recentVol = avg(V.slice(distStart, last + 1));
  const volRecentX = recentVol / Math.max(priorVol, 1e-9);

  let redVol = 0, totalVol = 0, lowerHighs = 0;
  for (let i = distStart; i <= last; i++) {
    totalVol += V[i];
    if (Cc[i] < O[i]) redVol += V[i];
    if (i > distStart && H[i] < H[i - 1]) lowerHighs++;
  }
  const redVolShare = redVol / Math.max(totalVol, 1e-9);

  const ema13 = ema(Cc, 13);
  const ema25 = ema(Cc, 25);
  const closeBelowEma13 = (ema13[last] - Cc[last]) / Math.max(ema13[last], 1e-9);
  const emaBearTurn = ema13[last] < ema25[last] || closeBelowEma13 >= C.minCloseBelowEma;

  const supportStart = Math.max(distStart, last - 12);
  const microSupport = Math.min(...L.slice(supportStart, last));
  const supportBreakPct = (microSupport - Cc[last]) / Math.max(microSupport, 1e-9);
  const supportBreak = supportBreakPct >= C.minSupportBreakPct;

  const rsiNow = rsi(Cc, 14, last);
  let rsiHigh = -Infinity;
  for (let i = Math.max(start + 20, peakIdx - 12); i <= Math.min(last, peakIdx + 8); i++) {
    const v = rsi(Cc, 14, i);
    if (Number.isFinite(v)) rsiHigh = Math.max(rsiHigh, v);
  }
  const rsiFade = Number.isFinite(rsiNow) && Number.isFinite(rsiHigh) ? Math.max(0, rsiHigh - rsiNow) : 0;

  const A = atr(last, C.atrPeriod);
  const lastRange = H[last] - L[last];
  const lastBody = Math.abs(Cc[last] - O[last]);
  const redTrigger = Cc[last] < O[last] && lastBody / Math.max(lastRange, 1e-9) >= 0.35;

  const score = Math.round(100 * (
    clamp01((runupPct - C.minRunupPct) / 1.2) * 0.20 +
    clamp01(volRecentX / 2.5) * 0.16 +
    clamp01((redVolShare - 0.45) / 0.35) * 0.18 +
    clamp01(rsiFade / 35) * 0.14 +
    (emaBearTurn ? 0.14 : 0) +
    (supportBreak ? 0.12 : 0) +
    (redTrigger ? 0.06 : 0)
  ));

  if (score < C.minScore) return { pass: false, reason: `score too low (${score})` };

  const entry = Cc[last];
  const distHigh = Math.max(...H.slice(distStart, last + 1));
  const stop = +(Math.max(distHigh, entry + (Number.isFinite(A) ? A * 1.2 : entry * 0.04)).toFixed(C.priceDecimals));
  const risk = Math.max(stop - entry, entry * 0.01);
  const tp = +(Math.max(entry - risk * 2.2, entry * 0.55).toFixed(C.priceDecimals));

  return {
    pass: true,
    stage: 'RISK',
    score,
    action: 'SHORT',
    entryPrice: +entry.toFixed(C.priceDecimals),
    stopLoss: stop,
    takeProfit: tp,
    reason: 'Post-pump distribution risk: tăng mạnh xong yếu dần, red volume chiếm ưu thế, bắt đầu gãy hỗ trợ/EMA',
    note: `POST_PUMP_RISK | runup=${(runupPct * 100).toFixed(1)}% | drawdown=${(drawdownFromPeak * 100).toFixed(1)}% | redVolShare=${(redVolShare * 100).toFixed(0)}% | volRecent=${volRecentX.toFixed(2)}x | rsiFade=${rsiFade.toFixed(1)} | supportBreak=${(supportBreakPct * 100).toFixed(2)}% | lowerHighs=${lowerHighs}`,
    meta: { idx: last },
  };
}

function detectPostDumpBounceRisk(candles, cfg = {}) {
  const C = Object.assign({
    lookback: 96,
    tail: 24,
    minDumpPct: 0.30,
    maxBounceFromLowPct: 0.30,
    minGreenVolShare: 0.52,
    minVolRecentX: 1.10,
    minCloseAboveEma: 0.001,
    minResistanceBreakPct: 0.0015,
    minScore: 66,
    atrPeriod: 14,
    priceDecimals: 6,
  }, cfg || {});

  const n = candles.length;
  if (n < Math.max(120, C.lookback + 20)) return { pass: false, reason: 'Not enough candles' };

  const O = candles.map((c) => +c.open);
  const H = candles.map((c) => +c.high);
  const L = candles.map((c) => +c.low);
  const Cc = candles.map((c) => +c.close);
  const V = candles.map((c) => +c.volume);

  const ema = (arr, p) => {
    const out = new Array(arr.length);
    let e = arr[0];
    const a = 2 / (p + 1);
    out[0] = e;
    for (let i = 1; i < arr.length; i++) {
      e = a * arr[i] + (1 - a) * e;
      out[i] = e;
    }
    return out;
  };
  const rsi = (arr, period, endIdx) => {
    if (endIdx < period + 1) return NaN;
    let gains = 0, losses = 0;
    const start = Math.max(1, endIdx - period + 1);
    for (let i = start; i <= endIdx; i++) {
      const d = arr[i] - arr[i - 1];
      if (d > 0) gains += d; else losses -= d;
    }
    const ag = gains / period;
    const al = losses / period;
    return al === 0 ? 100 : 100 - 100 / (1 + ag / al);
  };
  const atr = (endIdx, period) => {
    let sum = 0, count = 0;
    for (let i = Math.max(1, endIdx - period + 1); i <= endIdx; i++) {
      sum += Math.max(H[i] - L[i], Math.abs(H[i] - Cc[i - 1]), Math.abs(L[i] - Cc[i - 1]));
      count++;
    }
    return count ? sum / count : NaN;
  };

  const start = n - C.lookback;
  const last = n - 1;
  let highIdx = start;
  for (let i = start + 1; i < last; i++) {
    if (H[i] > H[highIdx]) highIdx = i;
  }
  let lowIdx = highIdx;
  for (let i = highIdx + 1; i < last; i++) {
    if (L[i] < L[lowIdx]) lowIdx = i;
  }
  if (lowIdx <= highIdx + 4) return { pass: false, reason: 'no mature dump leg' };

  const dumpPct = (H[highIdx] - L[lowIdx]) / Math.max(H[highIdx], 1e-9);
  if (dumpPct < C.minDumpPct) return { pass: false, reason: 'dump too small' };

  const barsAfterLow = last - lowIdx;
  if (barsAfterLow < 4 || barsAfterLow > C.tail) return { pass: false, reason: 'low not in accumulation window' };

  const lowPrice = L[lowIdx];
  const bounceFromLow = (Cc[last] - lowPrice) / Math.max(lowPrice, 1e-9);
  if (bounceFromLow > C.maxBounceFromLowPct) return { pass: false, reason: 'already bounced too far' };

  const accStart = Math.max(lowIdx, last - C.tail + 1);
  const priorStart = Math.max(start, accStart - 40);
  const priorVol = avg(V.slice(priorStart, accStart));
  const recentVol = avg(V.slice(accStart, last + 1));
  const volRecentX = recentVol / Math.max(priorVol, 1e-9);

  let greenVol = 0, totalVol = 0, higherLows = 0;
  for (let i = accStart; i <= last; i++) {
    totalVol += V[i];
    if (Cc[i] > O[i]) greenVol += V[i];
    if (i > accStart && L[i] > L[i - 1]) higherLows++;
  }
  const greenVolShare = greenVol / Math.max(totalVol, 1e-9);

  const ema13 = ema(Cc, 13);
  const ema25 = ema(Cc, 25);
  const closeAboveEma13 = (Cc[last] - ema13[last]) / Math.max(ema13[last], 1e-9);
  const emaBullTurn = ema13[last] > ema25[last] || closeAboveEma13 >= C.minCloseAboveEma;

  const resistanceStart = Math.max(accStart, last - 12);
  const microResistance = Math.max(...H.slice(resistanceStart, last));
  const resistanceBreakPct = (Cc[last] - microResistance) / Math.max(microResistance, 1e-9);
  const resistanceBreak = resistanceBreakPct >= C.minResistanceBreakPct;

  const rsiNow = rsi(Cc, 14, last);
  let rsiLow = Infinity;
  for (let i = Math.max(start + 20, lowIdx - 12); i <= Math.min(last, lowIdx + 8); i++) {
    const v = rsi(Cc, 14, i);
    if (Number.isFinite(v)) rsiLow = Math.min(rsiLow, v);
  }
  const rsiRecover = Number.isFinite(rsiNow) && Number.isFinite(rsiLow) ? Math.max(0, rsiNow - rsiLow) : 0;

  const A = atr(last, C.atrPeriod);
  const lastRange = H[last] - L[last];
  const lastBody = Math.abs(Cc[last] - O[last]);
  const greenTrigger = Cc[last] > O[last] && lastBody / Math.max(lastRange, 1e-9) >= 0.35;

  const score = Math.round(100 * (
    clamp01((dumpPct - C.minDumpPct) / 0.75) * 0.20 +
    clamp01(volRecentX / 2.2) * 0.14 +
    clamp01((greenVolShare - 0.45) / 0.35) * 0.18 +
    clamp01(rsiRecover / 35) * 0.16 +
    (emaBullTurn ? 0.14 : 0) +
    (resistanceBreak ? 0.12 : 0) +
    (greenTrigger ? 0.06 : 0)
  ));

  if (score < C.minScore) return { pass: false, reason: `score too low (${score})` };

  const entry = Cc[last];
  const accLow = Math.min(...L.slice(accStart, last + 1));
  const stop = +(Math.min(accLow, entry - (Number.isFinite(A) ? A * 1.2 : entry * 0.04)).toFixed(C.priceDecimals));
  const risk = Math.max(entry - stop, entry * 0.01);
  const tp = +(Math.min(entry + risk * 2.2, entry * 1.8).toFixed(C.priceDecimals));

  return {
    pass: true,
    stage: 'BOUNCE_RISK',
    score,
    action: 'LONG',
    entryPrice: +entry.toFixed(C.priceDecimals),
    stopLoss: stop,
    takeProfit: tp,
    reason: 'Post-dump bounce risk: dump mạnh xong bán yếu dần, green volume hồi, bắt đầu reclaim kháng cự/EMA',
    note: `POST_DUMP_BOUNCE | dump=${(dumpPct * 100).toFixed(1)}% | bounce=${(bounceFromLow * 100).toFixed(1)}% | greenVolShare=${(greenVolShare * 100).toFixed(0)}% | volRecent=${volRecentX.toFixed(2)}x | rsiRecover=${rsiRecover.toFixed(1)} | resistanceBreak=${(resistanceBreakPct * 100).toFixed(2)}% | higherLows=${higherLows}`,
    meta: { idx: last },
  };
}

export async function runDumpIgnitionScan(symbols, klineCache, snapshotMap) {
  const results  = [];
  let processed = 0;

  for (const symbol of symbols) {
    try {
      const raw = klineCache.getIfCached(symbol, '15m', 200);
      if (!raw || raw.length < 140) continue;

      // Normalise kline format → { open, high, low, close, volume }
      const candles = raw.map(normalizeKline);
      if (candles.some((c) => !c)) continue;
      processed++;

      const snap = snapshotMap.get(symbol);

      // Feed live EMA from snapshot / pre-computed indicators if available
      const state = {};
      if (snap) {
        // Use mark price as the latest close for EMA streaming
        if (snap.markPrice) state.markPrice = snap.markPrice;
      }

      const ignition = detectDumpIgnition(candles, state);
      const risk = detectPostPumpDumpRisk(candles);
      const bounce = detectPostDumpBounceRisk(candles);
      const det = ignition.pass ? ignition : risk.pass ? risk : bounce;
      if (!det.pass || !det.action) continue;

      // Chase penalty — same logic as pumpDetector
      const markNow = snap?.markPrice;
      let chasePct   = 0;
      let chaseScore = det.score;
      if (markNow && det.entryPrice && det.takeProfit && det.takeProfit !== det.entryPrice) {
        if (det.action === 'SHORT' && markNow < det.entryPrice) {
          chasePct = (det.entryPrice - markNow) / Math.max(1e-9, det.entryPrice - det.takeProfit);
        } else if (det.action === 'LONG' && markNow > det.entryPrice) {
          chasePct = (markNow - det.entryPrice) / Math.max(1e-9, det.takeProfit - det.entryPrice);
        }
        chasePct = Math.max(0, chasePct);
        if (chasePct > 0.25) {
          const penalty = Math.min(40, Math.round((chasePct - 0.25) * 53));
          chaseScore = Math.max(0, det.score - penalty);
        }
      }

      results.push({
        symbol,
        action:    det.action,
        type:      det.stage === 'BOUNCE_RISK' ? 'post_dump_bounce_risk' : det.stage === 'RISK' ? 'post_pump_dump_risk' : det.stage === 'EARLY' ? 'dump_ignition_early' : 'dump_ignition',
        score:     chaseScore,
        grade:     chaseScore >= 85 ? 'A' : chaseScore >= 70 ? 'B' : chaseScore >= 55 ? 'C' : 'D',
        entry:     det.entryPrice,
        altEntry:  det.entryPrice,
        sl:        det.stopLoss,
        tp:        det.takeProfit,
        reason:    det.reason,
        note:      det.note + (chasePct > 0.1 ? ` | chase=${(chasePct * 100).toFixed(0)}%TP` : ''),
        blockShort: false,
        markPrice: markNow,
        change24h: snap?.change24hPct,
        volume:    snap?.quoteVolume,
        scannedAt: Date.now(),
      });
    } catch { /* skip bad symbol */ }
  }

  return { signals: results.sort((a, b) => b.score - a.score), processed };
}
