export const LIQUID_MARKET_DIRECTION_HEALTH_VERSION = 'LIQUID_MARKET_DIRECTION_HEALTH_V3_20260729';

const clamp = (value, min = 0, max = 100) => Math.min(max, Math.max(min, Number(value) || 0));
const round = (value, digits = 1) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const scale = 10 ** digits;
  return Math.round(n * scale) / scale;
};

const SHORT_WAVE_LABELS = {
  SHORT_BUILDUP: { label: 'SHORT BUILDUP', description: 'SHORT score đang tăng nhưng chưa tới 60; lực giảm đang hình thành.', tone: 'watch' },
  SHORT_IMPULSE: { label: 'SHORT IMPULSE', description: 'SHORT score từ 60 trở lên và vẫn tăng; BTC đang trong nhịp giảm mạnh.', tone: 'short' },
  SHORT_PEAK: { label: 'SHORT PEAK', description: 'SHORT score đã đạt vùng 60+ và đang đi ngang tại đỉnh.', tone: 'peak' },
  SHORT_FADE: { label: 'SHORT FADE', description: 'SHORT score đã giảm ít nhất 10 điểm từ đỉnh; lực bán đang suy yếu.', tone: 'fade' },
  BTC_CRASH_RECLAIM: { label: 'BTC CRASH RECLAIM', description: 'SHORT score rời đỉnh trong khi BTC hồi khỏi nhịp sập; bất lợi cho SHORT mới.', tone: 'reclaim' },
  SHORT_RELOAD: { label: 'SHORT RELOAD', description: 'SHORT score tăng trở lại sau nhịp hồi; có nguy cơ BTC tiếp tục giảm.', tone: 'reload' },
  SHORT_NEUTRAL: { label: 'SHORT NEUTRAL', description: 'Chưa có nhịp SHORT rõ ràng.', tone: 'neutral' },
  SHORT_NO_DATA: { label: 'SHORT NO DATA', description: 'Chưa đủ nến đã đóng để xác định nhịp SHORT.', tone: 'no-data' },
};

const LONG_WAVE_LABELS = {
  LONG_BUILDUP: { label: 'LONG BUILDUP', description: 'LONG score đang tăng nhưng chưa tới 60; lực tăng đang hình thành.', tone: 'watch' },
  LONG_IMPULSE: { label: 'LONG IMPULSE', description: 'LONG score từ 60 trở lên và vẫn tăng; BTC đang trong nhịp tăng mạnh.', tone: 'long' },
  LONG_PEAK: { label: 'LONG PEAK', description: 'LONG score đã đạt vùng 60+ và đang đi ngang tại đỉnh.', tone: 'peak' },
  LONG_FADE: { label: 'LONG FADE', description: 'LONG score đã giảm ít nhất 10 điểm từ đỉnh; lực mua đang suy yếu.', tone: 'fade' },
  BTC_RALLY_REJECT: { label: 'BTC RALLY REJECT', description: 'LONG score rời đỉnh trong khi BTC bị từ chối sau nhịp tăng; bất lợi cho LONG mới.', tone: 'reject' },
  LONG_RELOAD: { label: 'LONG RELOAD', description: 'LONG score tăng trở lại sau nhịp điều chỉnh; có khả năng BTC tiếp tục tăng.', tone: 'reload' },
  LONG_NEUTRAL: { label: 'LONG NEUTRAL', description: 'Chưa có nhịp LONG rõ ràng.', tone: 'neutral' },
  LONG_NO_DATA: { label: 'LONG NO DATA', description: 'Chưa đủ nến đã đóng để xác định nhịp LONG.', tone: 'no-data' },
};

function shortWaveMeta(state) {
  return SHORT_WAVE_LABELS[state] ?? SHORT_WAVE_LABELS.SHORT_NEUTRAL;
}

function longWaveMeta(state) {
  return LONG_WAVE_LABELS[state] ?? LONG_WAVE_LABELS.LONG_NEUTRAL;
}

