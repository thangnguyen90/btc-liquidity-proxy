// ── Pump Ignition Detector ──────────────────────────────────────────────────────
// Mirror of dumpIgnitionDetector — detects squeeze → ribbon compression → bullish BB upper break
// Two stages:
//   EARLY     – pre-ignition: close above ribbon + BB mid, not yet through BB upper
//   IGNITION  – full candle break: BB upper + vol spike + pivot high break + EMA5>13>25
//
// Kill-short trap filter: if RSI14 ≥ 72 at ignition candle → reduce score (likely fake pump)

export function detectPumpIgnition(candles, state = {}, cfg = {}) {
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
    // ribbon compression
    maxRibbonPct:  0.015,
    maxRibbonATR:    1.0,
    // STRICT ignition candle (bullish)
    minBodyFrac:    0.50,
    maxUpperWickFrac: 0.30,   // upper wick ≤ 30% of range (no chase top)
    minRangeATR:    1.0,
    volSpikeX:      1.8,
    // Kill-short trap: penalise if RSI too hot
    rsiKillTrapThreshold: 72,   // RSI ≥ 72 → likely kill-short, -20 pts
    rsiWarnThreshold:     65,   // RSI ≥ 65 → warn, -8 pts
    // EARLY (pre-ignition)
    enableEarly:    true,
    requireMidBreak: true,
    allowUpperBandTouch: false,
    preBodyFrac:    0.40,
    preRangeATR:    0.70,
    preVolSpikeX:   1.20,
    // Live EMA
    useLiveEma:     true,
    liveRibbonLoosen: 1.30,
    liveBiasBoost:  0.15,
    // HTF — EMA50 slope positive (optional, looser than dump)
    requireEma50Align: false,  // EMA50 alignment NOT required for LONG (too slow)
    minEma50SlopePct: 0.003,   // if required, slope ≥ +0.003%/bar
    // follow-through
    confirmBars:     2,
    // scoring
    passScore:      70,
    passScoreEarly: 65,
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
  const pivotHigh = (idx, lb) => { let p = H[idx]; for (let i = idx; i >= Math.max(2, idx - lb); i--) p = Math.max(p, H[i]); return p; };
  const pivotLow  = (idx, lb) => { let p = L[idx]; for (let i = idx; i >= Math.max(2, idx - lb); i--) p = Math.min(p, L[i]); return p; };

  // RSI14 — for kill-short trap detection
  const calcRsi = (arr, p = 14) => {
    if (arr.length < p + 1) return NaN;
    let gain = 0, loss = 0;
    const st = arr.length - p;
    for (let i = st; i < arr.length; i++) {
      const d = arr[i] - arr[i - 1];
      if (d > 0) gain += d; else loss -= d;
    }
    const rs = gain / Math.max(1e-9, loss);
    return 100 - 100 / (1 + rs);
  };

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

  // ── Scan window ─────────────────────────────────────────────────────────────
  const from = Math.max(C.bbLen + 1, C.atrPeriod + 1, n - C.scanTail);
  let found = null, stage = null;

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

    const bbNow  = bbAt(i, C.bbLen, C.bbK);
    const wm     = wickMetrics(i);
    const range  = H[i] - L[i];
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

      // LONG conditions — flipped from dump
      const aboveRibbon  = Cc[i] > Math.max(e13Now, e25Now);
      const ema5Above13  = e5Now > e13Now;
      const midBreak     = Cc[i] > bbPrev.mid;
      // Not yet at upper band (it's EARLY — breakout not happened)
      const notUpperBand = C.allowUpperBandTouch
        ? true
        : (Cc[i] < bbPrev.upper && H[i] < bbPrev.upper);

      const liveBullish     = e5Now > e13Now && e13Now > e25Now;
      const liveFullBullish = liveBullish && e25Now > e50Now;
      const preVolNeed   = C.preVolSpikeX * (liveBullish ? (1 - C.liveBiasBoost) : 1);
      const preRangeNeed = C.preRangeATR  * (liveBullish ? (1 - C.liveBiasBoost) : 1);
      const passScoreEarlyAdj = C.passScoreEarly - (liveFullBullish ? 5 : liveBullish ? 3 : 0);

      // Bullish candle for EARLY
      const preBodyOK  = (Cc[i] > O[i]) && (wm.bodyFrac >= C.preBodyFrac);
      const preRangeOK = (range / Math.max(1e-9, A)) >= preRangeNeed;
      const preVolOK   = volX >= preVolNeed;

      if (squeezeOK && ribbonOK && ribbonLiveOK &&
          preBodyOK && preRangeOK && preVolOK &&
          aboveRibbon && ema5Above13 &&
          (!C.requireMidBreak || midBreak) && notUpperBand) {

        const W = C.Wpre;
        let s = 0;
        const bwTight  = bwP > 0 ? Math.min(1, bwPrev / bwP) : 1;
        const ribLiveT = Math.min(1, ribbonLivePct / (C.maxRibbonPct * (hasLiveEMA ? C.liveRibbonLoosen : 1)));
        const ribPrevT = Math.min(1, ribbonPrevPct / C.maxRibbonPct);
        s += W.squeeze  * (1 - bwTight);
        s += W.ribbon   * (1 - (0.5 * ribLiveT + 0.5 * ribPrevT));
        if (C.requireMidBreak) s += W.midBreak;
        s += W.bodyQ    * Math.min(1, (wm.bodyFrac - C.preBodyFrac) / Math.max(0.01, 1 - C.preBodyFrac));
        s += W.vol      * Math.min(1, volX / preVolNeed);
        s += W.structure;
        if (hasLiveEMA) s += W.live * (liveFullBullish ? 1 : liveBullish ? 0.6 : 0);
        s = Math.round(Math.min(100, Math.max(0, s)));

        if (s >= passScoreEarlyAdj) {
          const highPiv = pivotHigh(i, C.microPivotLB);
          const lowPiv  = pivotLow(i, C.microPivotLB);
          const entry   = +((highPiv + C.entryAtrK * A).toFixed(C.priceDecimals));
          const stop    = +((lowPiv  - C.slAtrK    * A).toFixed(C.priceDecimals));
          const risk    = Math.max(1e-9, entry - stop);
          const tp      = +((entry + C.rMultipleTP * risk).toFixed(C.priceDecimals));
          return {
            pass: true, stage: 'EARLY', score: s,
            action: 'LONG',
            entryPrice: entry, stopLoss: stop, takeProfit: tp,
            reason: 'Squeeze + ribbon nén → close trên ribbon/BB mid, vol/range uptick',
            note: `liveEMA=${hasLiveEMA ? 'Y' : 'N'} | bias=${liveFullBullish ? 'full' : liveBullish ? 'soft' : 'none'} | volX=${volX.toFixed(2)} | rangeATR=${(range / Math.max(1e-9, A)).toFixed(2)} | ribbonPct=${(ribbonLivePct * 100).toFixed(2)}%`,
            meta: { idx: i, usedLiveEma: hasLiveEMA },
          };
        }
        continue;
      }
    }

    // ── STRICT (ignition) stage ────────────────────────────────────────────────
    const bbBreakUp   = Cc[i] > bbNow.upper;
    const rangeOK     = range >= A * C.minRangeATR;
    // Bullish candle: close > open, body ≥ threshold, upper wick (chase top) ≤ threshold
    const bodyOK      = (Cc[i] > O[i]) && (wm.bodyFrac >= C.minBodyFrac) && (wm.upperFrac <= C.maxUpperWickFrac);
    const structHigh  = Math.max(...H.slice(Math.max(0, i - C.pivotLB), i));
    const pivotBreak  = H[i] >= structHigh;

    // EMA alignment — only EMA5 > 13 > 25 (no EMA50 required for LONG as discussed)
    const hasLive = C.useLiveEma &&
      [state.ema5, state.ema13, state.ema25, state.ema50].every((v) => Number.isFinite(v));
    const s5  = hasLive ? state.ema5  : ema5[i];
    const s13 = hasLive ? state.ema13 : ema13[i];
    const s25 = hasLive ? state.ema25 : ema25[i];
    const s50 = hasLive ? state.ema50 : ema50[i];

    // Only require 3-EMA alignment (not EMA50) for pump ignition
    const alignUp = s5 > s13 && s13 > s25;

    // EMA50 — optional positive slope check
    const ema50Slope   = slopePctPerBar(ema50.slice(0, i + 1), 10);
    const ema50SlopeOK = !C.requireEma50Align || (ema50Slope >= C.minEma50SlopePct);

    if (squeezeOK && ribbonOK && bbBreakUp && rangeOK && bodyOK &&
        volX >= C.volSpikeX && pivotBreak && alignUp && ema50SlopeOK) {

      // Follow-through check (price stayed above breakout candle low)
      let follow = 0;
      if (i <= n - 1 - C.confirmBars) {
        follow = 1;
        for (let j = i + 1; j <= Math.min(n - 1, i + C.confirmBars); j++) {
          if (Cc[j] < L[i]) { follow = 0; break; }
        }
      }

      // RSI kill-short trap penalty
      const rsiNow = calcRsi(Cc.slice(0, i + 1), 14);
      let rsiPenalty = 0;
      let killTrapFlag = false;
      if (isFinite(rsiNow)) {
        if (rsiNow >= C.rsiKillTrapThreshold) {
          rsiPenalty = 20;
          killTrapFlag = true;
        } else if (rsiNow >= C.rsiWarnThreshold) {
          rsiPenalty = 8;
        }
      }

      const W = C.W;
      let s = 0;
      const bwTight = bwP > 0 ? Math.min(1, bwPrev / bwP) : 1;
      const ribT    = Math.min(1, ribbonPrevPct / C.maxRibbonPct) * 0.5 +
                      Math.min(1, ribbonPrevATR / C.maxRibbonATR) * 0.5;
      s += W.squeeze   * (1 - bwTight);
      s += W.ribbon    * (1 - ribT);
      // continuous BB break score: how far above upper
      s += W.bbBreak   * Math.min(1, (Cc[i] - bbNow.mid) / Math.max(1e-9, bbNow.upper - bbNow.mid));
      s += W.bodyQ     * Math.min(1, (wm.bodyFrac - C.minBodyFrac) / Math.max(0.01, 1 - C.minBodyFrac));
      s += W.vol       * Math.min(1, volX / C.volSpikeX);
      s += W.alignment; // flat — EMA5>13>25 alignment is binary
      s += W.follow    * follow;
      s = Math.round(Math.min(100, Math.max(0, s - rsiPenalty)));

      found = {
        idx: i, A, volX, score: s,
        rsiNow: isFinite(rsiNow) ? +rsiNow.toFixed(1) : null,
        killTrapFlag,
        ema50Slope: +ema50Slope.toFixed(3),
        ema50AlignFull: s5 > s13 && s13 > s25 && s25 > s50,
      };
      stage = 'IGNITION';
      break;
    }
  }

  if (!found) return { pass: false, reason: 'No pump ignition in window' };

  // ── Execution for STRICT ─────────────────────────────────────────────────────
  const { idx: i, A, score: sc } = found;
  const entry = +((H[i]                                    + C.entryAtrK * A).toFixed(C.priceDecimals));
  const stop  = +((Math.min(L[i], L[Math.max(0, i - 1)]) - C.slAtrK    * A).toFixed(C.priceDecimals));
  const risk  = Math.max(1e-9, entry - stop);
  const tp    = +((entry + C.rMultipleTP * risk).toFixed(C.priceDecimals));
  const pass  = sc >= C.passScore;

  const rsiNote = found.rsiNow != null
    ? ` | rsi14=${found.rsiNow}${found.killTrapFlag ? ' ⚠killTrap' : ''}`
    : '';

  return {
    pass,
    stage: 'IGNITION',
    score: sc,
    action: pass ? 'LONG' : null,
    entryPrice: pass ? entry : undefined,
    stopLoss:   pass ? stop  : undefined,
    takeProfit: pass ? tp    : undefined,
    reason: pass
      ? 'Squeeze → ribbon nén → BB upper break + vol spike + pivot break'
      : 'IGNITION score below threshold',
    note: `volX=${found.volX.toFixed(2)} | ema50Slope=${found.ema50Slope}%/bar${rsiNote}`,
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

export async function runPumpIgnitionScan(symbols, klineCache, snapshotMap, opts = {}) {
  const { btcBias = 'neutral' } = opts;
  const results  = [];
  let processed = 0;

  for (const symbol of symbols) {
    try {
      const raw = klineCache.getIfCached(symbol, '15m', 200);
      if (!raw || raw.length < 140) continue;

      const candles = raw.map(normalizeKline);
      if (candles.some((c) => !c)) continue;
      processed++;

      const snap = snapshotMap.get(symbol);
      const state = {};
      if (snap?.markPrice) state.markPrice = snap.markPrice;

      const det = detectPumpIgnition(candles, state);
      if (!det.pass || !det.action) continue;

      // BTC health block — bearish BTC = no LONG
      if (btcBias === 'bearish') {
        console.log(`[PumpIgnition] ⛔ ${symbol} block — BTC bias=bearish`);
        continue;
      }

      // Chase penalty — LONG: if mark price already ran above entry
      const markNow = snap?.markPrice;
      let chasePct   = 0;
      let chaseScore = det.score;
      if (markNow && det.entryPrice && det.takeProfit) {
        if (markNow > det.entryPrice) {
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
        type:      det.stage === 'EARLY' ? 'pump_ignition_early' : 'pump_ignition',
        score:     chaseScore,
        grade:     chaseScore >= 85 ? 'A' : chaseScore >= 70 ? 'B' : chaseScore >= 55 ? 'C' : 'D',
        entry:     det.entryPrice,
        altEntry:  det.entryPrice,
        sl:        det.stopLoss,
        tp:        det.takeProfit,
        reason:    det.reason,
        note:      det.note + (chasePct > 0.1 ? ` | chase=${(chasePct * 100).toFixed(0)}%TP` : ''),
        markPrice: markNow,
        change24h: snap?.change24hPct,
        volume:    snap?.quoteVolume,
        scannedAt: Date.now(),
      });
    } catch { /* skip bad symbol */ }
  }

  return { signals: results.sort((a, b) => b.score - a.score), processed };
}
