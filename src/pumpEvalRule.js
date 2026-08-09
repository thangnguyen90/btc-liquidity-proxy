const DEFAULT_SHORT_GOOD_HOURS = [13, 14, 18, 21];

function normalizeToken(value, fallback = 'NO_DATA') {
  const token = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return token || fallback;
}

function btcPhaseOf({ btcTrendDir, btcTrendScore, btcPct6h } = {}) {
  let direction = normalizeToken(btcTrendDir, '');
  const pct6h = Number(btcPct6h);
  if (!['UP', 'DOWN', 'FLAT'].includes(direction)) {
    direction = Number.isFinite(pct6h)
      ? (pct6h > 0.15 ? 'UP' : pct6h < -0.15 ? 'DOWN' : 'FLAT')
      : 'NO_DATA';
  }
  if (direction === 'NO_DATA') return 'BTC_NO_DATA';
  const score = Number(btcTrendScore);
  const strength = Number.isFinite(score)
    ? (score < 45 ? 'WEAK' : score < 65 ? 'MID' : 'STRONG')
    : 'NO_SCORE';
  return `BTC_${direction}_${strength}`;
}

function corrBucketOf(value) {
  const corr = Number(value);
  if (!Number.isFinite(corr)) return 'NO_DATA';
  if (corr < 0.3) return 'DOC_LAP';
  if (corr < 0.5) return 'THEO_YEU';
  return 'THEO';
}

function scoreBucketOf(value) {
  const score = Number(value);
  if (!Number.isFinite(score)) return 'SCORE_NO_DATA';
  if (score >= 90) return 'SCORE_90_PLUS';
  if (score >= 80) return 'SCORE_80_89';
  if (score >= 75) return 'SCORE_75_79';
  return 'SCORE_LT_75';
}

function volumeBucketOf(value) {
  const volume = Number(value);
  if (!Number.isFinite(volume)) return 'VOL_NO_DATA';
  if (volume >= 5) return 'VOL_5X_PLUS';
  if (volume >= 2) return 'VOL_2_5X';
  return 'VOL_LOW';
}

function chaseBucketOf(value) {
  const chase = Number(value);
  if (!Number.isFinite(chase)) return 'CHASE_NO_DATA';
  return chase < 0.3 ? 'CHASE_OK' : 'CHASE_HIGH';
}

function candleNameOf(value) {
  const raw = value && typeof value === 'object'
    ? (value.name ?? value.pattern ?? value.label)
    : value;
  return normalizeToken(raw, 'NO_DATA');
}

export const PUMP_STAGE_2_VERSION = 'PUMP_COMBO_STAGE_2_V1_20260723';
export const PUMP_LIFT_VERSION = 'PUMP_LIFT_OBSERVE_V1_20260723';

