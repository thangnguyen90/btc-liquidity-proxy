export const COINGLASS_ZONE_LIFECYCLE_BINANCE_VERSION =
  'COINGLASS_ZONE_LIFECYCLE_BINANCE_V3_MARKET_5USDT_TP_ONLY_20260828';
export const COINGLASS_ZONE_LIFECYCLE_MARGIN_USDT = 5;
export const COINGLASS_ZONE_LIFECYCLE_LEVERAGE = 5;

function finite(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
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
  currentPrice,
  positions = [],
  openOrders = [],
  leverage = COINGLASS_ZONE_LIFECYCLE_LEVERAGE,
  marginUsdt = COINGLASS_ZONE_LIFECYCLE_MARGIN_USDT,
  maxSlippagePct = 1.5,
} = {}) {
  const symbol = String(event.symbol ?? '').trim().toUpperCase();
  const side = String(event.entryPlan?.side ?? '').toUpperCase();
  const signalEntry = finite(event.entryPlan?.entryPrice);
  const mark = finite(currentPrice);
  const takeProfit = finite(event.entryPlan?.takeProfitPrice);
  const bandLow = finite(event.zone?.bandLow);
  const bandHigh = finite(event.zone?.bandHigh);
  const lev = Math.max(1, finite(leverage) ?? COINGLASS_ZONE_LIFECYCLE_LEVERAGE);
  const margin = Math.max(0.01, finite(marginUsdt) ?? COINGLASS_ZONE_LIFECYCLE_MARGIN_USDT);
  const base = {
    version: COINGLASS_ZONE_LIFECYCLE_BINANCE_VERSION,
    symbol,
    side,
    state: event.state ?? null,
    zoneSide: event.zoneSide ?? null,
    signalEntry,
    currentPrice: mark,
    takeProfit,
    leverage: lev,
    marginUsdt: margin,
    stopLoss: null,
    stopLossRoePct: null,
  };

  if (event.shouldEnter !== true || event.entryPlan?.complete !== true
    || !['REJECTED', 'ACCEPTED'].includes(String(event.state))) {
    return { ...base, allowed: false, decision: 'BLOCKED_NOT_CONFIRMED_TERMINAL' };
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
