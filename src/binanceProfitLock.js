export const BINANCE_PROFIT_LOCK_VERSION = 'BINANCE_PROFIT_LOCK_V20_FAST_WAVE_RECOVERY_LOCK_20260902';
export const LEGACY_TRAILING_STOP_DISABLED_VERSION = 'LEGACY_TSL_DISABLED_V1_20260809';
export const MANUAL_BINANCE_PROFIT_LOCK_TRIGGER_ROE = 10;
export const MANUAL_BINANCE_PROFIT_LOCK_FIRST_LOCK_ROE = 1;
export const ORDERS_EXCLUDED_PROFIT_LOCK_TRIGGER_ROE = 10;
export const ORDERS_EXCLUDED_PROFIT_LOCK_ROE = 1;
export const SHORT_TP_ONLY_BREAK_EVEN_TRIGGER_ROE = 10;
export const SHORT_TP_ONLY_BREAK_EVEN_LOCK_ROE = 0;
export const FAST_WAVE_PROFIT_LOCK_TRIGGER_ROE = 30;
export const FAST_WAVE_PROFIT_LOCK_FIRST_LOCK_ROE = 5;
export const FAST_WAVE_PROFIT_LOCK_STEP_ROE = 10;
export const FAST_WAVE_PROFIT_LOCK_TRAIL_GAP_ROE = 25;
export const FAST_WAVE_CHANGE_24H_THRESHOLD_PCT = 10;
export const FAST_WAVE_CHANGE_24H_ENABLED = false;
export const FAST_WAVE_CANDLE_5M_RANGE_THRESHOLD_PCT = 4;
export const FAST_WAVE_CANDLE_15M_RANGE_THRESHOLD_PCT = 6;
export const FAST_WAVE_CANDLE_5M_LOOKBACK = 3;
export const FAST_WAVE_CANDLE_15M_LOOKBACK = 2;
export const FAST_WAVE_CANDLE_WICK_MIN_RATIO = 0.30;
export const FAST_WAVE_CANDLE_REVERSAL_BODY_MIN_RATIO = 0.55;

const finite = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export function isLiquidFlowV2ProfitLockSource(...sources) {
  return sources.some((source) => String(source ?? '').trim().toLowerCase().includes('liquid-flow-v2'));
}

export function isManualBinanceProfitLockSource(...sources) {
  const normalized = sources
    .map((source) => String(source ?? '').trim().toLowerCase())
    .filter(Boolean);
  if (normalized.some((source) => source.includes('manual'))) return true;
  return normalized.length === 0;
}

export function matchesLiquidFlowV2ProfitLockTrade({
  symbol,
  side,
  entryPrice,
  openedAt,
  trades = [],
} = {}) {
  const normalizedSymbol = String(symbol ?? '').trim().toUpperCase();
  const normalizedSide = String(side ?? '').trim().toUpperCase();
  const entry = finite(entryPrice);
  const opened = finite(openedAt);
  if (!normalizedSymbol || !['LONG', 'SHORT'].includes(normalizedSide) || !(entry > 0) || !(opened > 0)) return false;
  return trades.some((trade) => {
    if (String(trade?.symbol ?? '').trim().toUpperCase() !== normalizedSymbol) return false;
    if (String(trade?.side ?? '').trim().toUpperCase() !== normalizedSide) return false;
    if (!['FILLED', 'MANUAL_LIMIT_SUBMITTED'].includes(String(trade?.binanceEntryState ?? ''))) return false;
    const filledAt = finite(trade?.binanceEntryFilledAt ?? trade?.binanceEntryRequestedAt);
    if (!(filledAt > 0) || Math.abs(opened - filledAt) > 5 * 60_000) return false;
    const v2Entry = finite(trade?.binanceEntryPrice ?? trade?.entryPrice);
    return v2Entry > 0 && Math.abs(entry - v2Entry) / v2Entry <= 0.05;
  });
}

