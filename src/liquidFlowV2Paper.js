import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { LIQUID_FLOW_V2_BINANCE_LEVERAGE } from './autoBinancePolicy.js';

export const LIQUID_FLOW_V2_PAPER_VERSION = 'LIQUID_FLOW_V2_PAPER_V31_FADING_WAVE_LIVE_PUMP_BINANCE_20260818';
export const EMA_FAN_LONG_ENTRY_CONFIRMATION_VERSION = 'EMA_FAN_LONG_RETEST_CONFIRM_V1_20260816';
export const LIQUID_FLOW_V2_PAPER_LABEL_DATE_STATS_VERSION = 'LIQUID_FLOW_V2_PAPER_LABEL_DATE_STATS_V1_20260816';
export const LIQUID_FLOW_V2_SWEEP_ENTRY_POLICY_VERSION = 'LIQUID_FLOW_V2_SWEEP_ENTRY_GUARD_V1_20260816';
export const LIQUID_FLOW_V2_PRIMARY_POST_PUMP_BINANCE_VERSION = 'LIQUID_FLOW_V2_PRIMARY_POST_PUMP_BINANCE_V1_2USDT_20260816';
export const LIQUID_FLOW_V2_FADING_WAVE_LIVE_PUMP_BINANCE_VERSION =
  'LIQUID_FLOW_V2_FADING_WAVE_LIVE_PUMP_BINANCE_V1_1USDT_20260818';

