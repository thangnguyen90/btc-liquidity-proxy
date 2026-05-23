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

export function computeIndicators(klines) {
  const closes  = klines.map((k) => +k.close);
  const volumes = klines.map((k) => +k.volume);
  return {
    recentCloses:  closes,
    recentVolumes: volumes,
    ema5:  calcEma(closes, 5),
    ema13: calcEma(closes, 13),
    ema25: calcEma(closes, 25),
    ema50: calcEma(closes, 50),
    ema99: calcEma(closes, 99),
    rsi6:  calcRsi(closes, 6),
    rsi12: calcRsi(closes, 12),
    rsi14: calcRsi(closes, 14),
  };
}

// ── Scan orchestrator ──────────────────────────────────────────────────────────

export async function runPumpScan(symbols, klineCache, snapshotMap) {
  const results = [];
  let processed = 0;
  for (const symbol of symbols) {
    try {
      const klines = klineCache.getIfCached(symbol, '15m', 200);
      if (!klines || klines.length < 40) continue; // skip — no REST fallback
      processed++;

      const state = computeIndicators(klines);
      const snap  = snapshotMap.get(symbol);
      if (snap) state.price = snap.markPrice;

      const det = detectPumpClimaxSimpleActionNew(klines, state, null);
      if (!det.pass) continue;

      const setup = det.action === 'LONG' ? det.longSetup : det.shortSetup;

      let type = 'unknown';
      if (det.action === 'LONG') {
        const r = setup?.reason ?? '';
        type = r.includes('EMA pullback') ? 'ema_pullback' : setup?.isPumpEarly ? 'early_pump' : 'pump_breakout';
      } else {
        const r = setup?.reason ?? '';
        if (r.includes('Distribution top'))                      type = 'dist_top';
        else if (r.includes('Volume climax'))                    type = 'vol_climax';
        else if (r.includes('Fade') || r.includes('fade'))       type = 'fade_short';
        else if (r.includes('Early dump') || r.includes('breakdown')) type = 'early_dump';
        else if (r.includes('Sustained dump'))                   type = 'dump';
        else                                                     type = 'climax_top';
      }

      // ── Chase penalty ─────────────────────────────────────────────────────────
      // Nếu giá hiện tại đã vượt entry và chạy vào TP range → trừ điểm
      // chasePct = phần trăm TP range đã bị consume bởi giá
      const rawScore   = setup?.score ?? 0;
      const entryPrice = setup?.entry;
      const tpPrice    = setup?.tp;
      const markNow    = snap?.markPrice;
      let chasePct  = 0;
      let chaseScore = rawScore;

      if (markNow && entryPrice && tpPrice && tpPrice !== entryPrice) {
        if (det.action === 'LONG' && markNow > entryPrice) {
          chasePct = (markNow - entryPrice) / (tpPrice - entryPrice); // >0 = đã chạy vào TP
        } else if (det.action === 'SHORT' && markNow < entryPrice) {
          chasePct = (entryPrice - markNow) / (entryPrice - tpPrice);
        }
        chasePct = Math.max(0, chasePct);

        // Penalty: bắt đầu trừ khi đã chạy >25% TP range
        // 50% consumed → -15pts; 75% → -28pts; 100% → -40pts (cap)
        if (chasePct > 0.25) {
          const penaltyPts = Math.min(40, Math.round((chasePct - 0.25) * 53));
          chaseScore = Math.max(0, rawScore - penaltyPts);
        }
      }

      const chaseNote = chasePct > 0.1
        ? ` | chase=${(chasePct * 100).toFixed(0)}%TP`
        : '';

      results.push({
        symbol,
        action:    det.action,
        type,
        score:     chaseScore,
        grade:     chaseScore >= 85 ? 'A' : chaseScore >= 70 ? 'B' : chaseScore >= 55 ? 'C' : 'D',
        entry:     entryPrice,
        altEntry:  setup?.altEntry,
        sl:        setup?.sl,
        tp:        tpPrice,
        reason:    det.reason,
        note:      (det.note ?? '') + chaseNote,
        factors:   { ...(setup?.factors ?? {}), chasePct: chasePct > 0.01 ? +chasePct.toFixed(2) : undefined },
        marketOk:  det.longSetup?.marketOk ?? null,
        blockShort: det.blockShort,
        markPrice: markNow,
        change24h: snap?.change24hPct,
        volume:    snap?.quoteVolume,
        scannedAt: Date.now(),
      });
    } catch { /* skip bad symbol */ }
  }
  return { signals: results.sort((a, b) => b.score - a.score), processed };
}

// ── Detector ───────────────────────────────────────────────────────────────────
// Bug fixes applied vs original:
//   1. pctDistSigned / pctToPct defined here (were missing, caused ReferenceError)
//   2. longSetup.pass uses scoreLong >= 55 (grade C+) instead of penalty < 1%
//   3. Early dump uses SCORE_WEIGHTS_LONG intentionally (same factor keys, bearish mirror)

