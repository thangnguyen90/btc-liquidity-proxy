export const COINGLASS_ZONE_LIFECYCLE_BINANCE_VERSION =
  'COINGLASS_ZONE_LIFECYCLE_BINANCE_V17_SECONDARY_SHORT_BREAKDOWN_ONLY_20260905';
export const COINGLASS_ZONE_LIFECYCLE_SECONDARY_SHORT_LABEL =
  'BREAKDOWN_ACCEPTED_SHORT_READY';
export const COINGLASS_ZONE_LIFECYCLE_PARTIAL_TP_VERSION =
  'COINGLASS_ZONE_LIFECYCLE_PARTIAL_TP_V2_BOTH_SIDES_STRONG_SHORT_20260830';
export const COINGLASS_ZONE_LIFECYCLE_STRONG_SHORT_BREAK_EVEN_VERSION =
  'COINGLASS_ZONE_LIFECYCLE_STRONG_SHORT_BE_V1_FUTURE_ENTRY_RUNNER_ONLY_20260830';
export const COINGLASS_ZONE_LIFECYCLE_MARGIN_USDT = 2;
export const COINGLASS_ZONE_LIFECYCLE_ACCEPTED_BREAKOUT_MARGIN_USDT = 10;
export const COINGLASS_ZONE_LIFECYCLE_UNCONFIRMED_BOUNCE_LONG_MARGIN_USDT = 5;
export const COINGLASS_ZONE_LIFECYCLE_SUPPORT_RECLAIM_MARGIN_USDT = 3;
export const COINGLASS_ZONE_LIFECYCLE_LARGE_TARGET_THRESHOLD_PCT = 5;
export const COINGLASS_ZONE_LIFECYCLE_LARGE_TARGET_MARGIN_USDT = 2;
export const COINGLASS_ZONE_LIFECYCLE_LEVERAGE = 5;
export const COINGLASS_ZONE_LIFECYCLE_STRONG_SHORT_BREAK_EVEN_TRIGGER_ROE = 5;
export const COINGLASS_ZONE_LIFECYCLE_HYPER_VOLATILE_CHANGE_24H_PCT = 25;
export const COINGLASS_ZONE_LIFECYCLE_VIETNAM_TIME_ZONE = 'Asia/Ho_Chi_Minh';
export const COINGLASS_ZONE_LIFECYCLE_LONG_BLOCKED_HOURS = Object.freeze([0, 1, 2, 3, 4, 5]);

const vietnamHourFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: COINGLASS_ZONE_LIFECYCLE_VIETNAM_TIME_ZONE,
  hour: '2-digit',
  hourCycle: 'h23',
});

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function vietnamHour(value = Date.now()) {
  const instant = new Date(Number(value));
  if (!Number.isFinite(instant.getTime())) return null;
  const hour = Number(vietnamHourFormatter.format(instant));
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
}

function positionDirection(position = {}) {
  const explicit = String(position.positionSide ?? '').toUpperCase();
  if (explicit === 'LONG' || explicit === 'SHORT') return explicit;
  const amount = finite(position.positionAmt ?? position.amt);
  return amount > 0 ? 'LONG' : amount < 0 ? 'SHORT' : null;
}

function entryOrder(order = {}) {
  const reduceOnly = order.reduceOnly === true || order.reduceOnly === 'true';
  const closePosition = order.closePosition === true || order.closePosition === 'true';
  return !reduceOnly && !closePosition;
}