function candleNumber(candle, key, index) {
  const value = candle?.[key] ?? candle?.[index];
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function closedCandles(candles, now = Date.now()) {
  const rows = Array.isArray(candles) ? candles.filter(Boolean) : [];
  if (!rows.length) return [];
  const last = rows[rows.length - 1];
  const closeTime = candleNumber(last, 'closeTime', 6);
  if (closeTime == null || closeTime > now) return rows.slice(0, -1);
  return rows;
}

function ema(values, period) {
  if (!Array.isArray(values) || values.length < period) return null;
  const alpha = 2 / (period + 1);
  let value = values[0];
  for (let i = 1; i < values.length; i++) value = alpha * values[i] + (1 - alpha) * value;
  return value;
}

function average(values) {
  const clean = values.filter(Number.isFinite);
  return clean.length ? clean.reduce((sum, value) => sum + value, 0) / clean.length : null;
}

function median(values) {
  const clean = values.filter(Number.isFinite).sort((a, b) => a - b);
  if (!clean.length) return null;
  const middle = Math.floor(clean.length / 2);
  return clean.length % 2 ? clean[middle] : (clean[middle - 1] + clean[middle]) / 2;
}

function pctReturn(closes, bars) {
  if (closes.length < bars + 1) return null;
  const from = closes[closes.length - bars - 1];
  const to = closes[closes.length - 1];
  if (!Number.isFinite(from) || from <= 0 || !Number.isFinite(to)) return null;
  return ((to - from) / from) * 100;
}

function pearson(left, right) {
  const size = Math.min(left.length, right.length);
  if (size < 12) return null;
  const a = left.slice(-size);
  const b = right.slice(-size);
  const avgA = average(a);
  const avgB = average(b);
  let numerator = 0;
  let sumA = 0;
  let sumB = 0;
  for (let i = 0; i < size; i++) {
    const da = a[i] - avgA;
    const db = b[i] - avgB;
    numerator += da * db;
    sumA += da * da;
    sumB += db * db;
  }
  const denominator = Math.sqrt(sumA * sumB);
  return denominator > 0 ? numerator / denominator : null;
}

function candleReturns(candles, count = 24) {
  const closes = candles.map((row) => candleNumber(row, 'close', 4)).filter(Number.isFinite);
  const recent = closes.slice(-(count + 1));
  const returns = [];
  for (let i = 1; i < recent.length; i++) {
    if (recent[i - 1] > 0) returns.push((recent[i] - recent[i - 1]) / recent[i - 1]);
  }
  return returns;
}

function featureFromCandles(candles, btcReturns15m, now) {
  const closed = closedCandles(candles, now);
  if (closed.length < 52) return null;
  const closes = closed.map((row) => candleNumber(row, 'close', 4)).filter(Number.isFinite);
  const volumes = closed.map((row) => candleNumber(row, 'volume', 5)).filter(Number.isFinite);
  if (closes.length < 52 || volumes.length < 24) return null;

  const ret1h = pctReturn(closes, 4);
  const ret3h = pctReturn(closes, 12);
  const ret6h = pctReturn(closes, 24);
  const ema20 = ema(closes.slice(-80), 20);
  const ema50 = ema(closes.slice(-100), 50);
  const last = closes[closes.length - 1];
  const recentVolume = average(volumes.slice(-4));
  const baselineVolume = average(volumes.slice(-24, -4));
  const volumeRatio = baselineVolume > 0 ? recentVolume / baselineVolume : null;
  const correlation = pearson(candleReturns(closed, 24), btcReturns15m);

  return {
    ret1h,
    ret3h,
    ret6h,
    aboveEma20: ema20 != null ? last > ema20 : null,
    aboveEma50: ema50 != null ? last > ema50 : null,
    volumeRatio,
    correlation,
  };
}

function ratio(features, predicate) {
  if (!features.length) return 0;
  return (features.filter(predicate).length / features.length) * 100;
}

function directionEvidence(value, fullMovePct, side = 1) {
  const move = Number(value) * side;
  if (!Number.isFinite(move) || move <= 0) return 0;
  return clamp((move / fullMovePct) * 100);
}

function btcDirectionEvidence({ ret15m, ret1h, ret6h, btcHealth }, side) {
  const healthDirection = String(btcHealth?.btcTrendDir ?? '').toLowerCase();
  const healthScore = Number(btcHealth?.btcTrendScore ?? 0);
  const directionMatches = (side > 0 && healthDirection === 'up') || (side < 0 && healthDirection === 'down');
  const emaMatches = (side > 0 && btcHealth?.emaTrend1h === 'above') || (side < 0 && btcHealth?.emaTrend1h === 'below');
  const rsi = Number(btcHealth?.rsi1h);
  const rsiEvidence = Number.isFinite(rsi)
    ? directionEvidence(side > 0 ? rsi - 50 : 50 - rsi, 18, 1)
    : 0;
  const structure = clamp(
    (directionMatches ? healthScore * 0.7 : 0)
    + (emaMatches ? 20 : 0)
    + rsiEvidence * 0.1,
  );

  return clamp(
    directionEvidence(ret15m, 0.45, side) * 0.20
    + directionEvidence(ret1h, 1.10, side) * 0.30
    + directionEvidence(ret6h, 3.20, side) * 0.25
    + structure * 0.25,
  );
}

function labelText(label) {
  return ({
    LONG_FAVORED: 'Độ rộng alt và BTC đang đồng thuận cho LONG.',
    SHORT_FAVORED: 'Độ rộng alt và BTC đang đồng thuận cho SHORT.',
    MARKET_CHOP: 'Biên độ và độ đồng thuận thấp; thị trường đang nhiễu.',
    MARKET_DISPERSION: 'Alt phân hóa mạnh; LONG và SHORT cùng có nhóm riêng.',
    MARKET_TRANSITION: 'Thị trường đang chuyển pha, chưa có hướng đủ rõ.',
    MARKET_SHOCK: 'BTC biến động bất thường; điểm hướng có độ tin cậy thấp hơn.',
    NO_DATA: 'Chưa đủ dữ liệu nến đã đóng để chấm thị trường.',
  })[label] ?? 'Đang đánh giá thị trường.';
}

function buildReasons({ label, breadth, btc, scores }) {
  const reasons = [];
  reasons.push(`1h: ${breadth.up1hPct.toFixed(0)}% tăng · ${breadth.down1hPct.toFixed(0)}% giảm`);
  if (label === 'LONG_FAVORED') {
    reasons.push(`${breadth.aboveEma20Pct.toFixed(0)}% trên EMA20 · ${breadth.alignedUpPct.toFixed(0)}% đồng thuận 1h/3h/6h`);
  } else if (label === 'SHORT_FAVORED') {
    reasons.push(`${breadth.belowEma20Pct.toFixed(0)}% dưới EMA20 · ${breadth.alignedDownPct.toFixed(0)}% đồng thuận 1h/3h/6h`);
  } else if (label === 'MARKET_DISPERSION') {
    reasons.push(`Hai đuôi mạnh: +${breadth.strongUpPct.toFixed(0)}% / -${breadth.strongDownPct.toFixed(0)}% · corr BTC ${breadth.avgBtcCorrelation.toFixed(2)}`);
  } else {
    reasons.push(`Median |move| 1h ${breadth.medianAbs1hPct.toFixed(2)}% · trung tính ${breadth.neutral1hPct.toFixed(0)}%`);
  }
  reasons.push(`BTC 15m ${btc.ret15m >= 0 ? '+' : ''}${btc.ret15m.toFixed(2)}% · 1h ${btc.ret1h >= 0 ? '+' : ''}${btc.ret1h.toFixed(2)}% · score ${scores.long}/${scores.short}`);
  return reasons;
}

export function evaluateLiquidMarketDirectionHealth({
  universe = [],
  btcCandles5m = [],
  btcCandles15m = [],
  btcCandles1h = [],
  btcHealth = null,
  macroShock = null,
  now = Date.now(),
  minSample = 20,
} = {}) {
  const closedBtc5m = closedCandles(btcCandles5m, now);
  const closedBtc15m = closedCandles(btcCandles15m, now);
  const closedBtc1h = closedCandles(btcCandles1h, now);
  const btcReturns15m = candleReturns(closedBtc15m, 24);
  const features = universe
    .map((row) => featureFromCandles(row?.candles15m, btcReturns15m, now))
    .filter(Boolean);

  const lastBtc5m = closedBtc5m[closedBtc5m.length - 1] ?? null;
  const sampleKey = String(
    candleNumber(lastBtc5m, 'closeTime', 6)
    ?? candleNumber(lastBtc5m, 'openTime', 0)
    ?? Math.floor(now / 300_000) * 300_000,
  );

  if (features.length < minSample) {
    return {
      version: LIQUID_MARKET_DIRECTION_HEALTH_VERSION,
      rawLabel: 'NO_DATA',
      description: labelText('NO_DATA'),
      sampleKey,
      evaluatedAt: now,
      sampleSize: features.length,
      minSample,
      scores: { long: 0, short: 0, confidence: 0 },
      breadth: null,
      btc: null,
      reasons: [`Mới có ${features.length}/${minSample} symbol đủ nến 15m.`],
      observationOnly: true,
      affectsOrders: false,
    };
  }

  const up1hPct = ratio(features, (row) => row.ret1h >= 0.15);
  const down1hPct = ratio(features, (row) => row.ret1h <= -0.15);
  const up3hPct = ratio(features, (row) => row.ret3h >= 0.35);
  const down3hPct = ratio(features, (row) => row.ret3h <= -0.35);
  const up6hPct = ratio(features, (row) => row.ret6h >= 0.65);
  const down6hPct = ratio(features, (row) => row.ret6h <= -0.65);
  const aboveEma20Pct = ratio(features, (row) => row.aboveEma20 === true);
  const belowEma20Pct = ratio(features, (row) => row.aboveEma20 === false);
  const aboveEma50Pct = ratio(features, (row) => row.aboveEma50 === true);
  const belowEma50Pct = ratio(features, (row) => row.aboveEma50 === false);
  const confirmedUpPct = ratio(features, (row) => row.ret1h > 0.15 && row.volumeRatio >= 1.05);
  const confirmedDownPct = ratio(features, (row) => row.ret1h < -0.15 && row.volumeRatio >= 1.05);
  const alignedUpPct = ratio(features, (row) => row.ret1h > 0.05 && row.ret3h > 0.10 && row.ret6h > 0.20);
  const alignedDownPct = ratio(features, (row) => row.ret1h < -0.05 && row.ret3h < -0.10 && row.ret6h < -0.20);
  const strongUpPct = ratio(features, (row) => row.ret1h >= 0.80);
  const strongDownPct = ratio(features, (row) => row.ret1h <= -0.80);
  const neutral1hPct = ratio(features, (row) => Math.abs(row.ret1h) < 0.15);
  const correlations = features.map((row) => row.correlation).filter(Number.isFinite);
  const avgBtcCorrelation = average(correlations) ?? 0;
  const medianAbs1hPct = median(features.map((row) => Math.abs(row.ret1h))) ?? 0;

  const btcCloses5m = closedBtc5m.map((row) => candleNumber(row, 'close', 4)).filter(Number.isFinite);
  const btcCloses15m = closedBtc15m.map((row) => candleNumber(row, 'close', 4)).filter(Number.isFinite);
  const btcCloses1h = closedBtc1h.map((row) => candleNumber(row, 'close', 4)).filter(Number.isFinite);
  const btc = {
    ret15m: pctReturn(btcCloses5m, 3) ?? 0,
    ret1h: pctReturn(btcCloses15m, 4) ?? 0,
    ret6h: pctReturn(btcCloses1h, 6) ?? Number(btcHealth?.pct6h ?? 0),
    trend: String(btcHealth?.btcTrendDir ?? 'flat').toUpperCase(),
    trendScore: Number(btcHealth?.btcTrendScore ?? 0),
    rsi1h: Number.isFinite(Number(btcHealth?.rsi1h)) ? Number(btcHealth.rsi1h) : null,
  };
  const btcLong = btcDirectionEvidence({ ...btc, btcHealth }, 1);
  const btcShort = btcDirectionEvidence({ ...btc, btcHealth }, -1);

  const longScore = clamp(
    (up1hPct * 0.45 + up3hPct * 0.35 + up6hPct * 0.20) * 0.25
    + (aboveEma20Pct * 0.60 + aboveEma50Pct * 0.40) * 0.20
    + btcLong * 0.25
    + confirmedUpPct * 0.15
    + alignedUpPct * 0.15,
  );
  const shortScore = clamp(
    (down1hPct * 0.45 + down3hPct * 0.35 + down6hPct * 0.20) * 0.25
    + (belowEma20Pct * 0.60 + belowEma50Pct * 0.40) * 0.20
    + btcShort * 0.25
    + confirmedDownPct * 0.15
    + alignedDownPct * 0.15,
  );
  const gap = longScore - shortScore;
  const shockActive = Boolean(macroShock?.active ?? btcHealth?.macroShock?.active)
    || (Math.abs(btc.ret15m) >= 1.40 && Math.abs(btc.ret1h) >= 2.20);
  const dispersion = up1hPct >= 25
    && down1hPct >= 25
    && medianAbs1hPct >= 0.35
    && (avgBtcCorrelation < 0.55 || (strongUpPct >= 12 && strongDownPct >= 12));

  let rawLabel = 'MARKET_TRANSITION';
  if (shockActive) rawLabel = 'MARKET_SHOCK';
  else if (dispersion) rawLabel = 'MARKET_DISPERSION';
  else if (longScore >= 55 && gap >= 8 && alignedUpPct >= 25) rawLabel = 'LONG_FAVORED';
  else if (shortScore >= 55 && gap <= -8 && alignedDownPct >= 25) rawLabel = 'SHORT_FAVORED';
  else if (Math.max(longScore, shortScore) < 45 && (neutral1hPct >= 40 || medianAbs1hPct < 0.35)) rawLabel = 'MARKET_CHOP';

  const coverage = clamp((features.length / Math.max(minSample, 80)) * 100);
  const directionClarity = clamp(Math.abs(gap) * 3.2);
  const horizonClarity = clamp(Math.max(alignedUpPct, alignedDownPct) * 1.35);
  const confidence = rawLabel === 'MARKET_DISPERSION'
    ? clamp(coverage * 0.45 + Math.min(up1hPct, down1hPct) * 0.8 + medianAbs1hPct * 18)
    : rawLabel === 'MARKET_CHOP'
      ? clamp(coverage * 0.45 + neutral1hPct * 0.55)
      : clamp(coverage * 0.40 + directionClarity * 0.35 + horizonClarity * 0.25);

  const breadth = {
    up1hPct: round(up1hPct),
    down1hPct: round(down1hPct),
    neutral1hPct: round(neutral1hPct),
    up3hPct: round(up3hPct),
    down3hPct: round(down3hPct),
    up6hPct: round(up6hPct),
    down6hPct: round(down6hPct),
    aboveEma20Pct: round(aboveEma20Pct),
    belowEma20Pct: round(belowEma20Pct),
    aboveEma50Pct: round(aboveEma50Pct),
    belowEma50Pct: round(belowEma50Pct),
    confirmedUpPct: round(confirmedUpPct),
    confirmedDownPct: round(confirmedDownPct),
    alignedUpPct: round(alignedUpPct),
    alignedDownPct: round(alignedDownPct),
    strongUpPct: round(strongUpPct),
    strongDownPct: round(strongDownPct),
    medianAbs1hPct: round(medianAbs1hPct, 2),
    avgBtcCorrelation: round(avgBtcCorrelation, 2),
  };
  const scores = {
    long: Math.round(longScore),
    short: Math.round(shortScore),
    confidence: Math.round(confidence),
  };

  return {
    version: LIQUID_MARKET_DIRECTION_HEALTH_VERSION,
    rawLabel,
    description: labelText(rawLabel),
    sampleKey,
    evaluatedAt: now,
    sampleSize: features.length,
    minSample,
    scores,
    breadth,
    btc: {
      ret15m: round(btc.ret15m, 2),
      ret1h: round(btc.ret1h, 2),
      ret6h: round(btc.ret6h, 2),
      trend: btc.trend,
      trendScore: btc.trendScore,
      rsi1h: round(btc.rsi1h, 1),
    },
    reasons: buildReasons({ label: rawLabel, breadth, btc, scores }),
    observationOnly: true,
    affectsOrders: false,
  };
}

export function stabilizeLiquidMarketDirectionLabel(previous, evaluation, requiredSamples = 2) {
  const rawLabel = evaluation?.rawLabel ?? 'NO_DATA';
  const sampleKey = String(evaluation?.sampleKey ?? '');
  if (!previous?.committedLabel) {
    return {
      committedLabel: rawLabel,
      candidateLabel: null,
      candidateCount: 0,
      lastSampleKey: sampleKey,
    };
  }
  if (previous.committedLabel === 'NO_DATA' && rawLabel !== 'NO_DATA') {
    return {
      committedLabel: rawLabel,
      candidateLabel: null,
      candidateCount: 0,
      lastSampleKey: sampleKey,
    };
  }
  if (previous.lastSampleKey === sampleKey) {
    if (rawLabel === previous.committedLabel || rawLabel === previous.candidateLabel) return previous;
    return {
      ...previous,
      candidateLabel: rawLabel,
      candidateCount: 0,
    };
  }
  if (rawLabel === 'MARKET_SHOCK' || rawLabel === 'NO_DATA') {
    return {
      committedLabel: rawLabel,
      candidateLabel: null,
      candidateCount: 0,
      lastSampleKey: sampleKey,
    };
  }
  if (rawLabel === previous.committedLabel) {
    return {
      committedLabel: previous.committedLabel,
      candidateLabel: null,
      candidateCount: 0,
      lastSampleKey: sampleKey,
    };
  }
  const candidateCount = rawLabel === previous.candidateLabel
    ? Number(previous.candidateCount ?? 0) + 1
    : 1;
  if (candidateCount >= requiredSamples) {
    return {
      committedLabel: rawLabel,
      candidateLabel: null,
      candidateCount: 0,
      lastSampleKey: sampleKey,
    };
  }
  return {
    committedLabel: previous.committedLabel,
    candidateLabel: rawLabel,
    candidateCount,
    lastSampleKey: sampleKey,
  };
}

export function liquidMarketDirectionLabelDescription(label) {
  return labelText(label);
}

export function deriveLiquidMarketDirectionScoreDynamics(previous = null, evaluation = {}) {
  const currentShort = Math.round(clamp(evaluation?.scores?.short));
  const currentLong = Math.round(clamp(evaluation?.scores?.long));
  const sampleKey = String(evaluation?.sampleKey ?? '');
  const previousDynamics = previous?.scoreDynamics && typeof previous.scoreDynamics === 'object'
    ? previous.scoreDynamics
    : null;
  const previousDynamicsNoData = ['SHORT_NO_DATA', 'LONG_NO_DATA'].includes(
    String(previousDynamics?.shortWaveState ?? previousDynamics?.longWaveState ?? '').toUpperCase(),
  );
  const currentHasData = String(evaluation?.rawLabel ?? '') !== 'NO_DATA';
  if (
    previousDynamics
    && sampleKey
    && String(previousDynamics.sampleKey ?? '') === sampleKey
    && !(previousDynamicsNoData && currentHasData)
  ) {
    return { ...previousDynamics };
  }
  if (String(evaluation?.rawLabel ?? '') === 'NO_DATA') {
    const noDataMeta = shortWaveMeta('SHORT_NO_DATA');
    const longNoDataMeta = longWaveMeta('LONG_NO_DATA');
    return {
      ...(previousDynamics ?? {
        shortScore: null,
        longScore: null,
        shortScorePrev: null,
        shortScorePeak: null,
        shortScorePeakAt: null,
        shortScoreSlope: null,
        shortScoreDropFromPeak: null,
        btcRet15m: null,
        btcRet15mAtPeak: null,
        btcDropBeforePeakPct: null,
        btcReclaimPct: null,
        longScorePrev: null,
        longScorePeak: null,
        longScorePeakAt: null,
        longScoreSlope: null,
        longScoreDropFromPeak: null,
        btcRet15mAtLongPeak: null,
        btcRallyBeforePeakPct: null,
        btcRejectFromHighPct: null,
      }),
      sampleKey,
      evaluatedAt: evaluation?.evaluatedAt ?? null,
      shortWaveState: 'SHORT_NO_DATA',
      shortWaveLabel: noDataMeta.label,
      shortWaveDescription: noDataMeta.description,
      shortWaveTone: noDataMeta.tone,
      longWaveState: 'LONG_NO_DATA',
      longWaveLabel: longNoDataMeta.label,
      longWaveDescription: longNoDataMeta.description,
      longWaveTone: longNoDataMeta.tone,
      observationOnly: true,
      affectsOrders: false,
    };
  }

  const previousShortRaw = previousDynamicsNoData
    ? null
    : (previousDynamics?.shortScore ?? previous?.scores?.short);
  const previousShort = previousShortRaw != null && previousShortRaw !== '' && Number.isFinite(Number(previousShortRaw))
    ? Math.round(clamp(previousShortRaw))
    : null;
  const shortScoreSlope = previousShort == null ? 0 : currentShort - previousShort;
  const previousLongRaw = previousDynamicsNoData
    ? null
    : (previousDynamics?.longScore ?? previous?.scores?.long);
  const previousLong = previousLongRaw != null && previousLongRaw !== '' && Number.isFinite(Number(previousLongRaw))
    ? Math.round(clamp(previousLongRaw))
    : null;
  const longScoreSlope = previousLong == null ? 0 : currentLong - previousLong;
  const previousPeak = Number(previousDynamics?.shortScorePeak);
  const previousState = String(previousDynamics?.shortWaveState ?? 'SHORT_NEUTRAL');
  const resetWave = currentShort < 45
    && (previousShort == null || previousShort < 45)
    && !['SHORT_FADE', 'BTC_CRASH_RECLAIM', 'SHORT_RELOAD'].includes(previousState);
  let shortScorePeak = resetWave || !Number.isFinite(previousPeak)
    ? currentShort
    : Math.max(previousPeak, currentShort);

  const btcRet15m = round(evaluation?.btc?.ret15m, 2);
  let btcRet15mAtPeak = Number(previousDynamics?.btcRet15mAtPeak);
  let shortScorePeakAt = previousDynamics?.shortScorePeakAt ?? null;
  let btcDropBeforePeakPct = Number(previousDynamics?.btcDropBeforePeakPct);
  if (!Number.isFinite(btcDropBeforePeakPct) || resetWave) btcDropBeforePeakPct = 0;
  if (btcRet15m != null && (shortScorePeak > Number(previousPeak) || !Number.isFinite(btcRet15mAtPeak))) {
    btcRet15mAtPeak = btcRet15m;
    shortScorePeakAt = evaluation?.evaluatedAt ?? Date.now();
    btcDropBeforePeakPct = Math.max(btcDropBeforePeakPct, Math.max(0, -btcRet15m));
  }
  if (!Number.isFinite(btcRet15mAtPeak)) btcRet15mAtPeak = null;
  const shortScoreDropFromPeak = Math.max(0, shortScorePeak - currentShort);
  const btcReclaimPct = btcRet15m != null && btcRet15mAtPeak != null
    ? Math.max(0, btcRet15m - btcRet15mAtPeak)
    : 0;

  const previousLongPeak = Number(previousDynamics?.longScorePeak);
  const previousLongState = String(previousDynamics?.longWaveState ?? 'LONG_NEUTRAL');
  const resetLongWave = currentLong < 45
    && (previousLong == null || previousLong < 45)
    && !['LONG_FADE', 'BTC_RALLY_REJECT', 'LONG_RELOAD'].includes(previousLongState);
  const longScorePeak = resetLongWave || !Number.isFinite(previousLongPeak)
    ? currentLong
    : Math.max(previousLongPeak, currentLong);
  let btcRet15mAtLongPeak = Number(previousDynamics?.btcRet15mAtLongPeak);
  let longScorePeakAt = previousDynamics?.longScorePeakAt ?? null;
  let btcRallyBeforePeakPct = Number(previousDynamics?.btcRallyBeforePeakPct);
  if (!Number.isFinite(btcRallyBeforePeakPct) || resetLongWave) btcRallyBeforePeakPct = 0;
  if (btcRet15m != null && (longScorePeak > previousLongPeak || !Number.isFinite(btcRet15mAtLongPeak))) {
    btcRet15mAtLongPeak = btcRet15m;
    longScorePeakAt = evaluation?.evaluatedAt ?? Date.now();
    btcRallyBeforePeakPct = Math.max(btcRallyBeforePeakPct, Math.max(0, btcRet15m));
  }
  if (!Number.isFinite(btcRet15mAtLongPeak)) btcRet15mAtLongPeak = null;
  const longScoreDropFromPeak = Math.max(0, longScorePeak - currentLong);
  const btcRejectFromHighPct = btcRet15m != null && btcRet15mAtLongPeak != null
    ? Math.max(0, btcRet15mAtLongPeak - btcRet15m)
    : 0;

  let shortWaveState = 'SHORT_NEUTRAL';
  if (
    previousDynamics?.shortScoreDropFromPeak >= 10
    && shortScoreSlope >= 5
    && btcRet15m != null
    && btcRet15m < 0
  ) {
    shortWaveState = 'SHORT_RELOAD';
  } else if (shortScorePeak >= 60 && shortScoreDropFromPeak >= 10) {
    shortWaveState = btcReclaimPct >= 0.15 || (btcRet15m != null && btcRet15m >= 0.15)
      ? 'BTC_CRASH_RECLAIM'
      : 'SHORT_FADE';
  } else if (currentShort >= 60 && shortScoreSlope > 0) {
    shortWaveState = 'SHORT_IMPULSE';
  } else if (currentShort >= 60) {
    shortWaveState = 'SHORT_PEAK';
  } else if (shortScoreSlope >= 3 || (previousShort == null && currentShort >= 45)) {
    shortWaveState = 'SHORT_BUILDUP';
  }
  const waveMeta = shortWaveMeta(shortWaveState);

  let longWaveState = 'LONG_NEUTRAL';
  if (
    previousDynamics?.longScoreDropFromPeak >= 10
    && longScoreSlope >= 5
    && btcRet15m != null
    && btcRet15m > 0
  ) {
    longWaveState = 'LONG_RELOAD';
  } else if (longScorePeak >= 60 && longScoreDropFromPeak >= 10) {
    longWaveState = btcRejectFromHighPct >= 0.15 || (btcRet15m != null && btcRet15m <= -0.15)
      ? 'BTC_RALLY_REJECT'
      : 'LONG_FADE';
  } else if (currentLong >= 60 && longScoreSlope > 0) {
    longWaveState = 'LONG_IMPULSE';
  } else if (currentLong >= 60) {
    longWaveState = 'LONG_PEAK';
  } else if (longScoreSlope >= 3 || (previousLong == null && currentLong >= 45)) {
    longWaveState = 'LONG_BUILDUP';
  }
  const longMeta = longWaveMeta(longWaveState);

  return {
    sampleKey,
    evaluatedAt: evaluation?.evaluatedAt ?? null,
    shortScore: currentShort,
    longScore: currentLong,
    longScorePrev: previousLong,
    longScorePeak,
    longScorePeakAt,
    longScoreSlope,
    longScoreDropFromPeak,
    longWaveState,
    longWaveLabel: longMeta.label,
    longWaveDescription: longMeta.description,
    longWaveTone: longMeta.tone,
    shortScorePrev: previousShort,
    shortScorePeak,
    shortScorePeakAt,
    shortScoreSlope,
    shortScoreDropFromPeak,
    shortWaveState,
    shortWaveLabel: waveMeta.label,
    shortWaveDescription: waveMeta.description,
    shortWaveTone: waveMeta.tone,
    btcRet15m,
    btcRet15mAtPeak,
    btcDropBeforePeakPct: round(btcDropBeforePeakPct, 2) ?? 0,
    btcReclaimPct: round(btcReclaimPct, 2) ?? 0,
    btcRet15mAtLongPeak,
    btcRallyBeforePeakPct: round(btcRallyBeforePeakPct, 2) ?? 0,
    btcRejectFromHighPct: round(btcRejectFromHighPct, 2) ?? 0,
    observationOnly: true,
    affectsOrders: false,
  };
}

export function buildMarketDirectionSnapshot(marketHealth = {}) {
  const market = marketHealth && typeof marketHealth === 'object' ? marketHealth : {};
  return {
    version: market.version ?? LIQUID_MARKET_DIRECTION_HEALTH_VERSION,
    evaluatedAt: market.evaluatedAt ?? null,
    sampleKey: market.sampleKey ?? null,
    label: market.label ?? market.rawLabel ?? 'NO_DATA',
    rawLabel: market.rawLabel ?? market.label ?? 'NO_DATA',
    pendingLabel: market.pendingLabel ?? null,
    pendingCount: Number(market.pendingCount ?? 0),
    scores: market.scores && typeof market.scores === 'object' ? { ...market.scores } : null,
    breadth: market.breadth && typeof market.breadth === 'object' ? { ...market.breadth } : null,
    btc: market.btc && typeof market.btc === 'object' ? { ...market.btc } : null,
    scoreDynamics: market.scoreDynamics && typeof market.scoreDynamics === 'object'
      ? { ...market.scoreDynamics, observationOnly: true, affectsOrders: false }
      : null,
    sampleSize: Number(market.sampleSize ?? 0),
    universeSize: Number(market.universeSize ?? 0),
    reasons: Array.isArray(market.reasons) ? market.reasons.map(String) : [],
    observationOnly: true,
    affectsOrders: false,
  };
}

export function buildLiquidMarketDirectionSignalLogRecord(trade = {}, marketHealth = {}, loggedAt = Date.now()) {
  return {
    schemaVersion: 1,
    event: 'LIQUID_SIGNAL_MARKET_DIRECTION_SNAPSHOT',
    loggedAt: new Date(loggedAt).toISOString(),
    tradeId: trade.id != null ? String(trade.id) : null,
    symbol: trade.symbol != null ? String(trade.symbol) : null,
    side: trade.side != null ? String(trade.side) : null,
    status: trade.status != null ? String(trade.status) : null,
    source: trade.source != null ? String(trade.source) : null,
    signalType: trade.signalType != null ? String(trade.signalType) : null,
    signalTimeframe: trade.signalTimeframe != null ? String(trade.signalTimeframe) : null,
    signalCreatedAt: trade.createdAt ?? null,
    signalOpenedAt: trade.openedAt ?? null,
    marketDirection: buildMarketDirectionSnapshot(marketHealth),
  };
}