function detectPumpClimaxSimpleActionNew(candles, state, opts) {
  // helpers missing from original ─ defined here
  function pctDistSigned(px, ema) {
    if (!isFiniteNum(px) || !isFiniteNum(ema) || ema === 0) return NaN;
    return ((px - ema) / ema) * 100;
  }
  function pctToPct(v) {
    return isFiniteNum(v) ? Math.round(v * 100) / 100 : null;
  }

  var CFG = {
    consolLen: 12,
    consolMaxRangePct: 0.022,
    bbLen: 20, bbStd: 2,
    squeezePct: 0.12,
    volLookback: 20,
    volSpike: 2.0,
    bodyATRMult: 1.2,
    wickUpBodyRatio: 1.0,
    stallBodyPct: 0.006,
    stallVolDrop: 0.7,
    atrPeriod: 14,
    lvlHigh: 50e6, lvlMed: 15e6, lvlLow: 5e6,
    offHigh: 0.0010, offMed: 0.0018, offLow: 0.0028, offMicro: 0.0040,
    offSpike2x: -0.0004, offSpike3x: -0.0007,
    offMinAtrMult: 0.5, offMaxAtrMult: 1.5,
    pullbackFraction: 0.35,
    slAtrMultLong: 0.8,  tpAtrMultLong: 2.2,
    slAtrMultShort: 0.6, tpAtrMultShort: 2.0,
    SCORE_WEIGHTS_LONG: {
      consolidation: 0.15, squeeze: 0.15, volume: 0.20,
      bodyVsATR: 0.15, rsi: 0.10, emaRibbon: 0.10,
      bbBreak: 0.10, liquidity: 0.05,
    },
    SCORE_WEIGHTS_SHORT: {
      farAboveBB: 0.20, wickSize: 0.20, stallBody: 0.20,
      stallVol: 0.15, pumpVol: 0.15, rsiOB: 0.05, liquidity: 0.05,
    },
    earlyClusterLen: 2, earlyBodyATRMult: 0.9, earlyVolSpike: 1.5,
    earlyBreakoutPct: 0.004, earlyAggressiveness: 0.7, earlyTpScale: 0.85,
    earlyDumpClusterLen: 2, earlyDumpBodyATRMult: 0.9, earlyDumpVolSpike: 1.5,
    earlyDumpBreakoutPct: 0.004, earlyDumpAggressiveness: 0.7, earlyDumpTpScale: 0.85,
    requireEma99ForRegime: true,
    requireLongAboveEma99: true, requireLongEma13AboveEma25: true,
    requireLongEma25AboveEma99: false, minLongDistToEma99Pct: 0.0015,
    minLongRsi14: 55,
    requireShortBelowEma99: true, requireShortEma13BelowEma25: true,
    minShortDistBelowEma99Pct: 0.0005,
    enableFadeBreakoutShort: true,
    fadeMinBreakoutPct: 0.0015, fadeMinVolMult: 1.2,
    fadePreferWickReject: true, fadeCloseBackUnderUpper: true,
    fadeMaxDistToEma99Pct: 0.010, fadeTpScale: 0.95, fadeSlExtraAtr: 0.25,
    useTickSizeRounding: true,
    enableLongQualityPenalty: true,
    qMinClosePosInRangeLong: 0.62, qMaxUpperWickBodyRatioLong: 1.20,
    qMaxBreakoutAtrLong: 2.00, qMaxBreakoutPctLong: 0.020,
    qMinBodyTicksLong: 4, qRequireFollowThroughLong: false,
    qBlowoffVolMult: 3.2, qBlowoffBodyAtrMult: 2.0,
    qPenaltyWeights: { closePos: 0.30, wick: 0.22, breakout: 0.22, bodyTicks: 0.12, follow: 0.08, blowoff: 0.06 },
    qPenaltyCap01: 0.22,
  };
  if (opts) { for (var k in opts) if (Object.prototype.hasOwnProperty.call(opts, k)) CFG[k] = opts[k]; }

  if (!candles || !state || !state.recentCloses || !state.recentVolumes ||
      candles.length < Math.max(CFG.bbLen, CFG.volLookback) + 10) {
    return { pass: false, action: null, blockShort: false, reason: 'Thiếu dữ liệu' };
  }

  function isFiniteNum(x) { return typeof x === 'number' && isFinite(x); }
  function toNum(x) { var n = Number(x); return isFiniteNum(n) ? n : NaN; }
  function sma(a) { var s = 0; for (var i = 0; i < a.length; i++) s += a[i]; return a.length ? s / a.length : 0; }
  function std(a) { var m = sma(a), s = 0; for (var i = 0; i < a.length; i++) { var d = a[i] - m; s += d * d; } return Math.sqrt(s / Math.max(a.length, 1)); }
  function body(o, c) { return Math.abs(c - o); }
  function bodyPct(o, c) { return Math.abs(c - o) / Math.max(o, 1e-9); }
  function clamp01(x) { return x < 0 ? 0 : (x > 1 ? 1 : x); }
  function gradeByScore(s) { return s >= 85 ? 'A' : s >= 70 ? 'B' : s >= 55 ? 'C' : 'D'; }

  function atr(cds, p) {
    if (!cds || cds.length < p + 1) return 0;
    var trs = [], i;
    for (i = 1; i < cds.length; i++) {
      var hi = +cds[i].high, lo = +cds[i].low, pc2 = +cds[i - 1].close;
      trs.push(Math.max(hi - lo, Math.abs(hi - pc2), Math.abs(lo - pc2)));
    }
    var a = 0; for (i = 0; i < p; i++) a += trs[i]; a /= p;
    for (i = p; i < trs.length; i++) a = (a * (p - 1) + trs[i]) / p;
    return a;
  }
  function bb(values, len, k2) {
    var tail = values.slice(-len), m = sma(tail), s = std(tail);
    return { mid: m, upper: m + k2 * s, lower: m - k2 * s, bw: (2 * k2 * s) / Math.max(m, 1e-9) };
  }
  function roundToTickSide(px, tickSize, side) {
    if (!CFG.useTickSizeRounding) return +(+px).toFixed(8);
    var t = toNum(tickSize);
    if (!isFiniteNum(t) || t <= 0) return +(+px).toFixed(8);
    var q = px / t, eps = 1e-12, rq;
    if (side === 'CEIL') rq = Math.ceil(q - eps);
    else if (side === 'FLOOR') rq = Math.floor(q + eps);
    else rq = Math.round(q);
    return +(rq * t).toFixed(12);
  }
  function calcOffset(lcPrice, lastV, closes, vols) {
    var tailN = Math.min(CFG.volLookback, closes.length), sumDV = 0, j;
    for (j = closes.length - tailN; j < closes.length; j++) sumDV += closes[j] * vols[j];
    var avgDV = sumDV / tailN, lastDV = lcPrice * lastV;
    var off = (avgDV >= CFG.lvlHigh) ? CFG.offHigh : (avgDV >= CFG.lvlMed) ? CFG.offMed : (avgDV >= CFG.lvlLow) ? CFG.offLow : CFG.offMicro;
    var dvRatio = lastDV / Math.max(avgDV, 1e-9);
    if (dvRatio >= 3) off += CFG.offSpike3x; else if (dvRatio >= 2) off += CFG.offSpike2x;
    var _atr2 = atr(candles, CFG.atrPeriod), atrPct = _atr2 / Math.max(lcPrice, 1e-9);
    var minOff = CFG.offMinAtrMult * atrPct, maxOff = CFG.offMaxAtrMult * atrPct;
    if (off < minOff) off = minOff;
    if (off > maxOff) off = maxOff;
    return { off, atr: _atr2, atrPct, dvRatio, avgDV };
  }
  function weightedScore01(parts, weights) {
    var sum = 0, wsum = 0;
    for (var kk in weights) {
      if (!Object.prototype.hasOwnProperty.call(weights, kk)) continue;
      var w = toNum(weights[kk]);
      if (!isFiniteNum(w) || w <= 0) continue;
      var v = parts[kk];
      if (!isFiniteNum(v)) continue;
      sum += v * w; wsum += w;
    }
    return wsum <= 0 ? 0 : clamp01(sum / wsum);
  }
  function candleQualityLong(o, c, h, l, tickSize) {
    var eps = 1e-12, rng = Math.max(h - l, eps), b2 = Math.abs(c - o);
    var uw = h - Math.max(o, c), closePos = (c - l) / rng, uwBody = uw / Math.max(b2, eps);
    var bodyTicks = null, t = toNum(tickSize);
    if (isFiniteNum(t) && t > 0) bodyTicks = b2 / t;
    return { range: rng, body: b2, upperWick: uw, closePos, uwBody, bodyTicks };
  }

  var closes = state.recentCloses.slice(0);
  var vols = state.recentVolumes.slice(0);
  if (closes.length !== vols.length) {
    closes = []; vols = [];
    for (var i = 0; i < candles.length; i++) { closes.push(+candles[i].close); vols.push(+candles[i].volume); }
  }

  var n = candles.length;
  var last = candles[n - 1], prev = candles[n - 2];
  var lo = +last.open, lc = +last.close, lh = +last.high, ll = +last.low;
  var po = +prev.open, pc = +prev.close, ph = +prev.high;
  var lastVol = vols[vols.length - 1];

  var ema5  = toNum(state.ema5),  ema13 = toNum(state.ema13);
  var ema25 = toNum(state.ema25), ema50 = toNum(state.ema50), ema99 = toNum(state.ema99);
  var rsi6 = toNum(state.rsi6), rsi12 = toNum(state.rsi12), rsi14 = toNum(state.rsi14);
  var pxNow = isFiniteNum(toNum(state.price)) ? toNum(state.price) : lc;
  var tickSize = (opts && opts.tickSize != null) ? toNum(opts.tickSize)
    : (state.tickSize != null) ? toNum(state.tickSize) : NaN;

  var result = { pass: false, action: null, blockShort: false, longSetup: null, shortSetup: null, reason: '', note: '' };

  var end = closes.length - 3, start = end - CFG.consolLen;
  var cons = closes.slice(Math.max(0, start), Math.max(0, end));
  var consMin = Math.min.apply(null, cons), consMax = Math.max.apply(null, cons);
  var consMid = (consMin + consMax) / 2;
  var rangePct = (consMax - consMin) / Math.max(consMid, 1e-9);

  var bbNow = bb(closes, CFG.bbLen, CFG.bbStd);
  var squeezeOK = bbNow.bw <= CFG.squeezePct;

  var avgVol = sma(vols.slice(-CFG.volLookback - 1, -1));
  var volRatioNow = lastVol / Math.max(avgVol, 1e-9);
  var volSpike = lastVol >= avgVol * CFG.volSpike;

  var emaBull = isFiniteNum(ema5) && isFiniteNum(ema13) && isFiniteNum(ema25) && isFiniteNum(ema50) &&
    (ema5 > ema13 && ema13 > ema25 && ema25 > ema50);
  var emaBear = isFiniteNum(ema5) && isFiniteNum(ema13) && isFiniteNum(ema25) && isFiniteNum(ema50) &&
    (ema5 < ema13 && ema13 < ema25 && ema25 < ema50);

  var rsiMomentumUp   = isFiniteNum(rsi6) && isFiniteNum(rsi12) && (rsi6 > 55 && rsi12 > 50);
  var rsiMomentumDown = isFiniteNum(rsi6) && isFiniteNum(rsi12) && (rsi6 < 45 && rsi12 < 50);

  var _atr = atr(candles, CFG.atrPeriod);
  var lastBody = body(lo, lc);
  var bodyBig = lastBody >= _atr * CFG.bodyATRMult;
  var offInfo = calcOffset(lc, lastVol, closes, vols);

  var hasEma99 = isFiniteNum(ema99) && ema99 > 0;
  var distToEma99Pct = hasEma99 ? ((pxNow - ema99) / Math.max(pxNow, 1e-9)) : NaN;

  var longRegimeOk = true;
  if (CFG.requireEma99ForRegime && !hasEma99) longRegimeOk = false;
  if (longRegimeOk && CFG.requireLongAboveEma99 && hasEma99) {
    if (!(pxNow > ema99)) longRegimeOk = false;
    if (isFiniteNum(distToEma99Pct) && distToEma99Pct < CFG.minLongDistToEma99Pct) longRegimeOk = false;
  }
  if (longRegimeOk && CFG.requireLongEma13AboveEma25) {
    if (!(isFiniteNum(ema13) && isFiniteNum(ema25) && ema13 > ema25)) longRegimeOk = false;
  }
  if (longRegimeOk && CFG.requireLongEma25AboveEma99 && hasEma99) {
    if (!(isFiniteNum(ema25) && ema25 > ema99)) longRegimeOk = false;
  }
  if (longRegimeOk && isFiniteNum(rsi14) && isFiniteNum(CFG.minLongRsi14)) {
    if (rsi14 < CFG.minLongRsi14) longRegimeOk = false;
  }

  var shortRegimeOk = true;
  if (CFG.requireEma99ForRegime && !hasEma99) shortRegimeOk = false;
  if (shortRegimeOk && CFG.requireShortBelowEma99 && hasEma99) {
    if (!(pxNow < ema99)) shortRegimeOk = false;
    if (isFiniteNum(distToEma99Pct)) {
      var belowPct = -distToEma99Pct;
      if (belowPct < CFG.minShortDistBelowEma99Pct) shortRegimeOk = false;
    }
  }
  if (shortRegimeOk && CFG.requireShortEma13BelowEma25) {
    if (!(isFiniteNum(ema13) && isFiniteNum(ema25) && ema13 < ema25)) shortRegimeOk = false;
  }

  var isPumpNowRaw = rangePct <= CFG.consolMaxRangePct && squeezeOK && volSpike && emaBull &&
    rsiMomentumUp && (lc > bbNow.upper) && bodyBig;

  var clusterLen = Math.min(CFG.earlyClusterLen, n);
  var clusterBodySum = 0, clusterVolSum = 0;
  for (var ci = 0; ci < clusterLen; ci++) {
    var cCluster = candles[n - 1 - ci];
    clusterBodySum += body(+cCluster.open, +cCluster.close);
    clusterVolSum  += +cCluster.volume;
  }
  var earlyBodyOK = clusterBodySum >= _atr * CFG.earlyBodyATRMult;
  var earlyVolOK  = clusterVolSum  >= avgVol * CFG.earlyVolSpike;
  var lastBull = lc > lo, prevBull = pc > po, lastBear = lc < lo, prevBear = pc < po;
  var earlyUpDirOK   = lastBull && prevBull;
  var earlyDownDirOK = lastBear && prevBear;
  var breakoutPctUp  = (lc - consMax) / Math.max(consMax, 1e-9);
  var breakdownPctDn = (consMin - lc) / Math.max(consMin, 1e-9);

  var isPumpEarlyRaw = !isPumpNowRaw && rangePct <= CFG.consolMaxRangePct && squeezeOK &&
    emaBull && rsiMomentumUp && (lc > bbNow.upper) &&
    breakoutPctUp >= CFG.earlyBreakoutPct && earlyBodyOK && earlyVolOK && earlyUpDirOK;

  var isPumpNow  = isPumpNowRaw  && longRegimeOk;
  var isPumpEarly = isPumpEarlyRaw && longRegimeOk;

  var clusterLenD = Math.min(CFG.earlyDumpClusterLen, n);
  var clusterBodySumD = 0, clusterVolSumD = 0;
  for (var cj = 0; cj < clusterLenD; cj++) {
    var cc2 = candles[n - 1 - cj];
    clusterBodySumD += body(+cc2.open, +cc2.close);
    clusterVolSumD  += +cc2.volume;
  }
  var earlyDumpBodyOK = clusterBodySumD >= _atr * CFG.earlyDumpBodyATRMult;
  var earlyDumpVolOK  = clusterVolSumD  >= avgVol * CFG.earlyDumpVolSpike;
  var isDumpEarly = rangePct <= CFG.consolMaxRangePct && squeezeOK && emaBear && rsiMomentumDown &&
    (lc < bbNow.lower) && breakdownPctDn >= CFG.earlyDumpBreakoutPct &&
    earlyDumpBodyOK && earlyDumpVolOK && earlyDownDirOK && shortRegimeOk;

  var fadeTriggered = false, fadeTriggerType = '';
  if (CFG.enableFadeBreakoutShort && hasEma99) {
    var maxDist = toNum(CFG.fadeMaxDistToEma99Pct);
    if (!isFiniteNum(maxDist) || maxDist <= 0) maxDist = 0.01;
    var distAbsPct = Math.abs((pxNow - ema99) / Math.max(pxNow, 1e-9));
    var nearEma99 = distAbsPct <= maxDist;
    var fadeContextOk = rangePct <= CFG.consolMaxRangePct && squeezeOK && nearEma99 &&
      ((isFiniteNum(ema13) && isFiniteNum(ema25) && ema13 < ema25) || (pxNow < ema99) || emaBear) &&
      (!rsiMomentumUp) && (volRatioNow >= CFG.fadeMinVolMult);
    if (fadeContextOk) {
      var wickBreakUpper = (lh > bbNow.upper);
      var closeBackUnderUpper = (lc <= bbNow.upper);
      var breakoutOk = breakoutPctUp >= CFG.fadeMinBreakoutPct;
      var wickOk = wickBreakUpper && (breakoutPctUp >= CFG.fadeMinBreakoutPct * 0.5);
      if (CFG.fadePreferWickReject) {
        if (wickOk && closeBackUnderUpper) { fadeTriggered = true; fadeTriggerType = 'WICK_REJECT_BB_UPPER'; }
        else if (breakoutOk && (lc > bbNow.upper) && (pxNow < ema99) && shortRegimeOk) { fadeTriggered = true; fadeTriggerType = 'BREAKOUT_UNDER_EMA99_FADE'; }
      } else {
        if (breakoutOk && (lc > bbNow.upper) && (pxNow < ema99) && shortRegimeOk) { fadeTriggered = true; fadeTriggerType = 'BREAKOUT_UNDER_EMA99_FADE'; }
        else if (wickOk && (!CFG.fadeCloseBackUnderUpper || closeBackUnderUpper)) { fadeTriggered = true; fadeTriggerType = 'WICK_TOUCH_FADE'; }
      }
    }
  }

  var distEma13 = pctDistSigned(pxNow, ema13);
  var distEma25 = pctDistSigned(pxNow, ema25);
  var distEma99 = pctDistSigned(pxNow, ema99);
  var distEma13Pct = pctToPct(distEma13);
  var distEma25Pct = pctToPct(distEma25);
  var distEma99Pct = pctToPct(distEma99);

  // ── LONG: pump breakout ────────────────────────────────────
  if (isPumpNow || isPumpEarly) {
    var breakoutRef = consMax;
    var aggressiveness = isPumpNow ? 1.0 : CFG.earlyAggressiveness;
    var tpScale = isPumpNow ? 1.0 : CFG.earlyTpScale;
    var longEntryRaw = breakoutRef * (1 + offInfo.off * aggressiveness);
    var altEntryRaw  = Math.max(ema5, ema13) * (1 + Math.min(offInfo.off * CFG.pullbackFraction * aggressiveness, 0.0008));
    var slLongRaw    = longEntryRaw - CFG.slAtrMultLong * offInfo.atr;
    var tpLongRaw    = longEntryRaw + CFG.tpAtrMultLong * offInfo.atr * tpScale;
    var longEntry = roundToTickSide(longEntryRaw, tickSize, 'CEIL');
    var altEntry  = roundToTickSide(altEntryRaw, tickSize, 'CEIL');
    var slLong    = roundToTickSide(slLongRaw, tickSize, 'FLOOR');
    var tpLong    = roundToTickSide(tpLongRaw, tickSize, 'CEIL');

    var Wl = CFG.SCORE_WEIGHTS_LONG || {};
    var consScore    = clamp01(CFG.consolMaxRangePct / Math.max(rangePct, 1e-9));
    var squeezeScore = clamp01(CFG.squeezePct / Math.max(bbNow.bw, 1e-9));
    var volumeScore  = clamp01((volRatioNow - CFG.volSpike) / Math.max(3 - CFG.volSpike, 1e-9));
    var bodyScore    = clamp01(lastBody / Math.max(_atr * CFG.bodyATRMult, 1e-9));
    var rsiPart6     = isFiniteNum(rsi6)  ? clamp01((rsi6  - 55) / 15) : 0;
    var rsiPart12    = isFiniteNum(rsi12) ? clamp01((rsi12 - 50) / 20) : 0;
    var rsiScore     = clamp01(0.6 * rsiPart6 + 0.4 * rsiPart12);
    var emaScore     = emaBull ? 1 : 0;
    var bbBreakScore = clamp01((lc - bbNow.upper) / Math.max(_atr, 1e-9));
    var liqScore     = clamp01((offInfo.dvRatio - 1) / 1.5);

    var scoreLongRaw01 = weightedScore01({
      consolidation: consScore, squeeze: squeezeScore, volume: volumeScore,
      bodyVsATR: bodyScore, rsi: rsiScore, emaRibbon: emaScore,
      bbBreak: bbBreakScore, liquidity: liqScore,
    }, Wl);

    var qPenalty01 = 0, qMetrics = null;
    if (CFG.enableLongQualityPenalty) {
      qMetrics = candleQualityLong(lo, lc, lh, ll, tickSize);
      var followOk2 = CFG.qRequireFollowThroughLong ? (prevBull && lastBull) : true;
      var breakoutAtrUp = (lc - consMax) / Math.max(_atr, 1e-9);
      var blowoffRisk = (volRatioNow >= CFG.qBlowoffVolMult) && (qMetrics.body >= _atr * CFG.qBlowoffBodyAtrMult);
      var pClose = (qMetrics.closePos < CFG.qMinClosePosInRangeLong) ? clamp01((CFG.qMinClosePosInRangeLong - qMetrics.closePos) / Math.max(CFG.qMinClosePosInRangeLong, 1e-9)) : 0;
      var pWick  = (qMetrics.uwBody > CFG.qMaxUpperWickBodyRatioLong) ? clamp01((qMetrics.uwBody - CFG.qMaxUpperWickBodyRatioLong) / Math.max(CFG.qMaxUpperWickBodyRatioLong * 2, 1e-9)) : 0;
      var pBreakAtr = (breakoutAtrUp > CFG.qMaxBreakoutAtrLong) ? clamp01((breakoutAtrUp - CFG.qMaxBreakoutAtrLong) / Math.max(CFG.qMaxBreakoutAtrLong, 1e-9)) : 0;
      var pBreakPct = (breakoutPctUp > CFG.qMaxBreakoutPctLong) ? clamp01((breakoutPctUp - CFG.qMaxBreakoutPctLong) / Math.max(CFG.qMaxBreakoutPctLong, 1e-9)) : 0;
      var pBreak2 = Math.max(pBreakAtr, pBreakPct);
      var pTicks = 0;
      if (qMetrics.bodyTicks != null && isFiniteNum(qMetrics.bodyTicks)) {
        pTicks = (qMetrics.bodyTicks < CFG.qMinBodyTicksLong) ? clamp01((CFG.qMinBodyTicksLong - qMetrics.bodyTicks) / Math.max(CFG.qMinBodyTicksLong, 1e-9)) : 0;
      }
      var pFollow2 = followOk2 ? 0 : 1, pBlowoff = blowoffRisk ? 1 : 0;
      var Wp = CFG.qPenaltyWeights || {};
      var pen = (Wp.closePos || 0) * pClose + (Wp.wick || 0) * pWick + (Wp.breakout || 0) * pBreak2 + (Wp.bodyTicks || 0) * pTicks + (Wp.follow || 0) * pFollow2 + (Wp.blowoff || 0) * pBlowoff;
      qPenalty01 = Math.min(clamp01(pen), toNum(CFG.qPenaltyCap01));
      scoreLongRaw01 = clamp01(scoreLongRaw01 - qPenalty01);
    }

    var scoreLong = Math.round(scoreLongRaw01 * 100);
    var gradeLong = gradeByScore(scoreLong);
    var atrPct100  = offInfo.atrPct * 100;
    var mktMaxE13  = Math.min(2.5, 3.0 * atrPct100);
    var mktMaxE25  = Math.min(4.0, 5.0 * atrPct100);
    var marketOk = (distEma13Pct != null && distEma13Pct <= mktMaxE13) && (distEma25Pct != null && distEma25Pct <= mktMaxE25);

    result.pass = true;
    result.action = 'LONG';
    result.blockShort = true;
    result.longSetup = {
      isPumpEarly,
      pass: scoreLong >= 55,  // FIX: grade C+ is actionable (original was penalty<1% which was always false)
      entry: longEntry, altEntry, sl: slLong, tp: tpLong,
      reason: isPumpEarly ? 'Early pump breakout (regime OK): cụm nến breakout + BB.upper' : 'Pump breakout (regime OK): squeeze + vol spike + EMA bullish + close>BB.upper',
      score: scoreLong, grade: gradeLong,
      marketOk, marketMax: { ema13: +mktMaxE13.toFixed(2), ema25: +mktMaxE25.toFixed(2) },
      factors: {
        ema13DistPct: distEma13Pct, ema25DistPct: distEma25Pct, ema99DistPct: distEma99Pct,
        consolidation: +consScore.toFixed(2), squeeze: +squeezeScore.toFixed(2), volume: +volumeScore.toFixed(2),
        bodyVsATR: +bodyScore.toFixed(2), rsi: +rsiScore.toFixed(2), emaRibbon: +emaScore.toFixed(2),
        bbBreak: +bbBreakScore.toFixed(2), liquidity: +liqScore.toFixed(2), regime: 1,
        qPenalty: +qPenalty01.toFixed(3),
        qClosePos: qMetrics ? +qMetrics.closePos.toFixed(2) : null,
        qUwBody: qMetrics ? +qMetrics.uwBody.toFixed(2) : null,
        qBodyTicks: (qMetrics && qMetrics.bodyTicks != null) ? +qMetrics.bodyTicks.toFixed(1) : null,
        qBreakAtr: +((lc - consMax) / Math.max(_atr, 1e-9)).toFixed(2),
        qBreakPct: +(breakoutPctUp * 100).toFixed(2),
        volRatio: +volRatioNow.toFixed(2), rsi14val: isFiniteNum(rsi14) ? +rsi14.toFixed(1) : null,
      },
    };
    result.reason = isPumpEarly ? 'Early pump breakout – block SHORT' : 'Pump breakout – block SHORT';
    result.note = (isPumpEarly ? 'EARLY | ' : '') +
      'range=' + (rangePct * 100).toFixed(2) + '% | BBW=' + (bbNow.bw * 100).toFixed(2) + '% | ATR%=' + (offInfo.atrPct * 100).toFixed(2) + '% | score=' + scoreLong + '(' + gradeLong + ')' +
      (CFG.enableLongQualityPenalty ? (' | qPenalty=' + (qPenalty01 * 100).toFixed(1) + 'pts') : '');
    return result;
  }

  // ── SHORT: fade breakout ───────────────────────────────────
  if (fadeTriggered) {
    var entryRaw  = pxNow;
    var altRaw2   = ema99 * (1 - Math.min(offInfo.off * CFG.pullbackFraction * 0.5, 0.0008));
    var slAnchor  = Math.max(lh, ema99);
    var slRaw2    = slAnchor + (CFG.slAtrMultShort + CFG.fadeSlExtraAtr) * offInfo.atr;
    var tpRaw2    = entryRaw - (CFG.tpAtrMultShort * offInfo.atr * CFG.fadeTpScale);
    var entryF    = roundToTickSide(entryRaw, tickSize, 'FLOOR');
    var altEntryF = roundToTickSide(altRaw2, tickSize, 'FLOOR');
    var slF       = roundToTickSide(slRaw2, tickSize, 'CEIL');
    var tpF       = roundToTickSide(tpRaw2, tickSize, 'FLOOR');
    var distAbsPct2 = Math.abs((pxNow - ema99) / Math.max(pxNow, 1e-9));
    var nearScore    = clamp01(1 - (distAbsPct2 / Math.max(CFG.fadeMaxDistToEma99Pct, 1e-9)));
    var wickRjScore  = fadeTriggerType === 'WICK_REJECT_BB_UPPER' ? 1 : 0.6;
    var rsiWeakSc    = isFiniteNum(rsi14) ? clamp01((55 - rsi14) / 25) : (isFiniteNum(rsi6) ? clamp01((55 - rsi6) / 25) : 0.5);
    var emaBearSc    = (isFiniteNum(ema13) && isFiniteNum(ema25) && ema13 < ema25) ? 1 : (emaBear ? 1 : 0.5);
    var volScF       = clamp01((volRatioNow - CFG.fadeMinVolMult) / Math.max(2.5 - CFG.fadeMinVolMult, 1e-9));
    var bbTouchSc    = clamp01((lh - bbNow.upper) / Math.max(_atr, 1e-9));
    var scoreFade01  = weightedScore01({ nearEma99: nearScore, wickReject: wickRjScore, rsiWeak: rsiWeakSc, emaBear: emaBearSc, volume: volScF, bbTouch: bbTouchSc }, { nearEma99: 0.22, wickReject: 0.18, rsiWeak: 0.18, emaBear: 0.18, volume: 0.12, bbTouch: 0.12 });
    var scoreFade = Math.round(scoreFade01 * 100), gradeFade = gradeByScore(scoreFade);
    result.pass = true; result.action = 'SHORT';
    result.shortSetup = {
      pass: true, entry: entryF, altEntry: altEntryF, sl: slF, tp: tpF,
      reason: 'Fade breakout dưới EMA99: squeeze/box breakout nhưng regime bearish → ưu tiên SHORT',
      score: scoreFade, grade: gradeFade,
      factors: { trigger: fadeTriggerType, nearEma99: +nearScore.toFixed(2), wickReject: +wickRjScore.toFixed(2), rsiWeak: +rsiWeakSc.toFixed(2), emaBear: +emaBearSc.toFixed(2), volume: +volScF.toFixed(2), bbTouch: +bbTouchSc.toFixed(2), regime: shortRegimeOk ? 1 : 0, volRatio: +volRatioNow.toFixed(2), rsi14val: isFiniteNum(rsi14) ? +rsi14.toFixed(1) : null },
    };
    result.reason = 'Fade breakout dưới EMA99 – ưu tiên SHORT';
    result.note = 'FADE | range=' + (rangePct * 100).toFixed(2) + '% | BBW=' + (bbNow.bw * 100).toFixed(2) + '% | distEma99=' + (distAbsPct2 * 100).toFixed(2) + '% | score=' + scoreFade + '(' + gradeFade + ')';
    return result;
  }

  // ── SHORT: early dump breakdown ────────────────────────────
  if (isDumpEarly) {
    var breakdownRef = consMin, dumpAgg = CFG.earlyDumpAggressiveness;
    var shortEntryRaw = breakdownRef * (1 - offInfo.off * dumpAgg);
    var altShortRaw   = Math.min(ema5, ema13) * (1 - Math.min(offInfo.off * CFG.pullbackFraction * dumpAgg, 0.0008));
    var slShortRaw    = shortEntryRaw + CFG.slAtrMultShort * offInfo.atr;
    var tpShortRaw    = shortEntryRaw - CFG.tpAtrMultShort * offInfo.atr * CFG.earlyDumpTpScale;
    var shortEntry = roundToTickSide(shortEntryRaw, tickSize, 'FLOOR');
    var altShort   = roundToTickSide(altShortRaw, tickSize, 'FLOOR');
    var slShort    = roundToTickSide(slShortRaw, tickSize, 'CEIL');
    var tpShort    = roundToTickSide(tpShortRaw, tickSize, 'FLOOR');
    var consScoreD    = clamp01(CFG.consolMaxRangePct / Math.max(rangePct, 1e-9));
    var squeezeScoreD = clamp01(CFG.squeezePct / Math.max(bbNow.bw, 1e-9));
    var volRatioDump  = clusterVolSumD / Math.max(avgVol, 1e-9);
    var volumeScoreD  = clamp01((volRatioDump - CFG.earlyDumpVolSpike) / Math.max(3 - CFG.earlyDumpVolSpike, 1e-9));
    var bodyScoreD    = clamp01(clusterBodySumD / Math.max(_atr * CFG.earlyDumpBodyATRMult, 1e-9));
    var rsiScoreD     = (isFiniteNum(rsi6) && isFiniteNum(rsi12)) ? clamp01(0.6 * clamp01((45 - rsi6) / 15) + 0.4 * clamp01((50 - rsi12) / 20)) : 0.5;
    var emaScoreD     = emaBear ? 1 : 0;
    var bbBreakScoreD = clamp01((bbNow.lower - lc) / Math.max(_atr, 1e-9));
    var liqScoreD     = clamp01((offInfo.dvRatio - 1) / 1.5);
    // Intentionally reuses SCORE_WEIGHTS_LONG keys — early dump factors mirror pump (consolidation, squeeze, etc.)
    var scoreShortDump01 = weightedScore01({ consolidation: consScoreD, squeeze: squeezeScoreD, volume: volumeScoreD, bodyVsATR: bodyScoreD, rsi: rsiScoreD, emaRibbon: emaScoreD, bbBreak: bbBreakScoreD, liquidity: liqScoreD }, CFG.SCORE_WEIGHTS_LONG || {});
    var scoreShortDump = Math.round(scoreShortDump01 * 100), gradeShortDump = gradeByScore(scoreShortDump);
    result.pass = true; result.action = 'SHORT';
    result.shortSetup = {
      pass: true, entry: shortEntry, altEntry: altShort, sl: slShort, tp: tpShort,
      reason: 'Early dump breakdown (regime OK): cụm nến đỏ phá box xuống dưới BB.lower',
      score: scoreShortDump, grade: gradeShortDump,
      factors: { consolidation: +consScoreD.toFixed(2), squeeze: +squeezeScoreD.toFixed(2), volume: +volumeScoreD.toFixed(2), bodyVsATR: +bodyScoreD.toFixed(2), rsi: +rsiScoreD.toFixed(2), emaRibbon: +emaScoreD.toFixed(2), bbBreak: +bbBreakScoreD.toFixed(2), liquidity: +liqScoreD.toFixed(2), regime: 1, volRatio: +volRatioDump.toFixed(2), rsi14val: isFiniteNum(rsi14) ? +rsi14.toFixed(1) : null },
    };
    result.reason = 'Early dump breakdown – ưu tiên SHORT';
    result.note = 'EARLY_DUMP | range=' + (rangePct * 100).toFixed(2) + '% | BBW=' + (bbNow.bw * 100).toFixed(2) + '% | ATR%=' + (offInfo.atrPct * 100).toFixed(2) + '% | score=' + scoreShortDump + '(' + gradeShortDump + ')';
    return result;
  }

  // ── LONG: EMA pullback — coin đã pump, đang kéo về test EMA13 ──────────────
  // Đặt TRƯỚC dist_top/vol_climax vì pullback về EMA13 là tín hiệu LONG ưu tiên cao
  // Điều kiện: trend bull (ema13>ema25>ema50), giá kéo về gần EMA13 (trong ±1.5×ATR),
  // nến đang bounce (close > open, vol không quá yếu), RSI chưa OB
  var pbDistToEma13 = isFiniteNum(ema13) ? Math.abs(pxNow - ema13) / Math.max(ema13, 1e-9) : Infinity;
  var pbTrendOk = isFiniteNum(ema13) && isFiniteNum(ema25) && isFiniteNum(ema50) && ema13 > ema25 && ema25 > ema50;
  var pbNearEma13 = pbDistToEma13 <= (offInfo.atrPct * 1.5); // giá trong 1.5×ATR% từ EMA13
  var pbBounceOk = lc > lo; // nến cuối xanh
  var pbPrevDropOk = pc < +candles[n - 3]?.close; // 1-2 nến trước đang kéo xuống (pullback)
  var pbRsiOk = isFiniteNum(rsi14) && rsi14 >= 40 && rsi14 <= 70; // RSI không OB, không quá yếu
  var pbVolOk = volRatioNow >= 0.6; // không cần vol spike, chỉ cần không quá yếu
  // Regime riêng: không dùng minLongRsi14 vì pullback thường RSI14 < 55
  var pbRegimeOk = (function() {
    if (CFG.requireEma99ForRegime && !hasEma99) return false;
    if (CFG.requireLongAboveEma99 && hasEma99 && !(pxNow > ema99)) return false;
    if (CFG.requireLongEma13AboveEma25 && !(isFiniteNum(ema13) && isFiniteNum(ema25) && ema13 > ema25)) return false;
    return true; // bỏ qua minLongRsi14 — pullback thường RSI14 40-54
  })();
  var isEmaPullback = pbTrendOk && pbNearEma13 && pbBounceOk && pbPrevDropOk && pbRsiOk && pbVolOk && pbRegimeOk;

  if (isEmaPullback) {
    var pbEntryRaw = ema13 * (1 + offInfo.off * 0.5);
    var pbSlRaw    = ema25 - offInfo.atr * 0.5;
    var pbTpRaw    = pbEntryRaw + offInfo.atr * 2.0;
    var pbEntry = roundToTickSide(pbEntryRaw, tickSize, 'CEIL');
    var pbSl    = roundToTickSide(pbSlRaw, tickSize, 'FLOOR');
    var pbTp    = roundToTickSide(pbTpRaw, tickSize, 'CEIL');

    var pbNearScore  = clamp01(1 - pbDistToEma13 / Math.max(offInfo.atrPct * 2, 1e-9));
    var pbRsiScore   = clamp01((rsi14 - 40) / 30);
    var pbVolScore   = clamp01((volRatioNow - 0.6) / 1.4);
    var pbTrendScore = (isFiniteNum(ema5) && ema5 > ema13) ? 1 : 0.6;
    var pbBbScore    = clamp01((bbNow.upper - pxNow) / Math.max(_atr, 1e-9));
    var scorePb01 = weightedScore01(
      { nearEma: pbNearScore, rsi: pbRsiScore, volume: pbVolScore, trend: pbTrendScore, bbRoom: pbBbScore },
      { nearEma: 0.30, rsi: 0.20, volume: 0.15, trend: 0.20, bbRoom: 0.15 }
    );
    var scorePb = Math.round(scorePb01 * 100);
    var gradePb = gradeByScore(scorePb);

    result.pass = true;
    result.action = 'LONG';
    result.blockShort = true;
    result.longSetup = {
      isPumpEarly: false,
      pass: scorePb >= 55,
      entry: pbEntry, altEntry: pbEntry, sl: pbSl, tp: pbTp,
      reason: 'EMA pullback: coin đã pump, đang kéo về test EMA13 → bounce',
      score: scorePb, grade: gradePb,
      marketOk: true,
      factors: {
        nearEma: +pbNearScore.toFixed(2), rsi: +pbRsiScore.toFixed(2),
        volume: +pbVolScore.toFixed(2), trend: +pbTrendScore.toFixed(2),
        bbRoom: +pbBbScore.toFixed(2), emaRibbon: 1,
        volRatio: +volRatioNow.toFixed(2), rsi14val: isFiniteNum(rsi14) ? +rsi14.toFixed(1) : null,
        ema13DistPct: +(pbDistToEma13 * 100).toFixed(2),
      },
    };
    result.reason = 'EMA pullback – LONG tại EMA13';
    result.note = `EMA_PB | dist13=${(pbDistToEma13 * 100).toFixed(2)}% | RSI=${isFiniteNum(rsi14) ? rsi14.toFixed(1) : '-'} | vol=${volRatioNow.toFixed(1)}x | score=${scorePb}(${gradePb})`;
    return result;
  }

  // ── SHORT: distribution top (RSI divergence + overextension) ────────────────
  // Phát hiện sớm: giá overextended + RSI thấp bất thường (divergence proxy) + không bull
  var distToEma13Pct = isFiniteNum(ema13) ? (lc - ema13) / Math.max(ema13, 1e-9) : 0;
  var currentUpperW  = lh - Math.max(lo, lc);
  // Proxy divergence: giá cao hơn high 10-20 nến trước nhưng RSI6 < 55 (weak momentum tại đỉnh)
  var divLookback = 20, priceAtNewHigh = false;
  for (var di = 10; di <= divLookback && di < n - 1; di++) {
    if (lc >= +candles[n - 1 - di].high * 0.998) { priceAtNewHigh = true; break; }
  }
  // Tighten: RSI phải thực sự yếu (<45), overext lớn hơn (3×ATR), cần wick rõ, vol đủ cao
  var rsiDivFound = priceAtNewHigh && isFiniteNum(rsi6) && rsi6 < 45; // giá lên high mới nhưng RSI yếu rõ rệt
  var divPastRsi  = rsi6; // dùng cho display
  var dtOverext  = distToEma13Pct >= offInfo.atrPct * 3.0;          // price > EMA13 + 3×ATR (rất overextended)
  var dtUpperW   = currentUpperW >= body(lo, lc) * 0.6;             // upper wick ≥ 0.6× body (wick rõ hơn)
  var dtVolOk    = offInfo.dvRatio >= 2.0;                          // volume hỗ trợ đủ mạnh
  var isDistTop  = rsiDivFound && dtOverext && !emaBull && dtUpperW && dtVolOk; // cần cả wick lẫn vol

  if (isDistTop) {
    var dtEntryRaw = lc * (1 - offInfo.off);
    var dtSlRaw    = lh + CFG.slAtrMultShort * offInfo.atr;
    var dtTpRaw    = dtEntryRaw - CFG.tpAtrMultShort * offInfo.atr;
    var dtEntry    = roundToTickSide(dtEntryRaw, tickSize, 'FLOOR');
    var dtSl       = roundToTickSide(dtSlRaw, tickSize, 'CEIL');
    var dtTp       = roundToTickSide(dtTpRaw, tickSize, 'FLOOR');
    var dtRsiDivSc = isFiniteNum(divPastRsi) ? clamp01((divPastRsi - rsi6) / 30) : 0.5;
    var dtOverextSc = clamp01((distToEma13Pct - offInfo.atrPct * 2) / Math.max(offInfo.atrPct * 3, 1e-9));
    var dtWickSc    = dtUpperW ? clamp01(currentUpperW / Math.max(body(lo, lc), 1e-9) / 2) : 0;
    var dtVolSc     = clamp01((offInfo.dvRatio - 1.5) / 3);
    var dtRegimeSc  = shortRegimeOk ? 1 : 0.3;
    var dtScore01   = weightedScore01({ rsiDiv: dtRsiDivSc, overext: dtOverextSc, wickReject: dtWickSc, volume: dtVolSc, regime: dtRegimeSc }, { rsiDiv: 0.35, overext: 0.25, wickReject: 0.20, volume: 0.10, regime: 0.10 });
    var dtScore = Math.round(dtScore01 * 100), dtGrade = gradeByScore(dtScore);
    result.pass = true; result.action = 'SHORT';
    result.shortSetup = {
      pass: true, entry: dtEntry, altEntry: dtEntry, sl: dtSl, tp: dtTp,
      reason: 'Distribution top: RSI divergence + overextended vs EMA',
      score: dtScore, grade: dtGrade,
      factors: { rsiDiv: +dtRsiDivSc.toFixed(2), overext: +dtOverextSc.toFixed(2), wickReject: +dtWickSc.toFixed(2), volume: +dtVolSc.toFixed(2), regime: dtRegimeSc, volRatio: +offInfo.dvRatio.toFixed(2), rsi14val: isFiniteNum(rsi14) ? +rsi14.toFixed(1) : null, ema13DistPct: +(distToEma13Pct * 100).toFixed(2) },
    };
    result.reason = 'Distribution top (RSI divergence) – SHORT';
    result.note = 'DIST_TOP | rsiDiv=' + (isFiniteNum(divPastRsi) ? divPastRsi.toFixed(1) : '?') + '→' + (isFiniteNum(rsi6) ? rsi6.toFixed(1) : '?') + ' | ema13Dist=' + (distToEma13Pct * 100).toFixed(2) + '% | score=' + dtScore + '(' + dtGrade + ')';
    return result;
  }

  // ── SHORT: volume climax (volume spike 3× trên nến tăng lớn = supply hitting bid) ──
  // Detect ngay TRONG nến pump: vol cực cao + overextended + wick forming
  var vcVolSpike  = offInfo.dvRatio >= 3.5;                         // vol phải rất cao (3.5× thay vì 3×)
  var vcGreen     = lc > lo;
  var vcBigBody   = bodyPct(lo, lc) >= offInfo.atrPct * 1.0;       // body lớn hơn (1.0× ATR% thay vì 0.8×)
  var vcUpperWick = currentUpperW >= body(lo, lc) * 0.5;           // wick rõ hơn (0.5× thay vì 0.4×)
  var vcRsiWeak   = isFiniteNum(rsi6) && rsi6 < 65;                // RSI phải rõ ràng yếu hơn (< 65 thay vì < 75)
  var vcOverext   = distToEma13Pct >= offInfo.atrPct * 2.5;        // overextended hơn (2.5× thay vì 1.5×)
  // Cần đồng thời: vol spike + big body + rsi yếu + overext + wick (không cho pass bằng vol ≥4 mà không wick)
  var isVolClimax = vcVolSpike && vcGreen && vcBigBody && vcRsiWeak && vcOverext && vcUpperWick;

  if (isVolClimax) {
    var vcEntryRaw = lc * (1 - offInfo.off * 0.5);
    var vcSlRaw    = lh + CFG.slAtrMultShort * offInfo.atr;
    var vcTpRaw    = vcEntryRaw - CFG.tpAtrMultShort * offInfo.atr;
    var vcEntry    = roundToTickSide(vcEntryRaw, tickSize, 'FLOOR');
    var vcSl       = roundToTickSide(vcSlRaw, tickSize, 'CEIL');
    var vcTp       = roundToTickSide(vcTpRaw, tickSize, 'FLOOR');
    var vcVolSc    = clamp01((offInfo.dvRatio - 3) / 5);
    var vcOverSc   = clamp01((distToEma13Pct - offInfo.atrPct * 1.5) / Math.max(offInfo.atrPct * 3, 1e-9));
    var vcWickSc   = vcUpperWick ? clamp01(currentUpperW / Math.max(body(lo, lc), 1e-9) / 1.5) : 0;
    var vcRsiSc    = isFiniteNum(rsi6) ? clamp01((75 - rsi6) / 35) : 0.5;
    var vcRegimeSc = shortRegimeOk ? 1 : 0.3;
    var vcScore01  = weightedScore01({ volSpike: vcVolSc, overext: vcOverSc, wick: vcWickSc, rsiWeak: vcRsiSc, regime: vcRegimeSc }, { volSpike: 0.35, overext: 0.25, wick: 0.20, rsiWeak: 0.10, regime: 0.10 });
    var vcScore = Math.round(vcScore01 * 100), vcGrade = gradeByScore(vcScore);
    result.pass = true; result.action = 'SHORT';
    result.shortSetup = {
      pass: true, entry: vcEntry, altEntry: vcEntry, sl: vcSl, tp: vcTp,
      reason: 'Volume climax: spike 3× trên nến tăng lớn + overextended',
      score: vcScore, grade: vcGrade,
      factors: { volSpike: +vcVolSc.toFixed(2), overext: +vcOverSc.toFixed(2), wick: +vcWickSc.toFixed(2), rsiWeak: +vcRsiSc.toFixed(2), regime: vcRegimeSc, volRatio: +offInfo.dvRatio.toFixed(2), rsi14val: isFiniteNum(rsi14) ? +rsi14.toFixed(1) : null, ema13DistPct: +(distToEma13Pct * 100).toFixed(2) },
    };
    result.reason = 'Volume climax – SHORT';
    result.note = 'VOL_CLIMAX | vol=' + offInfo.dvRatio.toFixed(1) + 'x | ema13Dist=' + (distToEma13Pct * 100).toFixed(2) + '% | score=' + vcScore + '(' + vcGrade + ')';
    return result;
  }

  // ── SHORT: climax top ──────────────────────────────────────
  var bbPrev = bb(closes.slice(0, -1), CFG.bbLen, CFG.bbStd);
  var pumpC = prev;
  var pumpBodyPct = bodyPct(po, pc);
  var pumpUpperW = ph - Math.max(po, pc);
  var pumpWickBig  = pumpUpperW >= body(po, pc) * CFG.wickUpBodyRatio;
  var pumpFarAboveBB = ph > (bbPrev.upper + (bbPrev.upper - bbPrev.mid));
  var pumpVolSpike2  = (+pumpC.volume) >= avgVol * (CFG.volSpike * 0.9);
  var stallBodyP2    = bodyPct(lo, lc);
  var stallVolDown   = lastVol <= (+pumpC.volume) * CFG.stallVolDrop;
  var stallCloseWeak = lc < Math.max(pc, ph * 0.995);
  var isClimaxTop    = pumpFarAboveBB && pumpVolSpike2 && pumpWickBig && stallBodyP2 <= CFG.stallBodyPct && stallVolDown && stallCloseWeak;

  if (isClimaxTop) {
    var shortEntry2Raw = (+pumpC.low) * (1 - offInfo.off);
    var altShort2Raw   = Math.min(ema5, ema13) * (1 - Math.min(offInfo.off * CFG.pullbackFraction, 0.0008));
    var slShort2Raw    = shortEntry2Raw + CFG.slAtrMultShort * offInfo.atr;
    var tpShort2Raw    = shortEntry2Raw - CFG.tpAtrMultShort * offInfo.atr;
    var shortEntry2 = roundToTickSide(shortEntry2Raw, tickSize, 'FLOOR');
    var altShort2   = roundToTickSide(altShort2Raw, tickSize, 'FLOOR');
    var slShort2    = roundToTickSide(slShort2Raw, tickSize, 'CEIL');
    var tpShort2    = roundToTickSide(tpShort2Raw, tickSize, 'FLOOR');
    var Ws = CFG.SCORE_WEIGHTS_SHORT || {};
    var pumpAboveWidth = bbPrev.upper - bbPrev.mid;
    var farAboveScore  = clamp01((ph - (bbPrev.upper + pumpAboveWidth)) / Math.max(pumpAboveWidth, 1e-9));
    var wickRatio      = pumpUpperW / Math.max(body(po, pc), 1e-9);
    var wickScore2     = clamp01((wickRatio - CFG.wickUpBodyRatio) / 1.5);
    var stallBodyScore = clamp01(CFG.stallBodyPct / Math.max(stallBodyP2, 1e-9));
    var stallVolRatio  = lastVol / Math.max(+pumpC.volume, 1e-9);
    var stallVolScore  = clamp01((CFG.stallVolDrop - stallVolRatio) / Math.max(CFG.stallVolDrop, 1e-9));
    var pumpVolRatio2  = (+pumpC.volume) / Math.max(avgVol, 1e-9);
    var pumpVolScore   = clamp01((pumpVolRatio2 - CFG.volSpike) / Math.max(3 - CFG.volSpike, 1e-9));
    var rsiOBScore     = isFiniteNum(rsi14) ? clamp01((rsi14 - 60) / 20) : 0.5;
    var liqScore2      = clamp01((offInfo.dvRatio - 1) / 1.5);
    var scoreShort01 = weightedScore01({ farAboveBB: farAboveScore, wickSize: wickScore2, stallBody: stallBodyScore, stallVol: stallVolScore, pumpVol: pumpVolScore, rsiOB: rsiOBScore, liquidity: liqScore2 }, Ws);
    var scoreShort = Math.round(scoreShort01 * 100), gradeShort = gradeByScore(scoreShort);
    result.pass = true; result.action = 'SHORT';
    result.shortSetup = {
      pass: true, entry: shortEntry2, altEntry: altShort2, sl: slShort2, tp: tpShort2,
      reason: 'Climax top: far above BB + upper-wick lớn + stall & vol drop',
      score: scoreShort, grade: gradeShort,
      factors: { farAboveBB: +farAboveScore.toFixed(2), wickSize: +wickScore2.toFixed(2), stallBody: +stallBodyScore.toFixed(2), stallVol: +stallVolScore.toFixed(2), pumpVol: +pumpVolScore.toFixed(2), rsiOB: +rsiOBScore.toFixed(2), liquidity: +liqScore2.toFixed(2), volRatio: +pumpVolRatio2.toFixed(2), rsi14val: isFiniteNum(rsi14) ? +rsi14.toFixed(1) : null },
    };
    result.reason = 'Climax/stall – ưu tiên SHORT';
    result.note = 'pumpBody%=' + (pumpBodyPct * 100).toFixed(2) + '% | stallBody%=' + (stallBodyP2 * 100).toFixed(2) + '% | score=' + scoreShort + '(' + gradeShort + ')';
    return result;
  }

  // ── SHORT: sustained dump (active selling, no consolidation required) ─────────
  // Khác early_dump: không cần box/squeeze — detect coin đang xả mạnh liên tiếp
  var DUMP_CONSEC = 3; // số nến đỏ liên tiếp tối thiểu
  var dumpConsecOk = true;
  var dumpBodySum2 = 0, dumpVolSum2 = 0;
  for (var di = 0; di < Math.min(DUMP_CONSEC, n - 1); di++) {
    var dc = candles[n - 1 - di];
    if (+dc.close >= +dc.open) { dumpConsecOk = false; break; }
    dumpBodySum2 += Math.abs(+dc.close - +dc.open);
    dumpVolSum2  += +dc.volume;
  }
  // Nến hiện tại có vol cao hơn trung bình
  var dumpVolRatio = lastVol / Math.max(avgVol, 1e-9);
  var dumpVolOk    = dumpVolRatio >= 1.5;
  // Momentum EMA bearish ít nhất ema5 < ema13
  var dumpEmaOk    = isFiniteNum(ema5) && isFiniteNum(ema13) && ema5 < ema13;
  // RSI đang yếu
  var dumpRsiOk    = isFiniteNum(rsi6) && rsi6 < 45;
  // Tổng body của các nến đỏ đủ lớn vs ATR
  var dumpBodyOk   = dumpBodySum2 >= _atr * 1.2;
  // Giá đã rớt ít nhất 0.8% trong 5 nến gần nhất
  var dumpLookback = Math.min(5, n - 1);
  var priceBack    = +candles[n - 1 - dumpLookback].close;
  var dumpMovePct  = (priceBack - lc) / Math.max(priceBack, 1e-9);
  var dumpMoveOk   = dumpMovePct >= 0.008;

  var isDump = dumpConsecOk && dumpVolOk && dumpEmaOk && dumpRsiOk && dumpBodyOk && dumpMoveOk;
  // intentionally no shortRegimeOk — dump fires even in bull market when coin is locally dumping

  if (isDump) {
    // Entry: giá hiện tại, hoặc pullback nhẹ lên EMA13 nếu gần hơn
    var dumpEntryRaw = lc * (1 + offInfo.off * 0.3); // chút buffer để không chase
    var dumpAltRaw   = Math.max(ema5, ema13) * (1 - Math.min(offInfo.off * 0.2, 0.0005));
    var dumpSlRaw    = Math.max(lh, ema13) + CFG.slAtrMultShort * offInfo.atr;
    var dumpTpRaw    = lc - CFG.tpAtrMultShort * offInfo.atr;

    var dumpEntry  = roundToTickSide(dumpEntryRaw, tickSize, 'FLOOR');
    var dumpAlt    = roundToTickSide(dumpAltRaw, tickSize, 'FLOOR');
    var dumpSl     = roundToTickSide(dumpSlRaw, tickSize, 'CEIL');
    var dumpTp     = roundToTickSide(dumpTpRaw, tickSize, 'FLOOR');

    // Scoring
    var dSc_consec  = clamp01(DUMP_CONSEC / 3); // luôn = 1 nếu đủ 3 nến
    var dSc_vol     = clamp01((dumpVolRatio - 1.5) / 2.5);
    var dSc_move    = clamp01((dumpMovePct - 0.008) / 0.02);
    var dSc_body    = clamp01(dumpBodySum2 / Math.max(_atr * 2, 1e-9));
    var dSc_rsi     = isFiniteNum(rsi6) ? clamp01((45 - rsi6) / 20) : 0.5;
    var dSc_ema     = emaBear ? 1 : 0.5; // full score nếu toàn ribbon bear
    var dSc_regime  = shortRegimeOk ? 1 : 0;

    var scoreDump01 = weightedScore01({
      consec: dSc_consec, volume: dSc_vol, move: dSc_move,
      body: dSc_body, rsi: dSc_rsi, ema: dSc_ema, regime: dSc_regime,
    }, { consec: 0.15, volume: 0.25, move: 0.20, body: 0.15, rsi: 0.10, ema: 0.10, regime: 0.05 });

    var scoreDump = Math.round(scoreDump01 * 100);
    var gradeDump = gradeByScore(scoreDump);

    result.pass = true;
    result.action = 'SHORT';
    result.shortSetup = {
      pass: true,
      entry: dumpEntry, altEntry: dumpAlt, sl: dumpSl, tp: dumpTp,
      reason: `Sustained dump: ${DUMP_CONSEC} nến đỏ liên tiếp + vol cao + EMA bear`,
      score: scoreDump, grade: gradeDump,
      factors: {
        consec: DUMP_CONSEC, volRatio: +dumpVolRatio.toFixed(2),
        movePct: +(dumpMovePct * 100).toFixed(2),
        body: +dSc_body.toFixed(2), rsi: +dSc_rsi.toFixed(2),
        ema: +dSc_ema.toFixed(2), emaBear: emaBear ? 1 : 0,
        regime: shortRegimeOk ? 1 : 0,
        rsi14val: isFiniteNum(rsi14) ? +rsi14.toFixed(1) : null,
      },
    };
    result.reason = `Sustained dump (${DUMP_CONSEC} nến đỏ) – SHORT`;
    result.note = `DUMP | move=${(dumpMovePct * 100).toFixed(2)}% | vol=${dumpVolRatio.toFixed(1)}x | body=${dumpBodySum2.toFixed(0)} | score=${scoreDump}(${gradeDump})`;
    return result;
  }

  var reasons = [];
  if (rangePct > CFG.consolMaxRangePct) reasons.push('Không tích lũy đủ');
  if (!squeezeOK) reasons.push('BB chưa squeeze');
  if (isPumpNowRaw || isPumpEarlyRaw) {
    if (!longRegimeOk) reasons.push('LONG bị chặn bởi regime (EMA99/ribbon/RSI)');
  } else {
    if (!volSpike) reasons.push('Chưa có vol spike');
    if (!emaBull)  reasons.push('EMA chưa bullish');
    if (!rsiMomentumUp) reasons.push('RSI momentum yếu');
    if (!(lc > bbNow.upper)) reasons.push('Chưa đóng trên BB.upper');
    if (!bodyBig) reasons.push('Thân nến chưa đủ lớn vs ATR');
  }
  result.reason = reasons.join(', ') || 'Chưa rõ ràng';
  result.note = 'range=' + (rangePct * 100).toFixed(2) + '% | BBW=' + (bbNow.bw * 100).toFixed(2) + '%' + (hasEma99 ? (' | distEma99=' + (Math.abs(distToEma99Pct) * 100).toFixed(2) + '%') : '');
  return result;
}