export function evaluateCoinglassZoneLifecycleBinanceEntry({
  event = {},
  streamId = 'primary',
  currentPrice,
  positions = [],
  openOrders = [],
  leverage = COINGLASS_ZONE_LIFECYCLE_LEVERAGE,
  marginUsdt = COINGLASS_ZONE_LIFECYCLE_MARGIN_USDT,
  acceptedBreakoutMarginUsdt = COINGLASS_ZONE_LIFECYCLE_ACCEPTED_BREAKOUT_MARGIN_USDT,
  unconfirmedBounceLongMarginUsdt = COINGLASS_ZONE_LIFECYCLE_UNCONFIRMED_BOUNCE_LONG_MARGIN_USDT,
  supportReclaimMarginUsdt = COINGLASS_ZONE_LIFECYCLE_SUPPORT_RECLAIM_MARGIN_USDT,
  largeTargetThresholdPct = COINGLASS_ZONE_LIFECYCLE_LARGE_TARGET_THRESHOLD_PCT,
  largeTargetMarginUsdt = COINGLASS_ZONE_LIFECYCLE_LARGE_TARGET_MARGIN_USDT,
  maxSlippagePct = 1.5,
  now = Date.now(),
} = {}) {
  const symbol = String(event.symbol ?? '').trim().toUpperCase();
  const side = String(event.entryPlan?.side ?? '').toUpperCase();
  const signalEntry = finite(event.entryPlan?.entryPrice);
  const mark = finite(currentPrice);
  const takeProfit = finite(event.entryPlan?.takeProfitPrice);
  const bandLow = finite(event.zone?.bandLow);
  const bandHigh = finite(event.zone?.bandHigh);
  const lev = Math.max(1, finite(leverage) ?? COINGLASS_ZONE_LIFECYCLE_LEVERAGE);
  const baseMargin = Math.max(0.01, finite(marginUsdt) ?? COINGLASS_ZONE_LIFECYCLE_MARGIN_USDT);
  const largeMargin = Math.max(
    baseMargin,
    finite(largeTargetMarginUsdt) ?? COINGLASS_ZONE_LIFECYCLE_LARGE_TARGET_MARGIN_USDT,
  );
  const supportReclaimMargin = Math.max(
    baseMargin,
    finite(supportReclaimMarginUsdt) ?? COINGLASS_ZONE_LIFECYCLE_SUPPORT_RECLAIM_MARGIN_USDT,
  );
  const acceptedBreakoutMargin = Math.max(
    baseMargin,
    finite(acceptedBreakoutMarginUsdt) ?? baseMargin,
  );
  const unconfirmedBounceMargin = Math.max(
    baseMargin,
    finite(unconfirmedBounceLongMarginUsdt) ?? COINGLASS_ZONE_LIFECYCLE_UNCONFIRMED_BOUNCE_LONG_MARGIN_USDT,
  );
  const largeThreshold = Math.max(
    0,
    finite(largeTargetThresholdPct) ?? COINGLASS_ZONE_LIFECYCLE_LARGE_TARGET_THRESHOLD_PCT,
  );
  const targetDistancePct = finite(
    event.entryPlan?.zoneTargetDistancePct ?? event.entryPlan?.targetDistancePct,
  );
  const timeframeAgreement = Array.isArray(event.timeframeAgreement) ? event.timeframeAgreement : [];
  const largeTarget = side === 'LONG'
    && event.zoneSide === 'ABOVE'
    && event.state === 'ACCEPTED'
    && timeframeAgreement.some((range) => range === '12h' || range === '24h')
    && targetDistancePct > largeThreshold;
  const strongWaveShort = side === 'SHORT'
    && String(event.entryPlan?.shortWaveClass ?? '') === 'STRONG_UP_WAVE';
  const supportReclaimLong = side === 'LONG'
    && event.zoneSide === 'BELOW'
    && event.state === 'REJECTED'
    && String(event.entryPlan?.signalLabel ?? '') === 'SUPPORT_RECLAIM_LONG_READY';
  const signalLabel = String(event.entryPlan?.signalLabel ?? '');
  const normalizedStreamId = String(streamId ?? 'primary').trim().toLowerCase() === 'secondary'
    ? 'secondary'
    : 'primary';
  const acceptedBreakoutLong = event.state === 'ACCEPTED'
    && event.zoneSide === 'ABOVE'
    && side === 'LONG'
    && signalLabel === 'BREAKOUT_ACCEPTED_LONG_READY';
  const acceptedBreakoutShort = event.state === 'ACCEPTED'
    && event.zoneSide === 'BELOW'
    && side === 'SHORT'
    && signalLabel === 'BREAKDOWN_ACCEPTED_SHORT_READY';
  const acceptedBreakout = acceptedBreakoutLong || acceptedBreakoutShort;
  const secondaryShortRuleTextRequired = normalizedStreamId === 'secondary' && side === 'SHORT';
  const secondaryShortRuleTextMatched = !secondaryShortRuleTextRequired
    || signalLabel === COINGLASS_ZONE_LIFECYCLE_SECONDARY_SHORT_LABEL;
  const unconfirmedBounceLong = side === 'LONG'
    && event.zoneSide === 'BELOW'
    && event.state === 'REJECTED'
    && signalLabel === 'UNCONFIRMED_BOUNCE_LONG';
  const longRuleTextMatched = side !== 'LONG'
    || (event.state === 'ACCEPTED' && event.zoneSide === 'ABOVE'
      ? acceptedBreakoutLong
      : event.state === 'REJECTED' && event.zoneSide === 'BELOW'
        ? supportReclaimLong || unconfirmedBounceLong
        : true);
  const shortRuleTextMatched = !(side === 'SHORT'
    && event.state === 'ACCEPTED'
    && event.zoneSide === 'BELOW') || acceptedBreakoutShort;
  const timeRestrictedLongRule = side === 'LONG'
    && ['BREAKOUT_ACCEPTED_LONG_READY', 'UNCONFIRMED_BOUNCE_LONG'].includes(signalLabel);
  const entryVietnamHour = vietnamHour(now);
  const blockedByVietnamTime = timeRestrictedLongRule
    && COINGLASS_ZONE_LIFECYCLE_LONG_BLOCKED_HOURS.includes(entryVietnamHour);
  const plannedStrongShortMargin = Math.max(
    0.01,
    finite(event.entryPlan?.marginUsdt) ?? baseMargin,
  );
  const margin = acceptedBreakout
    ? acceptedBreakoutMargin
    : supportReclaimLong
    ? supportReclaimMargin
    : unconfirmedBounceLong
      ? unconfirmedBounceMargin
    : largeTarget
      ? largeMargin
      : strongWaveShort ? plannedStrongShortMargin : baseMargin;
  const base = {
    version: COINGLASS_ZONE_LIFECYCLE_BINANCE_VERSION,
    symbol,
    side,
    state: event.state ?? null,
    zoneSide: event.zoneSide ?? null,
    signalEntry,
    currentPrice: mark,
    takeProfit,
    takeProfitMode: event.entryPlan?.takeProfitMode ?? 'SINGLE_FULL',
    takeProfitRoePct: finite(event.entryPlan?.takeProfitRoePct),
    takeProfitLegs: Array.isArray(event.entryPlan?.takeProfitLegs)
      ? event.entryPlan.takeProfitLegs
      : [],
    change24hPct: finite(event.entryPlan?.change24hPct),
    shortWaveClass: event.entryPlan?.shortWaveClass ?? null,
    signalLabel: event.entryPlan?.signalLabel ?? null,
    streamId: normalizedStreamId,
    secondaryShortRuleTextRequired,
    secondaryShortRuleTextMatched,
    supportReclaim: event.entryPlan?.supportReclaim ?? null,
    longRuleTextMatched,
    shortRuleTextMatched,
    timeRestrictedLongRule,
    entryVietnamHour,
    entryTimeZone: COINGLASS_ZONE_LIFECYCLE_VIETNAM_TIME_ZONE,
    leverage: lev,
    marginUsdt: margin,
    targetDistancePct,
    marginRule: acceptedBreakout
      ? 'ACCEPTED_BREAKOUT_MARGIN'
      : supportReclaimLong
      ? 'SUPPORT_RECLAIM_LONG_READY_MARGIN'
      : unconfirmedBounceLong
        ? 'UNCONFIRMED_BOUNCE_LONG_MARGIN'
      : largeTarget
        ? 'LONG_ABOVE_ACCEPTED_HTF_TARGET_GT_THRESHOLD'
      : strongWaveShort
        ? 'STRONG_UP_WAVE_SHORT_MARGIN'
        : 'BASE_MARGIN',
    largeTargetThresholdPct: largeThreshold,
    stopLoss: null,
    stopLossRoePct: null,
  };

  if (event.shouldEnter !== true || event.entryPlan?.complete !== true
    || !['REJECTED', 'ACCEPTED'].includes(String(event.state))) {
    return { ...base, allowed: false, decision: 'BLOCKED_NOT_CONFIRMED_TERMINAL' };
  }
  if (!secondaryShortRuleTextMatched) {
    return {
      ...base,
      allowed: false,
      decision: 'BLOCKED_SECONDARY_SHORT_REQUIRES_BREAKDOWN_ACCEPTED_SHORT_READY',
    };
  }
  if (!longRuleTextMatched || !shortRuleTextMatched) {
    return { ...base, allowed: false, decision: 'BLOCKED_SIGNAL_RULE_TEXT_MISMATCH' };
  }
  if (blockedByVietnamTime) {
    return { ...base, allowed: false, decision: 'BLOCKED_LONG_RULE_TIME_WINDOW_00_06_VN' };
  }
  if (!symbol || !['LONG', 'SHORT'].includes(side) || !(signalEntry > 0)
    || !(mark > 0) || !(takeProfit > 0) || !(bandLow > 0) || !(bandHigh > 0)) {
    return { ...base, allowed: false, decision: 'BLOCKED_INVALID_ZONE_PLAN' };
  }
  const slippagePct = Math.abs(mark / signalEntry - 1) * 100;
  if (slippagePct > Math.max(0.1, finite(maxSlippagePct) ?? 1.5)) {
    return { ...base, allowed: false, decision: 'BLOCKED_SIGNAL_PRICE_STALE', slippagePct };
  }
  const stateStillValid = event.state === 'REJECTED'
    ? event.zoneSide === 'ABOVE' ? side === 'SHORT' && mark < bandLow : side === 'LONG' && mark > bandHigh
    : event.zoneSide === 'ABOVE' ? side === 'LONG' && mark > bandHigh : side === 'SHORT' && mark < bandLow;
  if (!stateStillValid) return { ...base, allowed: false, decision: 'BLOCKED_STATE_NO_LONGER_VALID' };
  const targetStillValid = side === 'LONG' ? takeProfit > mark : takeProfit < mark;
  if (!targetStillValid) return { ...base, allowed: false, decision: 'BLOCKED_TARGET_ALREADY_PASSED' };

  const symbolPositions = (Array.isArray(positions) ? positions : []).filter((position) => (
    String(position?.symbol ?? '').toUpperCase() === symbol
    && finite(position?.positionAmt ?? position?.amt) !== 0
  ));
  if (symbolPositions.length) {
    return {
      ...base,
      allowed: false,
      decision: 'BLOCKED_EXISTING_POSITION',
      existingSides: symbolPositions.map(positionDirection).filter(Boolean),
    };
  }
  if ((Array.isArray(openOrders) ? openOrders : []).some(entryOrder)) {
    return { ...base, allowed: false, decision: 'BLOCKED_EXISTING_ENTRY_ORDER' };
  }
  return { ...base, allowed: true, decision: 'ENTER_MARKET' };
}