export function matchesManualLiquidFlowV2ProfitLockTrade(context = {}) {
  const manualTrades = (context.trades ?? []).filter((trade) => (
    String(trade?.binanceEntryMode ?? '').toUpperCase().startsWith('MANUAL_')
  ));
  return matchesLiquidFlowV2ProfitLockTrade({ ...context, trades: manualTrades });
}

export function resolveBinanceProfitLockRoe(
  roe,
  {
    triggerRoe = 5,
    firstLockRoe = 1,
  } = {},
) {
  const currentRoe = finite(roe);
  const trigger = finite(triggerRoe);
  const firstLock = finite(firstLockRoe);
  if (
    currentRoe == null
    || trigger == null
    || firstLock == null
    || !(trigger > 0)
    || firstLock < 0
    || currentRoe < trigger
  ) return null;
  if (currentRoe >= 15) {
    const steps = Math.floor((currentRoe - 15) / 5);
    return Math.max(firstLock, (15 + steps * 5) - 10);
  }
  return firstLock;
}

export function resolveManualBinanceProfitLockRoe(roe) {
  return resolveBinanceProfitLockRoe(roe, {
    triggerRoe: MANUAL_BINANCE_PROFIT_LOCK_TRIGGER_ROE,
    firstLockRoe: MANUAL_BINANCE_PROFIT_LOCK_FIRST_LOCK_ROE,
  });
}

export function resolveShortTpOnlyBreakEvenProfitLockRoe(roe) {
  return resolveBinanceProfitLockRoe(roe, {
    triggerRoe: SHORT_TP_ONLY_BREAK_EVEN_TRIGGER_ROE,
    firstLockRoe: SHORT_TP_ONLY_BREAK_EVEN_LOCK_ROE,
  });
}

export function resolveOrdersExcludedBinanceProfitLockRoe(roe) {
  const currentRoe = finite(roe);
  return currentRoe != null && currentRoe >= ORDERS_EXCLUDED_PROFIT_LOCK_TRIGGER_ROE
    ? ORDERS_EXCLUDED_PROFIT_LOCK_ROE
    : null;
}

export function parseBinanceFastWaveSymbols(value = '') {
  return new Set(String(value ?? '')
    .split(',')
    .map((symbol) => String(symbol ?? '').trim().toUpperCase())
    .filter(Boolean));
}

function candleAnatomy(candle = {}, side = null) {
  const open = finite(candle?.open);
  const high = finite(candle?.high);
  const low = finite(candle?.low);
  const close = finite(candle?.close);
  if (!(open > 0) || !(high > low) || !(low > 0) || !(close > 0)) return null;
  const range = high - low;
  const body = Math.abs(close - open);
  const upperWick = Math.max(0, high - Math.max(open, close));
  const lowerWick = Math.max(0, Math.min(open, close) - low);
  const direction = close > open ? 'BULLISH' : close < open ? 'BEARISH' : 'DOJI';
  const normalizedSide = String(side ?? '').trim().toUpperCase();
  const isAdverseBody = (
    (normalizedSide === 'LONG' && direction === 'BEARISH')
    || (normalizedSide === 'SHORT' && direction === 'BULLISH')
  );
  return {
    rangePct: (range / open) * 100,
    bodyRatio: body / range,
    upperWickRatio: upperWick / range,
    lowerWickRatio: lowerWick / range,
    maxWickRatio: Math.max(upperWick, lowerWick) / range,
    direction,
    isAdverseBody,
  };
}