function safeMetric(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

/**
 * Compare a Stage 2 cohort with its own Stage 1 parent.
 *
 * The result is observation-only. `basis=BOOTSTRAP` means the estimate still
 * contains trades whose Stage 2 label was reconstructed after entry. Once a
 * cohort has enough captured post-rule trades, `basis=OOS` is returned.
 */
export function evaluatePumpLiftEvidence({
  cohort = {},
  parent = {},
  minClosed = 30,
  minDays = 3,
  minCapturedClosed = 30,
  minDeltaRoe = 0.5,
} = {}) {
  const closed = safeMetric(cohort.closed);
  const days = safeMetric(cohort.days);
  const capturedClosed = safeMetric(cohort.capturedClosed);
  const pnl = safeMetric(cohort.netPnl);
  const avgRoe = safeMetric(cohort.avgNetRoe);
  const parentAvgRoe = safeMetric(parent.avgNetRoe);
  const profitFactor = safeMetric(cohort.profitFactor);
  const positiveDays = safeMetric(cohort.positiveDays);
  const negativeDays = safeMetric(cohort.negativeDays);
  const deltaRoe = avgRoe - parentAvgRoe;
  const stableDayTarget = Math.max(minDays, Math.ceil(days * 0.6));
  const enoughSample = closed >= minClosed && days >= minDays;

  let tier = 'NEUTRAL';
  let code = 'PUMP_LIFT_COLLECT';
  if (enoughSample
      && pnl > 0
      && profitFactor >= 1.15
      && deltaRoe >= minDeltaRoe
      && positiveDays >= stableDayTarget) {
    tier = 'BOOST';
    code = 'PUMP_LIFT_POSITIVE';
  } else if (enoughSample
      && pnl < 0
      && profitFactor < 0.85
      && deltaRoe <= -minDeltaRoe
      && negativeDays >= stableDayTarget) {
    tier = 'DEGRADE';
    code = 'PUMP_LIFT_NEGATIVE';
  } else if (enoughSample) {
    code = 'PUMP_LIFT_UNSTABLE';
  }

  const basis = capturedClosed >= minCapturedClosed ? 'OOS' : 'BOOTSTRAP';
  const actionable = basis === 'OOS' && tier !== 'NEUTRAL';
  const signedDelta = `${deltaRoe >= 0 ? '+' : ''}${deltaRoe.toFixed(2)}%`;
  const reason = enoughSample
    ? `${closed} lệnh/${days} ngày; Net ${pnl >= 0 ? '+' : ''}${pnl.toFixed(3)}; PF ${profitFactor.toFixed(2)}; ΔROE so với combo cha ${signedDelta}; ${positiveDays} ngày dương/${negativeDays} ngày âm.`
    : `Đang gom mẫu: ${closed}/${minClosed} lệnh đóng và ${days}/${minDays} ngày; ΔROE hiện tại ${signedDelta}.`;

  return {
    observationOnly: true,
    affectsEntry: false,
    affectsMargin: false,
    affectsSl: false,
    affectsTp: false,
    tier,
    label: `${tier} · ${basis}`,
    code,
    basis,
    actionable,
    reason,
    version: PUMP_LIFT_VERSION,
    closed,
    days,
    capturedClosed,
    netPnl: +pnl.toFixed(4),
    avgNetRoe: +avgRoe.toFixed(2),
    parentAvgNetRoe: +parentAvgRoe.toFixed(2),
    deltaRoe: +deltaRoe.toFixed(2),
    profitFactor: +profitFactor.toFixed(2),
    positiveDays,
    negativeDays,
  };
}

/**
 * Observation-only Pump classifier.
 *
 * This rule must never be used to allow/block an entry or to change margin,
 * leverage, SL or TP. It deliberately has no GOOD tier because the newest
 * post-rule validation sample did not contain a stable GOOD cohort.
 */
export function getPumpStage2Rule({
  side,
  type,
  interval,
  score,
  volRatio,
  chasePct,
  btcTrendDir,
  btcTrendScore,
  btcPct6h,
  btcCorr,
  candlePattern,
  btcCandlePattern,
} = {}) {
  const tradeSide = normalizeToken(side, 'SIDE_NO_DATA');
  const signalType = normalizeToken(type, 'TYPE_NO_DATA');
  const timeframe = String(interval ?? '').trim().toLowerCase() || '15m';
  const scoreValue = Number(score);
  const volumeValue = Number(volRatio);
  const chaseValue = Number(chasePct);
  const scoreBucket = scoreBucketOf(scoreValue);
  const volumeBucket = volumeBucketOf(volumeValue);
  const chaseBucket = chaseBucketOf(chaseValue);
  const btcPhase = btcPhaseOf({ btcTrendDir, btcTrendScore, btcPct6h });
  const corrBucket = corrBucketOf(btcCorr);
  const symbolCandle = candleNameOf(candlePattern);
  const btcCandle = candleNameOf(btcCandlePattern);
  const contextKey = [
    signalType,
    tradeSide,
    timeframe,
    scoreBucket,
    volumeBucket,
    chaseBucket,
    btcPhase,
    corrBucket,
    `ALT_${symbolCandle}`,
    `BTC_${btcCandle}`,
  ].join('|');

  let tier = 'WATCH';
  let code = 'PUMP_S2_NO_STABLE_EDGE';
  let label = 'WATCH · NO STABLE EDGE';
  let reason = 'Chưa có cohort ổn định qua cả train và mẫu mới; chỉ theo dõi, không đổi logic vào lệnh.';

  const isVol2To5 = Number.isFinite(volumeValue) && volumeValue >= 2 && volumeValue < 5;
  const isChaseOk = Number.isFinite(chaseValue) && chaseValue < 0.3;
  const isPullbackLong = tradeSide === 'LONG' && signalType === 'EMA_PULLBACK';

  if (isPullbackLong
      && symbolCandle === 'BEARISH_ENGULFING'
      && btcCandle === 'BEARISH_CANDLE') {
    tier = 'RISK';
    code = 'PUMP_S2_CANDLE_BEAR_ENGULF_BTC_BEAR';
    label = 'RISK · CANDLE CONFLICT';
    reason = 'EMA Pullback LONG với nến coin Bearish Engulfing + BTC Bearish Candle có mẫu mới âm rõ.';
  } else if (isPullbackLong
      && symbolCandle === 'BEARISH_CANDLE'
      && ['BULLISH_CANDLE', 'BULLISH_MARUBOZU'].includes(btcCandle)) {
    tier = 'RISK';
    code = 'PUMP_S2_CANDLE_ALT_BEAR_BTC_BULL';
    label = 'RISK · CANDLE DIVERGENCE';
    reason = 'EMA Pullback LONG có nến coin bearish nhưng BTC bullish; cohort mới có tail loss lớn.';
  } else if (isPullbackLong
      && symbolCandle === 'BEARISH_CANDLE'
      && btcCandle === 'BEARISH_MARUBOZU') {
    tier = 'WATCH_PLUS';
    code = 'PUMP_S2_CANDLE_PULLBACK_WATCH_PLUS';
    label = 'WATCH+ · CANDLE EDGE';
    reason = 'Cặp EMA Pullback LONG + coin Bearish Candle + BTC Bearish Marubozu đang dương 3/3 ngày, nhưng mẫu còn ngắn nên chưa cấp GOOD.';
  } else if (isPullbackLong
      && scoreValue >= 80
      && scoreValue < 90
      && isVol2To5
      && isChaseOk) {
    tier = 'RISK';
    code = 'PUMP_S2_PULLBACK_80_VOL2_DECAY';
    label = 'RISK · PULLBACK DECAY';
    reason = 'EMA Pullback LONG score 80-89, vol 2-5x suy giảm mạnh trên mẫu mới nhất.';
  } else if (tradeSide === 'SHORT'
      && signalType === 'EARLY_DUMP'
      && scoreValue >= 75
      && scoreValue < 80
      && isVol2To5
      && isChaseOk) {
    tier = 'RISK';
    code = 'PUMP_S2_EARLY_DUMP_DECAY';
    label = 'RISK · EARLY DUMP';
    reason = 'Early Dump SHORT score 75-79, vol 2-5x âm ở cả train và mẫu mới.';
  } else if (isPullbackLong
      && btcPhase === 'BTC_DOWN_WEAK'
      && ['THEO', 'THEO_YEU'].includes(corrBucket)) {
    tier = 'RISK';
    code = 'PUMP_S2_PULLBACK_DOWN_WEAK_CORR';
    label = 'RISK · BTC DOWN WEAK';
    reason = 'EMA Pullback LONG khi BTC_DOWN_WEAK và coin còn bám BTC có cohort mới gần như không có lệnh thắng.';
  } else if (tradeSide === 'SHORT'
      && signalType === 'DUMP'
      && scoreValue >= 90
      && isVol2To5
      && isChaseOk) {
    code = 'PUMP_S2_DUMP_90_VOL2_DRIFT';
    label = 'WATCH · DUMP DRIFT';
    reason = 'Dump SHORT score 90+ từng tốt nhưng mẫu mới đã chuyển âm; tiếp tục shadow, chưa nâng GOOD.';
  } else if (tradeSide === 'LONG'
      && signalType === 'PUMP_BREAKOUT'
      && scoreValue >= 80
      && scoreValue < 90
      && isVol2To5
      && isChaseOk) {
    code = 'PUMP_S2_BREAKOUT_80_VOL2_TEST';
    label = 'WATCH · BREAKOUT TEST';
    reason = 'Pump Breakout LONG score 80-89, vol 2-5x gần hòa nhưng mẫu còn nhỏ; chỉ theo dõi.';
  }

  return {
    observationOnly: true,
    tier,
    code,
    label,
    reason,
    type: signalType,
    interval: timeframe,
    score: Number.isFinite(scoreValue) ? scoreValue : null,
    scoreBucket,
    volRatio: Number.isFinite(volumeValue) ? volumeValue : null,
    volumeBucket,
    chasePct: Number.isFinite(chaseValue) ? chaseValue : null,
    chaseBucket,
    btcPhase,
    corrBucket,
    symbolCandle,
    btcCandle,
    contextKey,
    version: PUMP_STAGE_2_VERSION,
  };
}

export function getPumpEvalRule({
  side,
  type,
  interval,
  score,
  volRatio,
  chasePct,
  marketOk,
  btcTrendDir,
  btcTrendScore,
  btcPct6h,
  btcCorr,
  hour,
  shortGoodHours = DEFAULT_SHORT_GOOD_HOURS,
} = {}) {
  const tradeSide = normalizeToken(side, 'SIDE_NO_DATA');
  const signalType = normalizeToken(type, 'TYPE_NO_DATA');
  const timeframe = String(interval ?? '').trim().toLowerCase() || '15m';
  const scoreValue = Number(score);
  const volumeValue = Number(volRatio);
  const chaseValue = Number(chasePct);
  const scoreBucket = scoreBucketOf(scoreValue);
  const volumeBucket = volumeBucketOf(volumeValue);
  const chaseBucket = chaseBucketOf(chaseValue);
  const btcPhase = btcPhaseOf({ btcTrendDir, btcTrendScore, btcPct6h });
  const corrBucket = corrBucketOf(btcCorr);
  const currentHour = Number(hour);
  const goodShortHour = Number.isFinite(currentHour)
    && new Set(shortGoodHours.map(Number).filter(Number.isFinite)).has(currentHour);
  const contextKey = `${signalType}|${tradeSide}|${timeframe}|${scoreBucket}|${volumeBucket}|${chaseBucket}|${btcPhase}|${corrBucket}`;

  let tier = 'BLOCK';
  let label = 'PUMP_EVAL_DEFAULT_BLOCK';

  if (!['LONG', 'SHORT'].includes(tradeSide)) {
    label = 'PUMP_EVAL_SIDE_BLOCK';
  } else if (timeframe !== '15m') {
    label = signalType === 'MA60_VOLUME_CLUSTER_5M'
      ? 'PUMP_EVAL_MA60_5M_BLOCK'
      : 'PUMP_EVAL_TIMEFRAME_BLOCK';
  } else if (signalType === 'CLIMAX_TOP') {
    label = 'PUMP_EVAL_CLIMAX_TOP_BLOCK';
  } else if (signalType === 'MA60_VOLUME_CLUSTER' || signalType === 'MA60_VOLUME_CLUSTER_5M') {
    label = 'PUMP_EVAL_MA60_TAIL_RISK_BLOCK';
  } else if (marketOk === false) {
    label = 'PUMP_EVAL_MARKET_FAR_BLOCK';
  } else if (!Number.isFinite(scoreValue) || !Number.isFinite(volumeValue) || !Number.isFinite(chaseValue)) {
    label = 'PUMP_EVAL_SIGNAL_DATA_BLOCK';
  } else if (chaseValue >= 0.3) {
    label = 'PUMP_EVAL_CHASE_BLOCK';
  } else if (tradeSide === 'LONG'
      && signalType === 'EMA_PULLBACK'
      && btcPhase === 'BTC_DOWN_STRONG') {
    label = 'PUMP_EVAL_LONG_DOWN_STRONG_BLOCK';
  } else if (tradeSide === 'SHORT'
      && signalType === 'DUMP'
      && scoreBucket === 'SCORE_80_89'
      && corrBucket === 'THEO_YEU'
      && ['BTC_UP_WEAK', 'BTC_DOWN_STRONG'].includes(btcPhase)) {
    label = 'PUMP_EVAL_DUMP_BAD_CONTEXT_BLOCK';
  } else if (tradeSide === 'LONG'
      && signalType === 'EMA_PULLBACK'
      && ((scoreValue >= 80 && scoreValue < 90 && volumeValue >= 2 && volumeValue < 5)
        || (scoreValue >= 90 && volumeValue >= 5))) {
    tier = 'B';
    label = scoreValue >= 90
      ? 'PUMP_EVAL_LONG_PULLBACK_90_VOL5_TEST'
      : 'PUMP_EVAL_LONG_PULLBACK_80_VOL2_TEST';
  } else if (tradeSide === 'LONG'
      && signalType === 'PUMP_BREAKOUT'
      && scoreValue >= 80
      && volumeValue >= 2
      && volumeValue < 5) {
    tier = 'B';
    label = 'PUMP_EVAL_LONG_BREAKOUT_VOL2_TEST';
  } else if (tradeSide === 'SHORT'
      && signalType === 'DUMP'
      && scoreValue >= 90
      && volumeValue >= 2
      && volumeValue < 5) {
    tier = 'B';
    label = goodShortHour
      ? 'PUMP_EVAL_SHORT_DUMP_VOL2_GOOD_HOUR_TEST'
      : 'PUMP_EVAL_SHORT_DUMP_VOL2_TEST';
  } else if (tradeSide === 'SHORT'
      && signalType === 'EARLY_DUMP'
      && scoreValue >= 75
      && scoreValue < 80
      && volumeValue >= 2
      && volumeValue < 5) {
    tier = 'B';
    label = goodShortHour
      ? 'PUMP_EVAL_SHORT_EARLY_DUMP_GOOD_HOUR_TEST'
      : 'PUMP_EVAL_SHORT_EARLY_DUMP_TEST';
  }

  return {
    allow: tier !== 'BLOCK',
    tier,
    label,
    type: signalType,
    interval: timeframe,
    score: Number.isFinite(scoreValue) ? scoreValue : null,
    scoreBucket,
    volRatio: Number.isFinite(volumeValue) ? volumeValue : null,
    volumeBucket,
    chasePct: Number.isFinite(chaseValue) ? chaseValue : null,
    chaseBucket,
    btcPhase,
    corrBucket,
    hour: Number.isFinite(currentHour) ? currentHour : null,
    goodShortHour,
    contextKey,
    reason: `Pump ${tradeSide} type=${signalType} tf=${timeframe} score=${scoreBucket} vol=${volumeBucket} chase=${chaseBucket} btc=${btcPhase} corr=${corrBucket} hour=${Number.isFinite(currentHour) ? currentHour : '-'}; selected=${tier}`,
  };
}

export function getPumpEvalGate(input = {}, env = process.env) {
  if (env.PUMP_PAPER_EVAL_GATE === 'false') return null;
  const shortGoodHours = String(env.PUMP_PAPER_EVAL_SHORT_GOOD_HOURS ?? DEFAULT_SHORT_GOOD_HOURS.join(','))
    .split(',')
    .map((value) => Number(value.trim()))
    .filter(Number.isFinite);
  const rule = getPumpEvalRule({ ...input, shortGoodHours });
  const full = Number(env.PUMP_PAPER_EVAL_A_MARGIN_USDT ?? 10);
  const test = Number(env.PUMP_PAPER_EVAL_B_MARGIN_USDT ?? 1);
  return {
    ...rule,
    marginUsdt: rule.tier === 'A'
      ? (Number.isFinite(full) && full > 0 ? full : 10)
      : rule.tier === 'B'
        ? (Number.isFinite(test) && test > 0 ? test : 1)
        : 0,
    testOnly: rule.tier === 'B',
    version: String(env.PUMP_PAPER_EVAL_VERSION ?? 'PUMP_EVAL_V1_2026_07_20'),
  };
}

export function pumpHardStopLossPrice({ side, entryPrice, leverage, maxLossRoe = 15 } = {}) {
  const entry = Number(entryPrice);
  const lev = Math.max(1, Number(leverage) || 1);
  const roe = Number(maxLossRoe);
  if (!Number.isFinite(entry) || entry <= 0 || !Number.isFinite(roe) || roe <= 0) return null;
  const move = roe / 100 / lev;
  return String(side ?? '').toUpperCase() === 'SHORT'
    ? entry * (1 + move)
    : String(side ?? '').toUpperCase() === 'LONG'
      ? entry * (1 - move)
      : null;
}

export function capPumpStructureStopLoss({ side, entryPrice, leverage, structureSl, maxLossRoe = 15 } = {}) {
  const tradeSide = String(side ?? '').toUpperCase();
  const entry = Number(entryPrice);
  const structure = Number(structureSl);
  const hard = pumpHardStopLossPrice({ side: tradeSide, entryPrice: entry, leverage, maxLossRoe });
  if (!Number.isFinite(hard) || hard <= 0) return null;
  if (!Number.isFinite(structure) || structure <= 0) return hard;
  if (tradeSide === 'LONG') return structure < entry ? Math.max(structure, hard) : hard;
  if (tradeSide === 'SHORT') return structure > entry ? Math.min(structure, hard) : hard;
  return null;
}