export function splitCoinglassZoneLifecyclePartialTpQuantity({
  totalQuantity,
  stepSize,
  legs = [],
} = {}) {
  const total = finite(totalQuantity);
  const step = finite(stepSize);
  const normalizedLegs = (Array.isArray(legs) ? legs : [])
    .map((leg) => ({ ...leg, closeRatio: finite(leg?.closeRatio) }))
    .filter((leg) => leg.closeRatio > 0);
  if (!(total > 0) || !(step > 0) || normalizedLegs.length < 2) return [];
  const totalUnits = Math.floor((total + step * 1e-6) / step);
  if (totalUnits < normalizedLegs.length) return [];
  let usedUnits = 0;
  return normalizedLegs.map((leg, index) => {
    const units = index === normalizedLegs.length - 1
      ? totalUnits - usedUnits
      : Math.max(1, Math.floor(totalUnits * leg.closeRatio));
    usedUnits += units;
    return { ...leg, quantity: units * step };
  }).filter((leg) => leg.quantity > 0);
}

export function buildCoinglassZoneLifecyclePartialTpParams({
  symbol,
  closeSide,
  positionSide = 'BOTH',
  triggerPrice,
  quantity,
  workingType = 'MARK_PRICE',
  recvWindow = 5000,
  clientAlgoId,
} = {}) {
  const normalizedPositionSide = String(positionSide ?? 'BOTH').toUpperCase();
  const params = {
    algoType: 'CONDITIONAL',
    symbol: String(symbol ?? '').toUpperCase(),
    side: String(closeSide ?? '').toUpperCase(),
    type: 'TAKE_PROFIT_MARKET',
    triggerPrice: String(triggerPrice),
    quantity: String(quantity),
    workingType: String(workingType ?? 'MARK_PRICE').toUpperCase(),
    recvWindow,
    clientAlgoId: String(clientAlgoId ?? '').slice(0, 36),
  };
  if (normalizedPositionSide === 'BOTH') params.reduceOnly = 'true';
  else params.positionSide = normalizedPositionSide;
  return params;
}