export function summarizeBinanceCandleVolatility({
  candles5m = [],
  candles15m = [],
  side = null,
  lookback5m = FAST_WAVE_CANDLE_5M_LOOKBACK,
  lookback15m = FAST_WAVE_CANDLE_15M_LOOKBACK,
  range5mThresholdPct = FAST_WAVE_CANDLE_5M_RANGE_THRESHOLD_PCT,
  range15mThresholdPct = FAST_WAVE_CANDLE_15M_RANGE_THRESHOLD_PCT,
  wickMinRatio = FAST_WAVE_CANDLE_WICK_MIN_RATIO,
  reversalBodyMinRatio = FAST_WAVE_CANDLE_REVERSAL_BODY_MIN_RATIO,
} = {}) {
  const wickThreshold = Math.max(0, finite(wickMinRatio) ?? FAST_WAVE_CANDLE_WICK_MIN_RATIO);
  const reversalBodyThreshold = Math.max(
    0,
    finite(reversalBodyMinRatio) ?? FAST_WAVE_CANDLE_REVERSAL_BODY_MIN_RATIO,
  );
  const threshold5m = finite(range5mThresholdPct);
  const threshold15m = finite(range15mThresholdPct);
  const summarizeFrame = (rows, lookback, rangeThresholdPct, timeframe) => {
    const shapes = (Array.isArray(rows) ? rows : [])
      .slice(-Math.max(1, Number(lookback) || 1))
      .map((candle) => candleAnatomy(candle, side))
      .filter(Boolean);
    const maxRangePct = shapes.length ? Math.max(...shapes.map((shape) => shape.rangePct)) : null;
    const rangeCandidates = rangeThresholdPct == null
      ? []
      : shapes.filter((shape) => shape.rangePct >= rangeThresholdPct);
    const activeCandidates = rangeCandidates.filter((shape) => (
      shape.maxWickRatio >= wickThreshold
      || (shape.isAdverseBody && shape.bodyRatio >= reversalBodyThreshold)
    ));
    const selected = activeCandidates.length
      ? activeCandidates.reduce((best, shape) => (
          shape.rangePct * Math.max(shape.maxWickRatio, shape.bodyRatio) >= best.rangePct * Math.max(best.maxWickRatio, best.bodyRatio)
            ? shape
            : best
        ))
      : null;
    const wickActive = selected?.maxWickRatio >= wickThreshold;
    return {
      active: selected != null,
      reason: selected == null
        ? null
        : wickActive
          ? `CANDLE_WICK_${timeframe}`
          : `CANDLE_BODY_REVERSAL_${timeframe}`,
      maxRangePct,
      maxWickRatio: rangeCandidates.length
        ? Math.max(...rangeCandidates.map((shape) => shape.maxWickRatio))
        : null,
      selected,
      hasLargeDirectionalBody: rangeCandidates.some((shape) => (
        shape.bodyRatio >= reversalBodyThreshold
        && shape.maxWickRatio < wickThreshold
        && !shape.isAdverseBody
      )),
    };
  };
  const frame5m = summarizeFrame(candles5m, lookback5m, threshold5m, '5M');
  const frame15m = summarizeFrame(candles15m, lookback15m, threshold15m, '15M');
  const selectedFrame = frame5m.active ? frame5m : frame15m.active ? frame15m : null;
  const directionalBodyOnly = !selectedFrame
    && (frame5m.hasLargeDirectionalBody || frame15m.hasLargeDirectionalBody);
  return {
    hasCandleData: (Array.isArray(candles5m) && candles5m.length > 0)
      || (Array.isArray(candles15m) && candles15m.length > 0),
    active: selectedFrame != null,
    reason: selectedFrame?.reason ?? (directionalBodyOnly ? 'DIRECTIONAL_BODY_ONLY' : 'NORMAL_CANDLE_RANGE'),
    max5mRangePct: frame5m.maxRangePct,
    max15mRangePct: frame15m.maxRangePct,
    max5mWickRatio: frame5m.maxWickRatio,
    max15mWickRatio: frame15m.maxWickRatio,
    selectedDirection: selectedFrame?.selected?.direction ?? null,
    selectedBodyRatio: selectedFrame?.selected?.bodyRatio ?? null,
    selectedWickRatio: selectedFrame?.selected?.maxWickRatio ?? null,
  };
}