function finite(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const normalized = Number(value);
  return Number.isFinite(normalized) ? normalized : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function round(value, digits = 8) {
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function normalizeSettings(settings = {}) {
  return {
    autoEnabled: settings.autoEnabled !== false,
    marginUsdt: clamp(finite(settings.marginUsdt, 10), 1, 100),
    leverage: LIQUID_FLOW_V2_BINANCE_LEVERAGE,
    baseSweepLeverage: LIQUID_FLOW_V2_BINANCE_LEVERAGE,
    baseSweepMaxRiskRoe: clamp(finite(settings.baseSweepMaxRiskRoe, 25), 5, 50),
    hardStopRoe: clamp(finite(settings.hardStopRoe, 20), 5, 50),
    minTakeProfitRoe: clamp(finite(settings.minTakeProfitRoe, 10), 2, 30),
    baseBinanceEnabled: settings.baseBinanceEnabled === true,
    baseBinanceMarginUsdt: clamp(finite(settings.baseBinanceMarginUsdt, 2), 1, 20),
    baseLongBinanceMarginUsdt: clamp(finite(settings.baseLongBinanceMarginUsdt, 2), 1, 20),
    baseBinanceLeverage: LIQUID_FLOW_V2_BINANCE_LEVERAGE,
    preBinanceMarginUsdt: clamp(finite(settings.preBinanceMarginUsdt, 5), 1, 20),
    preBinanceLeverage: LIQUID_FLOW_V2_BINANCE_LEVERAGE,
    htfBinanceEnabled: settings.htfBinanceEnabled !== false,
    htfBinanceMarginUsdt: clamp(finite(settings.htfBinanceMarginUsdt, 5), 1, 20),
    htfBinanceLeverage: LIQUID_FLOW_V2_BINANCE_LEVERAGE,
    emaFanPaperMarginUsdt: clamp(finite(settings.emaFanPaperMarginUsdt, 10), 1, 100),
    emaFanBinanceEnabled: settings.emaFanBinanceEnabled !== false,
    emaFanBinanceMarginUsdt: clamp(finite(settings.emaFanBinanceMarginUsdt, 1), 1, 20),
    emaFanImpulseBinanceMarginUsdt: clamp(finite(settings.emaFanImpulseBinanceMarginUsdt, 5), 1, 20),
    emaFanBinanceLeverage: LIQUID_FLOW_V2_BINANCE_LEVERAGE,
    emaFanRegularLimitBufferPct: clamp(finite(settings.emaFanRegularLimitBufferPct, 1), 0.1, 3),
    emaFanRegularEntryTimeoutMs: clamp(finite(settings.emaFanRegularEntryTimeoutMs, 15 * 60_000), 5 * 60_000, 60 * 60_000),
    emaFanHardStopRoe: clamp(finite(settings.emaFanHardStopRoe, 25), 5, 50),
    emaFanTakeProfitRoe: clamp(finite(settings.emaFanTakeProfitRoe, 10), 2, 30),
    emaFanMaxHoldMs: clamp(finite(settings.emaFanMaxHoldMs, 12 * 60 * 60_000), 30 * 60_000, 48 * 60 * 60_000),
    pumpFlushBinanceEnabled: settings.pumpFlushBinanceEnabled !== false,
    pumpFlushBinanceMarginUsdt: clamp(finite(settings.pumpFlushBinanceMarginUsdt, 1.5), 1, 20),
    pumpFlushBinanceLeverage: LIQUID_FLOW_V2_BINANCE_LEVERAGE,
    primaryPanicBinanceEnabled: settings.primaryPanicBinanceEnabled !== false,
    primaryPanicBinanceMarginUsdt: clamp(finite(settings.primaryPanicBinanceMarginUsdt, 2), 1, 20),
    primaryPanicBinanceLeverage: LIQUID_FLOW_V2_BINANCE_LEVERAGE,
    postPumpReadyBinanceEnabled: settings.postPumpReadyBinanceEnabled !== false,
    postPumpReadyBinanceMarginUsdt: clamp(finite(settings.postPumpReadyBinanceMarginUsdt, 2), 1, 20),
    postPumpReadyBinanceLeverage: LIQUID_FLOW_V2_BINANCE_LEVERAGE,
    fadingWaveLivePumpBinanceEnabled: settings.fadingWaveLivePumpBinanceEnabled !== false,
    fadingWaveLivePumpBinanceMarginUsdt: clamp(finite(settings.fadingWaveLivePumpBinanceMarginUsdt, 1), 1, 20),
    fadingWaveLivePumpBinanceLeverage: LIQUID_FLOW_V2_BINANCE_LEVERAGE,
    baseSweepRetestBufferPct: clamp(finite(settings.baseSweepRetestBufferPct, 0.6), 0.1, 2),
    baseSweepEntryTimeoutMs: clamp(finite(settings.baseSweepEntryTimeoutMs, 30 * 60_000), 5 * 60_000, 2 * 60 * 60_000),
    cooldownMs: clamp(finite(settings.cooldownMs, 30 * 60_000), 5 * 60_000, 24 * 60 * 60_000),
    maxHoldMs: clamp(finite(settings.maxHoldMs, 4 * 60 * 60_000), 30 * 60_000, 48 * 60 * 60_000),
    roundTripFeeRate: clamp(finite(settings.roundTripFeeRate, 0.0008), 0, 0.01),
  };
}

function paperSideOfClassification(classification = {}) {
  if (classification.labelKey === 'UP_SWEEP_SHORT_READY') return 'SHORT';
  if (classification.labelKey === 'DOWN_SWEEP_LONG_READY') return 'LONG';
  if (classification.labelKey === 'UP_BASE_SWEEP_LONG_READY') return 'LONG';
  if (classification.labelKey === 'DOWN_BASE_SWEEP_SHORT_READY') return 'SHORT';
  if (classification.labelKey === 'PRE_UP_BASE_LONG') return 'LONG';
  if (classification.labelKey === 'PRE_DOWN_BASE_SHORT') return 'SHORT';
  if (classification.labelKey === 'HTF_BEAR_15M_EMA99_PUMP_REJECT') return 'SHORT';
  if (classification.labelKey === 'HTF_BULL_15M_EMA99_DUMP_RECLAIM') return 'LONG';
  if (classification.labelKey === 'PUMP_DISTRIBUTION_SHORT_READY') return 'SHORT';
  if (classification.labelKey === 'EXTENDED_EMA99_PANIC_RECLAIM_LONG') return 'LONG';
  if (classification.labelKey === 'PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY') return 'LONG';
  if (classification.labelKey === 'EMA_FAN_LONG_READY') return 'LONG';
  if (classification.labelKey === 'EMA_FAN_LONG_IMPULSE_RUNNER') return 'LONG';
  if (classification.labelKey === 'EMA_FAN_SHORT_READY') return 'SHORT';
  if (classification.labelKey === 'POST_PUMP_SHORT_SQUEEZE_LONG_READY') return 'LONG';
  if (classification.labelKey === 'POST_PUMP_SHORT_SQUEEZE_PRIME') return 'LONG';
  if (classification.labelKey === 'KILL_LONG_EXHAUSTION_RECLAIM_LONG_READY') return 'LONG';
  if (classification.labelKey === 'POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY') return 'LONG';
  if (classification.labelKey === 'FADING_WAVE_LIVE_PUMP_SHORT_READY') return 'SHORT';
  if (classification.labelKey === 'PUMP_FLUSH_RECLAIM_LONG_READY') return 'LONG';
  return null;
}

function isBaseSweepClassification(classification = {}) {
  return classification.labelKey === 'UP_BASE_SWEEP_LONG_READY'
    || classification.labelKey === 'DOWN_BASE_SWEEP_SHORT_READY';
}

function isPreEma99Classification(classification = {}) {
  return classification.labelKey === 'PRE_UP_BASE_LONG'
    || classification.labelKey === 'PRE_DOWN_BASE_SHORT';
}

function isEmaFanClassification(classification = {}) {
  return classification.labelKey === 'EMA_FAN_LONG_READY'
    || classification.labelKey === 'EMA_FAN_LONG_IMPULSE_RUNNER'
    || classification.labelKey === 'EMA_FAN_SHORT_READY';
}

function isPostPumpSqueezeClassification(classification = {}) {
  return classification.labelKey === 'POST_PUMP_SHORT_SQUEEZE_LONG_READY'
    || classification.labelKey === 'POST_PUMP_SHORT_SQUEEZE_PRIME';
}

function isKillLongExhaustionClassification(classification = {}) {
  return classification.labelKey === 'KILL_LONG_EXHAUSTION_RECLAIM_LONG_READY';
}

function isFlagpoleShortKillClassification(classification = {}) {
  return classification.labelKey === 'POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY';
}

function isFadingWaveLivePumpClassification(classification = {}) {
  return classification.labelKey === 'FADING_WAVE_LIVE_PUMP_SHORT_READY';
}

function isPumpFlushReclaimClassification(classification = {}) {
  return classification.labelKey === 'PUMP_FLUSH_RECLAIM_LONG_READY';
}

export function liquidFlowV2AutoBinanceProfile(classification = {}, settingsInput = {}) {
  const settings = normalizeSettings(settingsInput);
  if (classification.labelKey === 'PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY') {
    return {
      eligible: settings.primaryPanicBinanceEnabled,
      cohort: 'PRIMARY_EMA99_PANIC_RECLAIM',
      marginUsdt: settings.primaryPanicBinanceMarginUsdt,
      leverage: LIQUID_FLOW_V2_BINANCE_LEVERAGE,
      source: 'liquid-flow-v2-primary-ema99-panic-reclaim',
    };
  }
  if (classification.labelKey === 'POST_PUMP_SHORT_SQUEEZE_LONG_READY') {
    return {
      eligible: settings.postPumpReadyBinanceEnabled,
      cohort: 'POST_PUMP_SQUEEZE_READY',
      marginUsdt: settings.postPumpReadyBinanceMarginUsdt,
      leverage: LIQUID_FLOW_V2_BINANCE_LEVERAGE,
      source: 'liquid-flow-v2-post-pump-squeeze-ready',
    };
  }
  if (isPumpFlushReclaimClassification(classification)) {
    return {
      eligible: settings.pumpFlushBinanceEnabled,
      cohort: 'PUMP_FLUSH_RECLAIM',
      marginUsdt: settings.pumpFlushBinanceMarginUsdt,
      leverage: LIQUID_FLOW_V2_BINANCE_LEVERAGE,
      source: 'liquid-flow-v2-pump-flush-reclaim',
    };
  }
  if (isFadingWaveLivePumpClassification(classification)) {
    return {
      eligible: settings.fadingWaveLivePumpBinanceEnabled,
      cohort: 'FADING_WAVE_LIVE_PUMP_SHORT',
      marginUsdt: settings.fadingWaveLivePumpBinanceMarginUsdt,
      leverage: LIQUID_FLOW_V2_BINANCE_LEVERAGE,
      source: 'liquid-flow-v2-fading-wave-live-pump-short',
    };
  }
  if (isPostPumpSqueezeClassification(classification)) {
    return {
      eligible: false,
      cohort: 'POST_PUMP_SQUEEZE_PRIME_PAPER',
      marginUsdt: null,
      leverage: null,
      source: null,
    };
  }
  if (isKillLongExhaustionClassification(classification)) {
    return {
      eligible: false,
      cohort: 'KILL_LONG_EXHAUSTION_PAPER',
      marginUsdt: null,
      leverage: null,
      source: null,
    };
  }
  if (isFlagpoleShortKillClassification(classification)) {
    return {
      eligible: false,
      cohort: 'FLAGPOLE_SHORT_KILL_PAPER',
      marginUsdt: null,
      leverage: null,
      source: null,
    };
  }
  if (classification.labelKey === 'EMA_FAN_LONG_READY') {
    return {
      eligible: settings.emaFanBinanceEnabled,
      cohort: 'EMA_FAN_RETEST_CONFIRM',
      marginUsdt: settings.emaFanBinanceMarginUsdt,
      leverage: LIQUID_FLOW_V2_BINANCE_LEVERAGE,
      source: 'liquid-flow-v2-ema-fan-retest-confirm',
    };
  }
  if (classification.labelKey === 'EMA_FAN_LONG_IMPULSE_RUNNER') {
    return {
      eligible: settings.emaFanBinanceEnabled,
      cohort: 'EMA_FAN_IMPULSE',
      marginUsdt: settings.emaFanImpulseBinanceMarginUsdt,
      leverage: LIQUID_FLOW_V2_BINANCE_LEVERAGE,
      source: 'liquid-flow-v2-ema-fan-impulse',
    };
  }
  if (isBaseSweepClassification(classification)) {
    const isLong = classification.labelKey === 'UP_BASE_SWEEP_LONG_READY';
    return {
      eligible: true,
      cohort: 'BASE',
      marginUsdt: isLong ? settings.baseLongBinanceMarginUsdt : settings.baseBinanceMarginUsdt,
      leverage: LIQUID_FLOW_V2_BINANCE_LEVERAGE,
      source: 'liquid-flow-v2-base',
    };
  }
  if (isPreEma99Classification(classification)) {
    return {
      eligible: true,
      cohort: 'PRE_EMA99',
      marginUsdt: settings.preBinanceMarginUsdt,
      leverage: LIQUID_FLOW_V2_BINANCE_LEVERAGE,
      source: 'liquid-flow-v2-pre-ema99',
    };
  }
  if (
    classification.labelKey === 'HTF_BEAR_15M_EMA99_PUMP_REJECT'
    || classification.labelKey === 'HTF_BULL_15M_EMA99_DUMP_RECLAIM'
  ) {
    return {
      eligible: settings.htfBinanceEnabled,
      cohort: 'HTF_EMA99',
      marginUsdt: settings.htfBinanceMarginUsdt,
      leverage: LIQUID_FLOW_V2_BINANCE_LEVERAGE,
      source: 'liquid-flow-v2-htf',
    };
  }
  return { eligible: false, cohort: null, marginUsdt: null, leverage: null, source: null };
}

export function buildLiquidFlowV2PaperPlan(row = {}, settingsInput = {}) {
  const settings = normalizeSettings(settingsInput);
  const side = paperSideOfClassification(row.classification);
  const features = row.features ?? {};
  const candle = features.lastClosedCandle ?? {};
  const liveMark = finite(features.markPrice, finite(candle.close, 0));
  if (!side || liveMark <= 0 || row.classification?.phase !== 'READY') return null;

  const targetZone = side === 'SHORT' ? features.lowerZone : features.upperZone;
  const continuation = isBaseSweepClassification(row.classification);
  const emaFan = isEmaFanClassification(row.classification);
  const postPumpSqueeze = isPostPumpSqueezeClassification(row.classification);
  const killLongExhaustion = isKillLongExhaustionClassification(row.classification);
  const flagpoleShortKill = isFlagpoleShortKillClassification(row.classification);
  const fadingWaveLivePump = isFadingWaveLivePumpClassification(row.classification);
  const pumpFlushReclaim = isPumpFlushReclaimClassification(row.classification);
  const emaFanRegularLimit = row.classification?.labelKey === 'EMA_FAN_LONG_READY';
  const baseStructure = side === 'SHORT' ? features.baseSweepShort : features.baseSweepLong;
  const breakoutLevel = finite(baseStructure?.breakoutLevel, null);
  const retestBufferPct = settings.baseSweepRetestBufferPct;
  const retestEntry = continuation && breakoutLevel != null
    ? side === 'SHORT'
      ? breakoutLevel * (1 - retestBufferPct / 100)
      : breakoutLevel * (1 + retestBufferPct / 100)
    : liveMark;
  const continuationNeedsRetest = continuation && (side === 'SHORT'
    ? retestEntry > liveMark * 1.003
    : retestEntry < liveMark * 0.997);
  const emaFan13 = finite(features.emaFanLong5m?.ema13, null);
  const emaFanLimitEntry = emaFanRegularLimit && emaFan13 != null
    ? emaFan13 * (1 + settings.emaFanRegularLimitBufferPct / 100)
    : null;
  if (emaFanRegularLimit && !(emaFanLimitEntry > 0)) return null;
  const needsRetest = continuationNeedsRetest || emaFanRegularLimit;
  const entryPrice = emaFanRegularLimit ? emaFanLimitEntry : continuationNeedsRetest ? retestEntry : liveMark;
  const planLeverage = settings.leverage;
  const hardStopRoe = emaFan ? settings.emaFanHardStopRoe : settings.hardStopRoe;
  const takeProfitRoe = emaFan ? settings.emaFanTakeProfitRoe : settings.minTakeProfitRoe;
  const riskPct = hardStopRoe / planLeverage;
  const rewardFloorPct = takeProfitRoe / planLeverage;
  const targetZonePrice = finite(targetZone?.price, null);
  const zoneRewardPct = targetZonePrice != null
    ? side === 'SHORT'
      ? (entryPrice - targetZonePrice) / entryPrice * 100
      : (targetZonePrice - entryPrice) / entryPrice * 100
    : null;
  const rewardPct = emaFan || postPumpSqueeze || killLongExhaustion
    || flagpoleShortKill || fadingWaveLivePump ? rewardFloorPct : clamp(
    zoneRewardPct != null && zoneRewardPct > 0 ? zoneRewardPct : riskPct * 1.5,
    rewardFloorPct,
    4,
  );
  const stopLoss = side === 'SHORT'
    ? entryPrice * (1 + riskPct / 100)
    : entryPrice * (1 - riskPct / 100);
  const takeProfit = side === 'SHORT'
    ? entryPrice * (1 - rewardPct / 100)
    : entryPrice * (1 + rewardPct / 100);

  return {
    side,
    leverage: planLeverage,
    entryPrice: round(entryPrice),
    entryBasis: emaFanRegularLimit
      ? `EMA_FAN_EMA13_PLUS_${round(settings.emaFanRegularLimitBufferPct, 2)}PCT_LIMIT`
      : continuationNeedsRetest ? 'BASE_BREAKOUT_RETEST_LIMIT'
        : postPumpSqueeze ? 'POST_PUMP_5M_CLOSED_BREAKOUT_MARK'
          : killLongExhaustion ? 'KILL_LONG_EXHAUSTION_5M_CLOSED_RECLAIM_MARK'
            : flagpoleShortKill ? 'FLAGPOLE_SHORT_KILL_5M_CLOSED_RECLAIM_MARK'
              : fadingWaveLivePump ? 'FADING_WAVE_LIVE_5M_PUMP_MARKET_MARK'
            : pumpFlushReclaim ? 'PUMP_FLUSH_RECLAIM_5M_CLOSED_MARK' : 'LIVE_MARK_AT_READY_SCAN',
    entryMode: needsRetest ? 'PULLBACK_LIMIT' : 'IMMEDIATE_MARK',
    entryTimeoutMs: emaFanRegularLimit
      ? settings.emaFanRegularEntryTimeoutMs
      : continuation ? settings.baseSweepEntryTimeoutMs : null,
    liveMarkAtSignal: round(liveMark),
    retestBufferPct: continuation ? retestBufferPct : null,
    takeProfit: round(takeProfit),
    stopLoss: round(stopLoss),
    riskPct: round(riskPct, 4),
    hardStopRoe: round(hardStopRoe, 2),
    minTakeProfitRoe: round(takeProfitRoe, 2),
    rewardPct: round(rewardPct, 4),
    estimatedRiskRoe: round(riskPct * planLeverage, 2),
    estimatedRewardRoe: round(rewardPct * planLeverage, 2),
    rr: round(rewardPct / riskPct, 2),
    targetBasis: postPumpSqueeze
      ? `POST_PUMP_FIXED_${round(takeProfitRoe, 2)}_ROE`
      : killLongExhaustion
        ? `KILL_LONG_EXHAUSTION_FIXED_${round(takeProfitRoe, 2)}_ROE`
      : flagpoleShortKill
        ? `FLAGPOLE_SHORT_KILL_FIXED_${round(takeProfitRoe, 2)}_ROE`
      : fadingWaveLivePump
        ? `FADING_WAVE_LIVE_PUMP_FIXED_${round(takeProfitRoe, 2)}_ROE`
      : emaFan
      ? `EMA_FAN_FIXED_${round(takeProfitRoe, 2)}_ROE`
      : zoneRewardPct != null && zoneRewardPct > 0
        ? `OPPOSITE_V1_ZONE_WITH_${round(takeProfitRoe, 2)}_ROE_FLOOR`
        : 'RISK_1_5R_FALLBACK',
    invalidationBasis: `FIXED_${round(hardStopRoe, 2)}_ROE_AT_${planLeverage}X`,
  };
}

export function liquidFlowV2PaperMetrics(trade = {}, markInput = null, now = Date.now()) {
  const entry = finite(trade.entryPrice, 0);
  const mark = finite(markInput, finite(trade.exitPrice, entry));
  const leverage = finite(trade.leverage, 10);
  const marginUsdt = finite(trade.marginUsdt, 10);
  const rawReturnPct = entry > 0 && mark > 0
    ? (trade.side === 'SHORT' ? (entry - mark) : (mark - entry)) / entry * 100
    : 0;
  const grossRoe = rawReturnPct * leverage;
  const grossPnl = marginUsdt * grossRoe / 100;
  const fee = marginUsdt * leverage * finite(trade.roundTripFeeRate, 0.0008);
  return {
    markPrice: mark,
    rawReturnPct: round(rawReturnPct, 4),
    grossRoe: round(grossRoe, 3),
    grossPnl: round(grossPnl, 6),
    estimatedFee: round(fee, 6),
    netPnl: round(grossPnl - fee, 6),
    netRoe: round((grossPnl - fee) / marginUsdt * 100, 3),
    ageMs: Math.max(0, now - finite(trade.entryAt, now)),
  };
}

export function evaluateLiquidFlowV2PaperExit(trade = {}, markPrice, now = Date.now()) {
  if (trade.status !== 'OPEN') return null;
  const mark = finite(markPrice, 0);
  const tp = finite(trade.takeProfit, 0);
  const sl = finite(trade.stopLoss, 0);
  if (mark <= 0 || tp <= 0 || sl <= 0) return null;
  if (trade.side === 'SHORT') {
    if (mark <= tp) return { outcome: 'TP', exitPrice: tp, exitAt: now };
    if (mark >= sl) return { outcome: 'SL', exitPrice: sl, exitAt: now };
  } else if (trade.side === 'LONG') {
    if (mark >= tp) return { outcome: 'TP', exitPrice: tp, exitAt: now };
    if (mark <= sl) return { outcome: 'SL', exitPrice: sl, exitAt: now };
  }
  if (now - finite(trade.entryAt, now) >= finite(trade.maxHoldMs, 4 * 60 * 60_000)) {
    return { outcome: 'TIMEOUT', exitPrice: mark, exitAt: now };
  }
  return null;
}

function emaFanGapWidening(fan = {}, currentKey, previousKey, explicitKey) {
  if (typeof fan?.[explicitKey] === 'boolean') return fan[explicitKey];
  const current = finite(fan?.[currentKey], null);
  const previous = finite(fan?.[previousKey], null);
  return current != null && previous != null ? current > Math.max(0, previous) : null;
}

export function evaluateEmaFanLongRetestConfirmation(trade = {}, row = {}, evaluatedAt = Date.now()) {
  if (trade.labelKey !== 'EMA_FAN_LONG_READY' || trade.status !== 'PENDING_ENTRY') {
    return { decision: 'NOT_APPLICABLE', reason: 'not-pending-ema-fan-long' };
  }
  const retestTouchedAt = finite(trade.retestTouchedAt, null);
  if (retestTouchedAt == null) {
    return { decision: 'WAIT_RETEST_TOUCH', reason: 'ema13-retest-not-touched' };
  }

  const features = row?.features ?? {};
  const candle = features.lastClosedCandle ?? {};
  const candleClosedAt = finite(candle.closeTime, finite(features.candleClosedAt, null));
  if (candleClosedAt == null || candleClosedAt <= retestTouchedAt) {
    return {
      decision: 'WAIT_CLOSED_CONFIRMATION',
      reason: 'waiting-first-closed-5m-candle-after-retest',
      candleClosedAt,
    };
  }

  const fan = features.emaFanLong5m ?? {};
  const open = finite(candle.open, null);
  const low = finite(candle.low, null);
  const close = finite(candle.close, null);
  const ema13 = finite(fan.ema13, null);
  const ema25 = finite(fan.ema25, null);
  const ema99 = finite(fan.ema99, null);
  const takerDeltaPct = finite(candle.takerDeltaPct, null);
  const gap1325Widening = emaFanGapWidening(fan, 'gap1325Pct', 'gap1325PrevPct', 'gap1325Widening');
  const gap2599Widening = emaFanGapWidening(fan, 'gap2599Pct', 'gap2599PrevPct', 'gap2599Widening');
  const snapshot = {
    version: EMA_FAN_LONG_ENTRY_CONFIRMATION_VERSION,
    evaluatedAt,
    candleClosedAt,
    open,
    low,
    close,
    ema13,
    ema25,
    ema99,
    takerDeltaPct,
    lastBullish: features.lastBullish === true,
    higherLowConfirmed: features.higherLowConfirmed === true,
    gap1325Widening,
    gap2599Widening,
  };
  if ([open, low, close, ema13, ema25, ema99, takerDeltaPct].some((value) => value == null)
    || gap1325Widening == null || gap2599Widening == null) {
    return { decision: 'WAIT_CONFIRMATION_DATA', reason: 'closed-5m-confirmation-data-incomplete', snapshot };
  }

  const fanOrdered = ema13 > ema25 && ema25 > ema99;
  if (!fanOrdered) {
    return { decision: 'INVALIDATED', reason: 'ema-fan-order-lost', snapshot };
  }
  if (close < ema25) {
    return { decision: 'INVALIDATED', reason: 'closed-5m-lost-ema25', snapshot };
  }
  if (!gap1325Widening && !gap2599Widening) {
    return { decision: 'INVALIDATED', reason: 'both-ema-fan-gaps-contracting', snapshot };
  }

  const confirmed = close >= ema13
    && close > open
    && features.lastBullish === true
    && features.higherLowConfirmed === true
    && takerDeltaPct > 0;
  return confirmed
    ? { decision: 'CONFIRMED', reason: 'closed-5m-reclaim-higher-low-positive-taker', snapshot }
    : { decision: 'WAIT_CONFIRMATION', reason: 'closed-5m-confirmation-not-complete', snapshot };
}

export function summarizeLiquidFlowV2Paper(trades = [], marks = new Map(), now = Date.now()) {
  const decorated = trades.map((trade) => {
    const mark = ['OPEN', 'PENDING_ENTRY'].includes(trade.status)
      ? finite(marks.get(trade.symbol), finite(trade.entryPrice, 0))
      : finite(trade.exitPrice, finite(trade.entryPrice, 0));
    if (trade.status === 'PENDING_ENTRY') {
      return {
        ...trade,
        markPrice: mark,
        rawReturnPct: 0,
        grossRoe: 0,
        grossPnl: 0,
        estimatedFee: 0,
        netPnl: 0,
        netRoe: 0,
        ageMs: Math.max(0, now - finite(trade.pendingSince, now)),
      };
    }
    return { ...trade, ...liquidFlowV2PaperMetrics(trade, mark, now) };
  });
  const closed = decorated.filter((trade) => trade.status === 'CLOSED');
  const open = decorated.filter((trade) => trade.status === 'OPEN');
  const pending = decorated.filter((trade) => trade.status === 'PENDING_ENTRY');
  const cancelled = decorated.filter((trade) => trade.status === 'CANCELLED');
  const wins = closed.filter((trade) => trade.netPnl > 0).length;
  const losses = closed.filter((trade) => trade.netPnl <= 0).length;
  const netPnl = closed.reduce((sum, trade) => sum + finite(trade.netPnl, 0), 0);
  const avgRoe = closed.length ? closed.reduce((sum, trade) => sum + finite(trade.netRoe, 0), 0) / closed.length : 0;
  const grossProfit = closed.filter((trade) => trade.netPnl > 0).reduce((sum, trade) => sum + trade.netPnl, 0);
  const grossLoss = Math.abs(closed.filter((trade) => trade.netPnl < 0).reduce((sum, trade) => sum + trade.netPnl, 0));
  return {
    total: decorated.length,
    open: open.length,
    pending: pending.length,
    cancelled: cancelled.length,
    closed: closed.length,
    wins,
    losses,
    winRate: closed.length ? wins / closed.length * 100 : 0,
    netPnl: round(netPnl, 6),
    avgRoe: round(avgRoe, 3),
    profitFactor: grossLoss > 0 ? round(grossProfit / grossLoss, 3) : grossProfit > 0 ? null : 0,
    openPnl: round(open.reduce((sum, trade) => sum + finite(trade.netPnl, 0), 0), 6),
    trades: decorated.sort((a, b) => (
      finite(b.entryAt, finite(b.pendingSince, 0)) - finite(a.entryAt, finite(a.pendingSince, 0))
    )),
  };
}

function paperTradeEntryTimestamp(trade = {}) {
  const raw = trade.entryAt ?? trade.pendingSince ?? 0;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function paperTradeClosedTimestamp(trade = {}) {
  const raw = trade.closedAt ?? trade.cancelledAt ?? trade.entryAt ?? trade.pendingSince ?? 0;
  const numeric = Number(raw);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

function paperTradeLabelKey(trade = {}) {
  return String(trade.labelKey ?? trade.label ?? 'UNLABELED').trim() || 'UNLABELED';
}

function paperTradeLabel(trade = {}) {
  return String(trade.label ?? trade.labelKey ?? 'Khong nhan').trim() || 'Khong nhan';
}

function bangkokDayStart(day = '') {
  const normalized = String(day ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) throw new Error(`Ngay khong hop le: ${normalized}`);
  const timestamp = Date.parse(`${normalized}T00:00:00+07:00`);
  if (!Number.isFinite(timestamp) || new Date(timestamp + 7 * 60 * 60_000).toISOString().slice(0, 10) !== normalized) {
    throw new Error(`Ngay khong hop le: ${normalized}`);
  }
  return timestamp;
}

function bangkokDayKey(timestamp) {
  const normalized = finite(timestamp, 0);
  return normalized > 0 ? new Date(normalized + 7 * 60 * 60_000).toISOString().slice(0, 10) : '';
}

export function buildLiquidFlowV2PaperLabelDateStats({
  trades = [], marks = new Map(), now = Date.now(), fromDay = '', toDay = '', labelKey = 'ALL', page = 1, pageSize = 10,
} = {}) {
  const normalizedFromDay = String(fromDay ?? '').trim();
  const normalizedToDay = String(toDay ?? '').trim();
  const normalizedLabelKey = String(labelKey ?? 'ALL').trim() || 'ALL';
  const fromTimestamp = normalizedFromDay ? bangkokDayStart(normalizedFromDay) : null;
  const toTimestampExclusive = normalizedToDay ? bangkokDayStart(normalizedToDay) + 24 * 60 * 60_000 : null;
  if (fromTimestamp != null && toTimestampExclusive != null && fromTimestamp >= toTimestampExclusive) {
    throw new Error('Tu ngay phai nho hon hoac bang den ngay.');
  }

  const source = Array.isArray(trades) ? trades : [];
  const labels = [...new Map(source.map((trade) => [paperTradeLabelKey(trade), {
    key: paperTradeLabelKey(trade),
    label: paperTradeLabel(trade),
  }])).values()].sort((a, b) => a.label.localeCompare(b.label, 'vi'));
  const dateFiltered = source.filter((trade) => {
    const timestamp = paperTradeEntryTimestamp(trade);
    if (fromTimestamp != null && timestamp < fromTimestamp) return false;
    if (toTimestampExclusive != null && timestamp >= toTimestampExclusive) return false;
    return true;
  });
  const selected = normalizedLabelKey === 'ALL'
    ? dateFiltered
    : dateFiltered.filter((trade) => paperTradeLabelKey(trade) === normalizedLabelKey);
  const summary = summarizeLiquidFlowV2Paper(selected, marks, now);
  const labelGroups = new Map();
  for (const trade of dateFiltered) {
    const key = paperTradeLabelKey(trade);
    if (normalizedLabelKey !== 'ALL' && key !== normalizedLabelKey) continue;
    if (!labelGroups.has(key)) labelGroups.set(key, []);
    labelGroups.get(key).push(trade);
  }
  const labelStats = [...labelGroups.entries()].map(([key, rows]) => {
    const stats = summarizeLiquidFlowV2Paper(rows, marks, now);
    return {
      key,
      label: paperTradeLabel(rows[0]),
      total: stats.total,
      open: stats.open,
      pending: stats.pending,
      cancelled: stats.cancelled,
      closed: stats.closed,
      wins: stats.wins,
      losses: stats.losses,
      winRate: stats.winRate,
      netPnl: stats.netPnl,
      avgRoe: stats.avgRoe,
      profitFactor: stats.profitFactor,
    };
  }).sort((a, b) => b.closed - a.closed || a.label.localeCompare(b.label, 'vi'));

  const openTrades = summary.trades.filter((trade) => ['OPEN', 'PENDING_ENTRY'].includes(trade.status));
  const closedRecords = summary.trades
    .filter((trade) => ['CLOSED', 'CANCELLED'].includes(trade.status))
    .sort((a, b) => paperTradeClosedTimestamp(b) - paperTradeClosedTimestamp(a));
  const normalizedPageSize = Math.max(1, Math.min(50, Math.trunc(Number(pageSize) || 10)));
  const totalPages = Math.max(1, Math.ceil(closedRecords.length / normalizedPageSize));
  const normalizedPage = Math.min(totalPages, Math.max(1, Math.trunc(Number(page) || 1)));
  const start = (normalizedPage - 1) * normalizedPageSize;
  const { trades: _allDecoratedTrades, ...summaryWithoutTrades } = summary;
  return {
    version: LIQUID_FLOW_V2_PAPER_LABEL_DATE_STATS_VERSION,
    timeZone: 'Asia/Bangkok',
    dateBasis: 'PAPER_ENTRY_AT',
    filters: { fromDay: normalizedFromDay, toDay: normalizedToDay, labelKey: normalizedLabelKey },
    labels,
    ...summaryWithoutTrades,
    openTrades,
    closedTrades: closedRecords.slice(start, start + normalizedPageSize),
    labelStats,
    pagination: {
      page: normalizedPage,
      pageSize: normalizedPageSize,
      totalPages,
      totalRecords: closedRecords.length,
    },
  };
}

export class LiquidFlowV2PaperManager {
  constructor({ file, settings = {}, now = () => Date.now(), onStateChange = null } = {}) {
    this.file = file;
    this.now = now;
    this.onStateChange = onStateChange;
    this.state = {
      version: LIQUID_FLOW_V2_PAPER_VERSION,
      createdAt: new Date(this.now()).toISOString(),
      updatedAt: null,
      settings: normalizeSettings(settings),
      trades: [],
    };
    this.marks = new Map();
    this.initialized = false;
    this.initPromise = null;
    this.saveLock = Promise.resolve();
  }

  async init() {
    if (this.initialized) return this.state;
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      try {
        const parsed = JSON.parse(await readFile(this.file, 'utf8'));
        const runtimePolicy = this.state.settings;
        this.state = {
          ...this.state,
          ...(parsed && typeof parsed === 'object' ? parsed : {}),
          settings: normalizeSettings({
            ...(parsed?.settings ?? {}),
            leverage: runtimePolicy.leverage,
            baseSweepLeverage: runtimePolicy.baseSweepLeverage,
            hardStopRoe: runtimePolicy.hardStopRoe,
            minTakeProfitRoe: runtimePolicy.minTakeProfitRoe,
            baseBinanceEnabled: runtimePolicy.baseBinanceEnabled,
            baseBinanceMarginUsdt: runtimePolicy.baseBinanceMarginUsdt,
            htfBinanceEnabled: runtimePolicy.htfBinanceEnabled,
            htfBinanceMarginUsdt: runtimePolicy.htfBinanceMarginUsdt,
            htfBinanceLeverage: runtimePolicy.htfBinanceLeverage,
            emaFanPaperMarginUsdt: runtimePolicy.emaFanPaperMarginUsdt,
            emaFanBinanceEnabled: runtimePolicy.emaFanBinanceEnabled,
            emaFanBinanceMarginUsdt: runtimePolicy.emaFanBinanceMarginUsdt,
            emaFanImpulseBinanceMarginUsdt: runtimePolicy.emaFanImpulseBinanceMarginUsdt,
            emaFanBinanceLeverage: runtimePolicy.emaFanBinanceLeverage,
            emaFanRegularLimitBufferPct: runtimePolicy.emaFanRegularLimitBufferPct,
            emaFanRegularEntryTimeoutMs: runtimePolicy.emaFanRegularEntryTimeoutMs,
            emaFanHardStopRoe: runtimePolicy.emaFanHardStopRoe,
            emaFanTakeProfitRoe: runtimePolicy.emaFanTakeProfitRoe,
            emaFanMaxHoldMs: runtimePolicy.emaFanMaxHoldMs,
            pumpFlushBinanceEnabled: runtimePolicy.pumpFlushBinanceEnabled,
            pumpFlushBinanceMarginUsdt: runtimePolicy.pumpFlushBinanceMarginUsdt,
            pumpFlushBinanceLeverage: runtimePolicy.pumpFlushBinanceLeverage,
            primaryPanicBinanceEnabled: runtimePolicy.primaryPanicBinanceEnabled,
            primaryPanicBinanceMarginUsdt: runtimePolicy.primaryPanicBinanceMarginUsdt,
            primaryPanicBinanceLeverage: runtimePolicy.primaryPanicBinanceLeverage,
            postPumpReadyBinanceEnabled: runtimePolicy.postPumpReadyBinanceEnabled,
            postPumpReadyBinanceMarginUsdt: runtimePolicy.postPumpReadyBinanceMarginUsdt,
            postPumpReadyBinanceLeverage: runtimePolicy.postPumpReadyBinanceLeverage,
            fadingWaveLivePumpBinanceEnabled: runtimePolicy.fadingWaveLivePumpBinanceEnabled,
            fadingWaveLivePumpBinanceMarginUsdt: runtimePolicy.fadingWaveLivePumpBinanceMarginUsdt,
            fadingWaveLivePumpBinanceLeverage: runtimePolicy.fadingWaveLivePumpBinanceLeverage,
            baseLongBinanceMarginUsdt: runtimePolicy.baseLongBinanceMarginUsdt,
            baseBinanceLeverage: runtimePolicy.baseBinanceLeverage,
            preBinanceMarginUsdt: runtimePolicy.preBinanceMarginUsdt,
            preBinanceLeverage: runtimePolicy.preBinanceLeverage,
          }),
          trades: Array.isArray(parsed?.trades) ? parsed.trades : Array.isArray(parsed) ? parsed : [],
          version: LIQUID_FLOW_V2_PAPER_VERSION,
        };
      } catch (error) {
        if (error?.code !== 'ENOENT') console.warn(`[LiquidFlowV2Paper] load failed: ${error.message}`);
      }
      this.initialized = true;
      this.initPromise = null;
      this._notify('init');
      return this.state;
    })();
    return this.initPromise;
  }

  async updateSettings(patch = {}) {
    await this.init();
    this.state.settings = normalizeSettings({ ...this.state.settings, ...patch });
    await this._save('settings');
    return this.snapshot();
  }

  async createFromReadyTransitions(
    rows = [],
    transitionSymbols = new Set(),
    observedAt = this.now(),
    transitionLabelKeys = new Set(),
  ) {
    await this.init();
    if (!this.state.settings.autoEnabled) return [];
    const created = [];
    for (const row of Array.isArray(rows) ? rows : []) {
      const candidates = new Map();
      if (transitionSymbols.has(row.symbol) && row.classification?.phase === 'READY') {
        candidates.set(row.classification.labelKey, row.classification);
      }
      for (const classification of Array.isArray(row.classification?.secondaryLabels)
        ? row.classification.secondaryLabels
        : []) {
        if (classification?.phase !== 'READY') continue;
        if (!transitionLabelKeys.has(`${row.symbol}|${classification.labelKey}`)) continue;
        candidates.set(classification.labelKey, classification);
      }
      for (const classification of candidates.values()) {
        const effectiveRow = { ...row, classification };
        const plan = buildLiquidFlowV2PaperPlan(effectiveRow, this.state.settings);
        if (!plan) continue;
        const htfEma99Label = classification.labelKey === 'HTF_BEAR_15M_EMA99_PUMP_REJECT'
          || classification.labelKey === 'HTF_BULL_15M_EMA99_DUMP_RECLAIM';
        const distributionLabel = classification.labelKey === 'PUMP_DISTRIBUTION_SHORT_READY';
        const emaFanLabel = isEmaFanClassification(classification);
        const postPumpLabel = isPostPumpSqueezeClassification(classification);
        const flagpoleShortKillLabel = isFlagpoleShortKillClassification(classification);
        const fadingWaveLivePumpLabel = isFadingWaveLivePumpClassification(classification);
        const pumpFlushLabel = isPumpFlushReclaimClassification(classification);
        const signalCandleClosedAt = fadingWaveLivePumpLabel
          ? classification.signalLiveCandleOpenAt
            ?? classification.signalCandleClosedAt
            ?? row.features?.fadingWaveLivePump5m?.liveCandleOpenAt
            ?? row.features?.candleClosedAt
          : flagpoleShortKillLabel
          ? classification.flagpoleShortKillReadyAt
            ?? classification.signalCandleClosedAt
            ?? row.features?.flagpoleShortKill5m?.readyAt
            ?? row.features?.candleClosedAt
          : pumpFlushLabel
          ? classification.pumpFlushReadyAt
            ?? classification.signalCandleClosedAt
            ?? row.features?.pumpFlushReclaim5m?.readyAt
            ?? row.features?.candleClosedAt
          : postPumpLabel
          ? classification.postPumpReadyAt
            ?? classification.signalCandleClosedAt
            ?? row.features?.postPumpShortSqueeze5m?.readyAt
            ?? row.features?.candleClosedAt
          : emaFanLabel
          ? classification.emaFanReadyAt
            ?? classification.signalCandleClosedAt
            ?? (classification.labelKey === 'EMA_FAN_SHORT_READY'
              ? row.features?.emaFanShort5m?.readyAt
              : row.features?.emaFanLong5m?.readyAt)
            ?? row.features?.candleClosedAt
          : distributionLabel
          ? row.features?.pumpDistribution15m?.readyAt
            ?? row.features?.pumpDistribution15m?.candleClosedAt
            ?? row.features?.candleClosedAt
          : htfEma99Label
            ? classification.ema99RetestCandleClosedAt
              ?? row.features?.ema99Retest5m?.candleClosedAt
              ?? row.features?.ema99Retest15m?.candleClosedAt
              ?? row.features?.candleClosedAt
            : row.features?.candleClosedAt;
        const signalKey = `${row.symbol}|${classification.labelKey}|${signalCandleClosedAt ?? observedAt}`;
        if (this.state.trades.some((trade) => trade.signalKey === signalKey)) continue;
        const sweepQualityLabel = classification.labelKey === 'UP_SWEEP_SHORT_READY'
          || classification.labelKey === 'DOWN_SWEEP_LONG_READY';
        if (sweepQualityLabel) {
          const observedDay = bangkokDayKey(observedAt);
          const sameLabelTrades = this.state.trades.filter((trade) => (
            trade.symbol === row.symbol && trade.labelKey === classification.labelKey
          ));
          if (sameLabelTrades.some((trade) => (
            bangkokDayKey(finite(trade.entryAt, finite(trade.pendingSince, 0))) === observedDay
          ))) continue;
          const latestSameLabel = [...sameLabelTrades].sort((a, b) => (
            finite(b.exitAt, finite(b.entryAt, finite(b.pendingSince, 0)))
            - finite(a.exitAt, finite(a.entryAt, finite(a.pendingSince, 0)))
          ))[0];
          const latestFinishedAt = finite(latestSameLabel?.exitAt,
            finite(latestSameLabel?.entryAt, finite(latestSameLabel?.pendingSince, 0)));
          if (latestSameLabel?.outcome === 'SL'
            && observedAt - latestFinishedAt < 4 * 60 * 60_000) continue;
        }
        const activeConflict = this.state.trades.some((trade) => trade.symbol === row.symbol
          && ['OPEN', 'PENDING_ENTRY'].includes(trade.status)
          && (!distributionLabel || trade.labelKey === classification.labelKey));
        if (activeConflict) continue;
        const latestSameSide = this.state.trades
          .filter((trade) => trade.symbol === row.symbol
            && trade.side === plan.side
            && (!distributionLabel || trade.labelKey === classification.labelKey))
          .sort((a, b) => finite(b.entryAt, finite(b.pendingSince, 0)) - finite(a.entryAt, finite(a.pendingSince, 0)))[0];
        const latestStartedAt = finite(latestSameSide?.entryAt, finite(latestSameSide?.pendingSince, 0));
        if (latestSameSide && observedAt - latestStartedAt < this.state.settings.cooldownMs) continue;
        const pendingEntry = plan.entryMode === 'PULLBACK_LIMIT';
        const trade = {
          id: randomUUID(),
          signalKey,
          version: LIQUID_FLOW_V2_PAPER_VERSION,
          source: 'liquid-flow-v2',
          symbol: row.symbol,
          labelKey: classification.labelKey,
          label: classification.label,
          confidence: classification.confidence,
          status: pendingEntry ? 'PENDING_ENTRY' : 'OPEN',
          outcome: null,
          entryAt: pendingEntry ? null : observedAt,
          pendingSince: pendingEntry ? observedAt : null,
          entryExpiresAt: pendingEntry ? observedAt + plan.entryTimeoutMs : null,
          signalCandleClosedAt: signalCandleClosedAt ?? null,
          marginUsdt: emaFanLabel
            ? this.state.settings.emaFanPaperMarginUsdt
            : this.state.settings.marginUsdt,
          leverage: this.state.settings.leverage,
          maxHoldMs: emaFanLabel
            ? this.state.settings.emaFanMaxHoldMs
            : this.state.settings.maxHoldMs,
          roundTripFeeRate: this.state.settings.roundTripFeeRate,
          ...plan,
          plannedEntryPrice: classification.labelKey === 'EMA_FAN_LONG_READY' ? plan.entryPrice : null,
          entryConfirmationRequired: classification.labelKey === 'EMA_FAN_LONG_READY',
          entryConfirmationVersion: classification.labelKey === 'EMA_FAN_LONG_READY'
            ? EMA_FAN_LONG_ENTRY_CONFIRMATION_VERSION
            : null,
          entryConfirmationState: classification.labelKey === 'EMA_FAN_LONG_READY'
            ? 'WAIT_RETEST_TOUCH'
            : null,
          sweepEntryPolicyVersion: sweepQualityLabel ? LIQUID_FLOW_V2_SWEEP_ENTRY_POLICY_VERSION : null,
          sweepEntryDayBangkok: sweepQualityLabel ? bangkokDayKey(observedAt) : null,
          snapshot: {
            change24hPct: row.features?.change24hPct ?? null,
            change1hPct: row.features?.change1hPct ?? null,
            volumeX: row.features?.volumeX ?? null,
            takerDeltaPct: row.features?.takerDeltaPct ?? null,
            openInterestDeltaPct: row.features?.openInterestDeltaPct ?? null,
            openInterestPriorDeltaPct: row.features?.openInterestPriorDeltaPct ?? null,
            openInterestDelta5mPct: row.features?.openInterestDelta5mPct ?? null,
            openInterestStabilizing: row.features?.openInterestStabilizing === true,
            shortLiquidationUsd: row.features?.shortLiquidationUsd ?? null,
            prior5mShortLiquidationUsd: row.features?.prior5mShortLiquidationUsd ?? null,
            shortLiquidationBurst: row.features?.shortLiquidationBurst ?? null,
            shortLiquidationDecayRatio: row.features?.shortLiquidationDecayRatio ?? null,
            shortLiquidationDecaying: row.features?.shortLiquidationDecaying === true,
            shortLiquidationPeakUsd: row.features?.shortLiquidationPeakUsd ?? null,
            longLiquidationUsd: row.features?.longLiquidationUsd ?? null,
            prior5mLongLiquidationUsd: row.features?.prior5mLongLiquidationUsd ?? null,
            longLiquidationDecayRatio: row.features?.longLiquidationDecayRatio ?? null,
            longLiquidationDecaying: row.features?.longLiquidationDecaying === true,
            longLiquidationPeakUsd: row.features?.longLiquidationPeakUsd ?? null,
            upperZone: row.features?.upperZone ?? null,
            lowerZone: row.features?.lowerZone ?? null,
            baseSweepLong: row.features?.baseSweepLong ?? null,
            baseSweepShort: row.features?.baseSweepShort ?? null,
            sweepConfirmation5m: row.features?.sweepConfirmation5m ?? null,
            trend1h: row.features?.trend1h ?? null,
            trend4h: row.features?.trend4h ?? null,
            htfBearTier: row.features?.htfBearTier ?? null,
            htfBullTier: row.features?.htfBullTier ?? null,
            ema99RetestTimeframe: classification.ema99RetestTimeframe ?? null,
            ema99Retest5m: row.features?.ema99Retest5m ?? null,
            ema99Retest15m: row.features?.ema99Retest15m ?? null,
            pumpDistribution15m: row.features?.pumpDistribution15m ?? null,
            postPumpShortSqueeze5m: row.features?.postPumpShortSqueeze5m ?? null,
            flagpoleShortKill5m: row.features?.flagpoleShortKill5m ?? null,
            fadingWaveLivePump5m: row.features?.fadingWaveLivePump5m ?? null,
            pumpFlushReclaim5m: row.features?.pumpFlushReclaim5m ?? null,
            emaFanLong5m: row.features?.emaFanLong5m ?? null,
            emaFanShort5m: row.features?.emaFanShort5m ?? null,
            lastClosedCandle: row.features?.lastClosedCandle ?? null,
            lastBullish: row.features?.lastBullish === true,
            higherLowConfirmed: row.features?.higherLowConfirmed === true,
            signalClosedPrice: row.features?.lastClosedCandle?.close ?? null,
            liveMarkAtSignal: plan.liveMarkAtSignal,
            evidence: classification.evidence ?? [],
          },
        };
        this.state.trades.push(trade);
        this.marks.set(trade.symbol, finite(row.features?.markPrice, trade.entryPrice));
        created.push(trade);
      }
    }
    if (created.length) await this._save('create');
    return created;
  }

  async handlePrice({ symbol: rawSymbol, markPrice, price, eventTime } = {}) {
    await this.init();
    const symbol = String(rawSymbol ?? '').toUpperCase();
    const mark = finite(markPrice, finite(price, 0));
    if (!symbol || mark <= 0) return [];
    this.marks.set(symbol, mark);
    const events = [];
    const now = finite(eventTime, this.now());
    for (const trade of this.state.trades) {
      if (trade.symbol !== symbol) continue;
      if (trade.status === 'PENDING_ENTRY') {
        const invalidated = trade.side === 'LONG'
          ? mark <= finite(trade.stopLoss, 0)
          : mark >= finite(trade.stopLoss, Infinity);
        if (invalidated || now >= finite(trade.entryExpiresAt, Infinity)) {
          Object.assign(trade, {
            status: 'CANCELLED',
            outcome: invalidated ? 'ENTRY_INVALIDATED' : 'ENTRY_TIMEOUT',
            cancelledAt: now,
            markPrice: mark,
          });
          events.push(trade);
          continue;
        }
        const filled = trade.side === 'LONG'
          ? mark <= finite(trade.entryPrice, 0)
          : mark >= finite(trade.entryPrice, Infinity);
        if (filled) {
          if (trade.labelKey === 'EMA_FAN_LONG_READY') {
            if (finite(trade.retestTouchedAt, null) == null) {
              Object.assign(trade, {
                entryConfirmationRequired: true,
                entryConfirmationVersion: EMA_FAN_LONG_ENTRY_CONFIRMATION_VERSION,
                entryConfirmationState: 'WAIT_CLOSED_CONFIRMATION',
                retestTouchedAt: now,
                retestTouchedPrice: mark,
                plannedEntryPrice: finite(trade.plannedEntryPrice, finite(trade.entryPrice, mark)),
                markPrice: mark,
              });
              events.push(trade);
            }
          } else {
            Object.assign(trade, {
              status: 'OPEN',
              entryAt: now,
              entryFilledAt: now,
              markPrice: trade.entryPrice,
            });
            events.push(trade);
          }
        }
        continue;
      }
      if (trade.status !== 'OPEN') continue;
      const exit = evaluateLiquidFlowV2PaperExit(trade, mark, now);
      if (!exit) continue;
      const metrics = liquidFlowV2PaperMetrics(trade, exit.exitPrice, exit.exitAt);
      Object.assign(trade, exit, metrics, { status: 'CLOSED' });
      events.push(trade);
    }
    if (events.length) await this._save('price-event');
    return events;
  }

  async evaluatePendingEntryConfirmations(rows = [], evaluatedAt = this.now()) {
    await this.init();
    const rowBySymbol = new Map((Array.isArray(rows) ? rows : [])
      .map((row) => [String(row?.symbol ?? '').toUpperCase(), row])
      .filter(([symbol]) => symbol));
    const events = [];
    let changed = false;
    for (const trade of this.state.trades) {
      if (trade.status !== 'PENDING_ENTRY' || trade.labelKey !== 'EMA_FAN_LONG_READY') continue;
      if (evaluatedAt >= finite(trade.entryExpiresAt, Infinity)) {
        Object.assign(trade, {
          status: 'CANCELLED',
          outcome: 'ENTRY_TIMEOUT',
          cancelledAt: evaluatedAt,
          entryConfirmationState: 'TIMED_OUT',
        });
        events.push(trade);
        changed = true;
        continue;
      }
      const row = rowBySymbol.get(String(trade.symbol ?? '').toUpperCase());
      if (!row) continue;
      const evaluation = evaluateEmaFanLongRetestConfirmation(trade, row, evaluatedAt);
      const candleClosedAt = finite(evaluation?.snapshot?.candleClosedAt, null);
      if (candleClosedAt != null && candleClosedAt !== finite(trade.entryConfirmationCandleClosedAt, null)) {
        Object.assign(trade, {
          entryConfirmationState: evaluation.decision,
          entryConfirmationReason: evaluation.reason,
          entryConfirmationCandleClosedAt: candleClosedAt,
          entryConfirmationSnapshot: evaluation.snapshot,
        });
        changed = true;
      }
      if (evaluation.decision === 'INVALIDATED') {
        Object.assign(trade, {
          status: 'CANCELLED',
          outcome: 'ENTRY_CONFIRMATION_INVALIDATED',
          cancelledAt: evaluatedAt,
          entryConfirmationState: 'INVALIDATED',
          entryConfirmationReason: evaluation.reason,
          entryConfirmationSnapshot: evaluation.snapshot,
          markPrice: finite(row.features?.markPrice, finite(evaluation.snapshot?.close, trade.entryPrice)),
        });
        events.push(trade);
        changed = true;
        continue;
      }
      if (evaluation.decision !== 'CONFIRMED') continue;

      const confirmedEntry = finite(row.features?.markPrice, finite(evaluation.snapshot?.close, 0));
      if (!(confirmedEntry > 0)) continue;
      const leverage = finite(trade.leverage, LIQUID_FLOW_V2_BINANCE_LEVERAGE);
      const riskPct = finite(trade.hardStopRoe, this.state.settings.emaFanHardStopRoe) / leverage;
      const rewardPct = finite(trade.minTakeProfitRoe, this.state.settings.emaFanTakeProfitRoe) / leverage;
      Object.assign(trade, {
        status: 'OPEN',
        outcome: null,
        entryAt: evaluatedAt,
        entryFilledAt: evaluatedAt,
        entryConfirmedAt: evaluatedAt,
        entryPrice: round(confirmedEntry),
        entryBasis: 'EMA_FAN_RETEST_CLOSED_5M_CONFIRMATION_MARK',
        entryMode: 'RETEST_CONFIRMATION_MARKET',
        stopLoss: round(confirmedEntry * (1 - riskPct / 100)),
        takeProfit: round(confirmedEntry * (1 + rewardPct / 100)),
        riskPct: round(riskPct, 4),
        rewardPct: round(rewardPct, 4),
        rr: round(rewardPct / riskPct, 2),
        markPrice: round(confirmedEntry),
        entryConfirmationState: 'CONFIRMED',
        entryConfirmationReason: evaluation.reason,
        entryConfirmationSnapshot: evaluation.snapshot,
      });
      this.marks.set(trade.symbol, confirmedEntry);
      events.push(trade);
      changed = true;
    }
    if (changed) await this._save('ema-fan-entry-confirmation');
    return events;
  }

  async claimBinanceEntry(tradeId, claimedAt = this.now()) {
    await this.init();
    const trade = this.state.trades.find((row) => row.id === tradeId);
    if (!trade || trade.status !== 'OPEN') return null;
    const profile = liquidFlowV2AutoBinanceProfile({ labelKey: trade.labelKey }, this.state.settings);
    if (!profile.eligible) return null;
    if (trade.binanceEntryState) return null;
    const selectivePolicy = trade.labelKey === 'PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY'
      || trade.labelKey === 'POST_PUMP_SHORT_SQUEEZE_LONG_READY';
    const binanceEntryPolicyVersion = trade.labelKey === 'FADING_WAVE_LIVE_PUMP_SHORT_READY'
      ? LIQUID_FLOW_V2_FADING_WAVE_LIVE_PUMP_BINANCE_VERSION
      : selectivePolicy ? LIQUID_FLOW_V2_PRIMARY_POST_PUMP_BINANCE_VERSION : null;
    Object.assign(trade, {
      binanceEntryState: 'SUBMITTING',
      binanceEntryClaimedAt: claimedAt,
      binanceEntryCohort: profile.cohort,
      ...(binanceEntryPolicyVersion ? {
        binanceEntryPolicyVersion,
      } : {}),
    });
    await this._save('binance-entry-claim');
    return { ...trade };
  }

  async recordBinanceEntryResult(tradeId, result = {}) {
    await this.init();
    const trade = this.state.trades.find((row) => row.id === tradeId);
    if (!trade) return null;
    Object.assign(trade, result, { binanceEntryUpdatedAt: this.now() });
    await this._save('binance-entry-result');
    return { ...trade };
  }

  snapshot() {
    const summary = summarizeLiquidFlowV2Paper(this.state.trades, this.marks, this.now());
    return {
      version: LIQUID_FLOW_V2_PAPER_VERSION,
      observationOnly: !this.state.settings.baseBinanceEnabled
        && !this.state.settings.htfBinanceEnabled
        && !this.state.settings.emaFanBinanceEnabled
        && !this.state.settings.pumpFlushBinanceEnabled
        && !this.state.settings.primaryPanicBinanceEnabled
        && !this.state.settings.postPumpReadyBinanceEnabled
        && !this.state.settings.fadingWaveLivePumpBinanceEnabled,
      labelsObservationOnly: false,
      affectsBinance: this.state.settings.baseBinanceEnabled
        || this.state.settings.htfBinanceEnabled
        || this.state.settings.emaFanBinanceEnabled
        || this.state.settings.pumpFlushBinanceEnabled
        || this.state.settings.primaryPanicBinanceEnabled
        || this.state.settings.postPumpReadyBinanceEnabled
        || this.state.settings.fadingWaveLivePumpBinanceEnabled,
      settings: { ...this.state.settings },
      updatedAt: this.state.updatedAt,
      ...summary,
      trades: summary.trades.slice(0, 300),
    };
  }

  labelDateStats(options = {}) {
    return {
      ...buildLiquidFlowV2PaperLabelDateStats({
        ...options,
        trades: this.state.trades,
        marks: this.marks,
        now: this.now(),
      }),
      settings: { ...this.state.settings },
      updatedAt: this.state.updatedAt,
    };
  }

  activeSymbols() {
    return [...new Set(this.state.trades
      .filter((trade) => ['OPEN', 'PENDING_ENTRY'].includes(trade.status))
      .map((trade) => trade.symbol))];
  }

  pendingConfirmationSymbols() {
    return [...new Set(this.state.trades
      .filter((trade) => trade.status === 'PENDING_ENTRY' && trade.labelKey === 'EMA_FAN_LONG_READY')
      .map((trade) => trade.symbol))];
  }

  async _save(reason) {
    this.state.updatedAt = new Date(this.now()).toISOString();
    const payload = JSON.stringify(this.state, null, 2);
    this.saveLock = this.saveLock.catch(() => {}).then(async () => {
      await mkdir(dirname(this.file), { recursive: true });
      const tempFile = `${this.file}.${process.pid}.${this.now()}.tmp`;
      await writeFile(tempFile, payload, 'utf8');
      await rename(tempFile, this.file);
    });
    await this.saveLock;
    this._notify(reason);
  }

  _notify(reason) {
    try {
      this.onStateChange?.({ reason, snapshot: this.snapshot(), activeSymbols: this.activeSymbols() });
    } catch {}
  }
}
