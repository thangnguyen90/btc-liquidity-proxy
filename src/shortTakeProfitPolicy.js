export const NON_LIQUID_FLOW_V2_SHORT_TP_VERSION = 'NON_LIQUID_FLOW_V2_SHORT_TP_ROE6_BOT_ONLY_V2_20260809';
export const NON_LIQUID_FLOW_V2_SHORT_TP_ROE = 6;
export const NON_LIQUID_FLOW_V2_LONG_TP_VERSION = 'NON_LIQUID_FLOW_V2_LONG_TP_ROE10_BOT_ONLY_V1_20260810';
export const NON_LIQUID_FLOW_V2_LONG_TP_ROE = 10;
export const ORDERS_MANUAL_TP_VERSION = 'MANUAL_SOCKET_TP_ROE30_V2_20260812';
export const ORDERS_MANUAL_TP_ROE = 30;
export const BINANCE_MANUAL_SOCKET_SOURCE = 'binance-manual-socket';

const MANUAL_TP_SOURCES = new Set([
  'orders-manual',
  BINANCE_MANUAL_SOCKET_SOURCE,
]);

export function isLiquidFlowV2Source(source) {
  return String(source ?? '').trim().toLowerCase().includes('liquid-flow-v2');
}

export function isKnownBotSource(source) {
  const normalized = String(source ?? '').trim().toLowerCase();
  if (!normalized) return false;
  if ([
    'signal',
    'manual',
    'orders-manual',
    BINANCE_MANUAL_SOCKET_SOURCE,
    'set-tp-sl',
    'binance-position-fallback',
    'binance/manual',
    'rest_sync',
    'rest-fill-recovery',
    'rest_fill_recovery',
  ].includes(normalized)) return false;
  return true;
}

export function resolveOrdersManualTakeProfit({
  side,
  source,
  entryPrice,
  leverage,
  requestedTakeProfitPrice = null,
  roePct = ORDERS_MANUAL_TP_ROE,
} = {}) {
  if (!MANUAL_TP_SOURCES.has(String(source ?? '').trim().toLowerCase())) return null;

  const normalizedSide = String(side ?? '').trim().toUpperCase();
  const direction = normalizedSide === 'BUY' || normalizedSide === 'LONG'
    ? 'LONG'
    : normalizedSide === 'SELL' || normalizedSide === 'SHORT'
      ? 'SHORT'
      : null;
  const requested = Number(requestedTakeProfitPrice);
  if (Number.isFinite(requested) && requested > 0) {
    return {
      applied: false,
      direction,
      takeProfitPrice: requested,
      roePct: null,
      version: null,
    };
  }

  const entry = Number(entryPrice);
  const lev = Number(leverage);
  const roe = Number(roePct);
  if (!direction || !(entry > 0) || !(lev > 0) || !(roe > 0)) {
    return {
      applied: false,
      direction,
      takeProfitPrice: null,
      roePct: roe,
      version: null,
    };
  }

  return {
    applied: true,
    direction,
    takeProfitPrice: entry * (direction === 'LONG' ? 1 + (roe / 100) / lev : 1 - (roe / 100) / lev),
    roePct: roe,
    version: ORDERS_MANUAL_TP_VERSION,
  };
}

export function resolveManualSocketProtection({
  side,
  entryPrice,
  leverage,
  stopLossRoePct = 25,
  stopLossEnabled = true,
} = {}) {
  const takeProfit = resolveOrdersManualTakeProfit({
    side,
    source: BINANCE_MANUAL_SOCKET_SOURCE,
    entryPrice,
    leverage,
  });
  if (!takeProfit?.applied) return null;

  const entry = Number(entryPrice);
  const lev = Number(leverage);
  const slRoe = Number(stopLossRoePct);
  const stopLossPrice = stopLossEnabled && Number.isFinite(slRoe) && slRoe > 0
    ? entry * (
        takeProfit.direction === 'LONG'
          ? 1 - (slRoe / 100) / lev
          : 1 + (slRoe / 100) / lev
      )
    : null;

  return {
    ...takeProfit,
    source: BINANCE_MANUAL_SOCKET_SOURCE,
    entryPrice: entry,
    leverage: lev,
    stopLossPrice,
    stopLossRoePct: stopLossPrice == null ? null : slRoe,
  };
}

export function isUserOrLiquidFlowV2ManagedSource(...sources) {
  const normalizedSources = sources
    .map((source) => String(source ?? '').trim())
    .filter(Boolean);
  if (normalizedSources.some((source) => isLiquidFlowV2Source(source))) return true;
  return !normalizedSources.some((source) => isKnownBotSource(source));
}

export function resolveNonLiquidFlowV2TakeProfit({
  side,
  source,
  entryPrice,
  leverage,
  requestedTakeProfitPrice = null,
  shortRoePct = NON_LIQUID_FLOW_V2_SHORT_TP_ROE,
  longRoePct = NON_LIQUID_FLOW_V2_LONG_TP_ROE,
} = {}) {
  const normalizedSide = String(side ?? '').trim().toUpperCase();
  const direction = normalizedSide === 'BUY' || normalizedSide === 'LONG'
    ? 'LONG'
    : normalizedSide === 'SELL' || normalizedSide === 'SHORT'
      ? 'SHORT'
      : null;
  const entry = Number(entryPrice);
  const lev = Number(leverage);
  const roe = Number(direction === 'LONG' ? longRoePct : shortRoePct);
  const version = direction === 'LONG'
    ? NON_LIQUID_FLOW_V2_LONG_TP_VERSION
    : direction === 'SHORT'
      ? NON_LIQUID_FLOW_V2_SHORT_TP_VERSION
      : null;
  if (!direction || !isKnownBotSource(source) || isLiquidFlowV2Source(source) || !(entry > 0) || !(lev > 0) || !(roe > 0)) {
    return {
      applied: false,
      direction,
      takeProfitPrice: Number(requestedTakeProfitPrice) || null,
      roePct: roe,
      version: null,
    };
  }
  return {
    applied: true,
    direction,
    takeProfitPrice: entry * (direction === 'LONG' ? 1 + (roe / 100) / lev : 1 - (roe / 100) / lev),
    roePct: roe,
    version,
  };
}

export function resolveNonLiquidFlowV2ShortTakeProfit({
  side,
  source,
  entryPrice,
  leverage,
  requestedTakeProfitPrice = null,
  roePct = NON_LIQUID_FLOW_V2_SHORT_TP_ROE,
} = {}) {
  const normalizedSide = String(side ?? '').trim().toUpperCase();
  if (normalizedSide !== 'SELL' && normalizedSide !== 'SHORT') {
    return {
      applied: false,
      direction: normalizedSide === 'BUY' || normalizedSide === 'LONG' ? 'LONG' : null,
      takeProfitPrice: Number(requestedTakeProfitPrice) || null,
      roePct: Number(roePct),
      version: null,
    };
  }
  return resolveNonLiquidFlowV2TakeProfit({
    side,
    source,
    entryPrice,
    leverage,
    requestedTakeProfitPrice,
    shortRoePct: roePct,
  });
}