export function classifyBinanceFastWaveProfitLock({
  symbol,
  side,
  isManualOrLiquidFlowV2 = false,
  change24hPct = null,
  explicitSymbols = new Set(),
  change24hEnabled = FAST_WAVE_CHANGE_24H_ENABLED,
  changeThresholdPct = FAST_WAVE_CHANGE_24H_THRESHOLD_PCT,
  candleVolatility = null,
} = {}) {
  const normalizedSymbol = String(symbol ?? '').trim().toUpperCase();
  const normalizedSide = String(side ?? '').trim().toUpperCase();
  if (!normalizedSymbol || !['LONG', 'SHORT'].includes(normalizedSide) || isManualOrLiquidFlowV2 !== true) {
    return { active: false, reason: 'OUT_OF_SCOPE' };
  }
  if (candleVolatility?.hasCandleData === false) {
    return {
      active: false,
      reason: 'CANDLE_DATA_PENDING',
      max5mRangePct: null,
      max15mRangePct: null,
      max5mWickRatio: null,
      max15mWickRatio: null,
    };
  }
  const symbols = explicitSymbols instanceof Set
    ? explicitSymbols
    : parseBinanceFastWaveSymbols(explicitSymbols);
  if (candleVolatility?.active === true) {
    return {
      active: true,
      reason: String(candleVolatility.reason ?? 'CANDLE_WICK_OR_REVERSAL'),
      max5mRangePct: finite(candleVolatility.max5mRangePct),
      max15mRangePct: finite(candleVolatility.max15mRangePct),
      max5mWickRatio: finite(candleVolatility.max5mWickRatio),
      max15mWickRatio: finite(candleVolatility.max15mWickRatio),
      selectedDirection: candleVolatility.selectedDirection ?? null,
      selectedBodyRatio: finite(candleVolatility.selectedBodyRatio),
      selectedWickRatio: finite(candleVolatility.selectedWickRatio),
    };
  }
  const change = finite(change24hPct);
  // V18 intentionally ignores 24h change for fast-wave classification. A daily
  // move says nothing about whether the current entry is inside a violent wick.
  void change24hEnabled;
  void changeThresholdPct;
  return {
    active: false,
    reason: candleVolatility?.reason === 'DIRECTIONAL_BODY_ONLY'
      ? 'DIRECTIONAL_BODY_ONLY'
      : symbols.has(normalizedSymbol)
        ? 'EXPLICIT_SYMBOL_WAIT_WICK_REVERSAL'
        : 'NORMAL_CANDLE_RANGE',
    change24hPct: change,
    max5mRangePct: finite(candleVolatility?.max5mRangePct),
    max15mRangePct: finite(candleVolatility?.max15mRangePct),
    max5mWickRatio: finite(candleVolatility?.max5mWickRatio),
    max15mWickRatio: finite(candleVolatility?.max15mWickRatio),
  };
}

export function binancePositionPriceRoe({
  side,
  entryPrice,
  markPrice,
  leverage,
} = {}) {
  const normalizedSide = String(side ?? '').trim().toUpperCase();
  const entry = finite(entryPrice);
  const mark = finite(markPrice);
  const lev = finite(leverage);
  if (!['LONG', 'SHORT'].includes(normalizedSide) || !(entry > 0) || !(mark > 0) || !(lev > 0)) return null;
  const direction = normalizedSide === 'LONG' ? 1 : -1;
  return ((mark - entry) / entry) * lev * direction * 100;
}

export function resolveBinanceFastWaveProfitLockRoe(
  roe,
  {
    triggerRoe = FAST_WAVE_PROFIT_LOCK_TRIGGER_ROE,
    firstLockRoe = FAST_WAVE_PROFIT_LOCK_FIRST_LOCK_ROE,
    stepRoe = FAST_WAVE_PROFIT_LOCK_STEP_ROE,
    trailGapRoe = FAST_WAVE_PROFIT_LOCK_TRAIL_GAP_ROE,
  } = {},
) {
  const currentRoe = finite(roe);
  const trigger = finite(triggerRoe);
  const firstLock = finite(firstLockRoe);
  const step = finite(stepRoe);
  const trailGap = finite(trailGapRoe);
  if (
    currentRoe == null
    || trigger == null
    || firstLock == null
    || step == null
    || trailGap == null
    || !(trigger > 0)
    || firstLock < 0
    || !(step > 0)
    || trailGap < 0
    || currentRoe < trigger
  ) return null;
  const steppedPeak = trigger + Math.floor((currentRoe - trigger) / step) * step;
  return Math.max(firstLock, steppedPeak - trailGap);
}