export function parseCoinglassZoneLifecycleBreakEvenExcludedSymbols(value = 'ZKPUSDT,4USDT') {
  const rows = value instanceof Set ? [...value] : Array.isArray(value) ? value : String(value ?? '').split(',');
  return new Set(rows.map((symbol) => String(symbol ?? '').trim().toUpperCase()).filter(Boolean));
}

export function evaluateCoinglassZoneLifecycleStrongShortBreakEven({
  symbol,
  source,
  side,
  lifecycleVersion,
  takeProfitMode,
  shortWaveClass,
  change24hPct,
  currentRoe,
  entryPrice,
  markPrice,
  tp1Filled = false,
  excludedSymbols = new Set(),
  triggerRoe = COINGLASS_ZONE_LIFECYCLE_STRONG_SHORT_BREAK_EVEN_TRIGGER_ROE,
  hyperVolatileChange24hPct = COINGLASS_ZONE_LIFECYCLE_HYPER_VOLATILE_CHANGE_24H_PCT,
} = {}) {
  const normalizedSymbol = String(symbol ?? '').trim().toUpperCase();
  const normalizedSource = String(source ?? '').trim().toLowerCase();
  const normalizedSide = String(side ?? '').trim().toUpperCase();
  const entry = finite(entryPrice);
  const mark = finite(markPrice);
  const roe = finite(currentRoe);
  const change = finite(change24hPct);
  const threshold = Math.max(0, finite(triggerRoe) ?? COINGLASS_ZONE_LIFECYCLE_STRONG_SHORT_BREAK_EVEN_TRIGGER_ROE);
  const hyperThreshold = Math.max(
    0,
    finite(hyperVolatileChange24hPct) ?? COINGLASS_ZONE_LIFECYCLE_HYPER_VOLATILE_CHANGE_24H_PCT,
  );
  const exclusions = parseCoinglassZoneLifecycleBreakEvenExcludedSymbols(excludedSymbols);
  const base = {
    version: COINGLASS_ZONE_LIFECYCLE_STRONG_SHORT_BREAK_EVEN_VERSION,
    symbol: normalizedSymbol,
    triggerRoe: threshold,
    change24hPct: change,
  };
  if (normalizedSource !== 'coinglass-zone-lifecycle' || normalizedSide !== 'SHORT') {
    return { ...base, eligible: false, reason: 'NOT_ZONE_LIFECYCLE_SHORT' };
  }
  if (String(lifecycleVersion ?? '') !== 'COINGLASS_ZONE_LIFECYCLE_V7_SHORT_ADAPTIVE_PARTIAL_TP_20260830') {
    return { ...base, eligible: false, reason: 'NOT_FUTURE_V7_ENTRY' };
  }
  if (String(takeProfitMode ?? '') !== 'SHORT_PARTIAL_80_20_STRONG_WAVE'
    || String(shortWaveClass ?? '') !== 'STRONG_UP_WAVE') {
    return { ...base, eligible: false, reason: 'NOT_STRONG_UP_WAVE_PROFILE' };
  }
  if (exclusions.has(normalizedSymbol)) return { ...base, eligible: false, reason: 'EXPLICIT_HYPER_VOLATILE_EXCLUSION' };
  if (change != null && Math.abs(change) >= hyperThreshold) {
    return { ...base, eligible: false, reason: 'HYPER_VOLATILE_CHANGE_24H' };
  }
  if (tp1Filled !== true) return { ...base, eligible: false, reason: 'TP1_NOT_FILLED' };
  if (!(entry > 0) || !(mark > 0) || !(mark < entry)) {
    return { ...base, eligible: false, reason: 'INVALID_OR_REVERSED_PRICE' };
  }
  if (!(roe >= threshold)) return { ...base, eligible: false, reason: 'ROE_BELOW_TRIGGER' };
  return { ...base, eligible: true, reason: 'MOVE_RUNNER_SL_TO_ENTRY', stopPrice: entry };
}

export function buildCoinglassZoneLifecycleBreakEvenStopParams({
  symbol,
  positionSide = 'BOTH',
  triggerPrice,
  quantity,
  workingType = 'MARK_PRICE',
  recvWindow = 5000,
  clientAlgoId,
} = {}) {
  const normalizedPositionSide = String(positionSide ?? 'BOTH').toUpperCase();
  const params = {
    algoType: 'CONDITIONAL',
    symbol: String(symbol ?? '').toUpperCase(),
    side: 'BUY',
    type: 'STOP_MARKET',
    triggerPrice: String(triggerPrice),
    quantity: String(quantity),
    workingType: String(workingType ?? 'MARK_PRICE').toUpperCase(),
    recvWindow,
    clientAlgoId: String(clientAlgoId ?? '').slice(0, 36),
  };
  if (normalizedPositionSide === 'BOTH') params.reduceOnly = 'true';
  else params.positionSide = normalizedPositionSide;
  return params;
}