export function binanceProfitLockStopPrice({
  side,
  entryPrice,
  leverage,
  lockRoe,
} = {}) {
  const normalizedSide = String(side ?? '').toUpperCase();
  const entry = finite(entryPrice);
  const lev = finite(leverage);
  const lock = finite(lockRoe);
  if (!['LONG', 'SHORT'].includes(normalizedSide) || !(entry > 0) || !(lev > 0) || lock == null || lock < 0) return null;
  const distance = (lock / 100) / lev;
  const price = normalizedSide === 'LONG' ? entry * (1 + distance) : entry * (1 - distance);
  return Number.isFinite(price) && price > 0 ? price : null;
}

export function binanceProfitLockLifecycleKey({
  symbol,
  side,
  entryPrice,
  openedAt = null,
} = {}) {
  const normalizedSymbol = String(symbol ?? '').trim().toUpperCase();
  const normalizedSide = String(side ?? '').trim().toUpperCase();
  const entry = finite(entryPrice);
  const opened = finite(openedAt);
  if (!normalizedSymbol || !['LONG', 'SHORT'].includes(normalizedSide) || !(entry > 0)) return null;
  // Entry is part of the key so a newly opened position cannot inherit the
  // in-memory lock of an older position on the same symbol. openedAt is kept
  // when available to also distinguish an exact-price reopen.
  return [
    normalizedSymbol,
    normalizedSide,
    entry.toPrecision(12),
    opened > 0 ? Math.trunc(opened) : '-',
  ].join('|');
}

export function isBinanceProfitLockImmediateTriggerError(error) {
  const code = Number(error?.code ?? error?.response?.data?.code);
  const message = String(
    error?.message
    ?? error?.msg
    ?? error?.response?.data?.msg
    ?? '',
  );
  return code === -2021 || /order would immediately trigger/i.test(message);
}

export function isBinanceProfitLockTargetBreached({
  side,
  markPrice,
  stopPrice,
} = {}) {
  const normalizedSide = String(side ?? '').trim().toUpperCase();
  const mark = finite(markPrice);
  const stop = finite(stopPrice);
  if (!['LONG', 'SHORT'].includes(normalizedSide) || !(mark > 0) || !(stop > 0)) return false;
  return normalizedSide === 'LONG' ? mark <= stop : mark >= stop;
}

export function hasBinanceProfitLockStopAtTarget({
  orders = [],
  symbol,
  closeSide,
  stopPrice,
  toleranceFraction = 1e-8,
} = {}) {
  const normalizedSymbol = String(symbol ?? '').trim().toUpperCase();
  const normalizedCloseSide = String(closeSide ?? '').trim().toUpperCase();
  const target = finite(stopPrice);
  const tolerance = finite(toleranceFraction);
  if (!normalizedSymbol || !['BUY', 'SELL'].includes(normalizedCloseSide) || !(target > 0)) return false;
  return (Array.isArray(orders) ? orders : []).some((order) => {
    if (String(order?.symbol ?? '').trim().toUpperCase() !== normalizedSymbol) return false;
    if (String(order?.side ?? '').trim().toUpperCase() !== normalizedCloseSide) return false;
    const type = String(order?.orderType ?? order?.origType ?? order?.type ?? '').trim().toUpperCase();
    if (!['STOP', 'STOP_MARKET'].includes(type)) return false;
    const trigger = finite(order?.triggerPrice ?? order?.stopPrice);
    if (!(trigger > 0)) return false;
    const allowedDelta = Math.max(1e-12, Math.abs(target) * Math.max(0, tolerance ?? 0));
    return Math.abs(trigger - target) <= allowedDelta;
  });
}
