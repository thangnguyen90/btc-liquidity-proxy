export const NON_LIQUID_FLOW_V2_SHORT_TP_VERSION = 'NON_LIQUID_FLOW_V2_SHORT_TP_ROE6_BOT_ONLY_V2_20260809';
export const NON_LIQUID_FLOW_V2_SHORT_TP_ROE = 6;
export const NON_LIQUID_FLOW_V2_LONG_TP_VERSION = 'NON_LIQUID_FLOW_V2_LONG_TP_ROE10_BOT_ONLY_V1_20260810';
export const NON_LIQUID_FLOW_V2_LONG_TP_ROE = 10;
export const ORDERS_MANUAL_TP_VERSION = 'MANUAL_SOCKET_TP_ROE30_V2_20260812';
export const ORDERS_MANUAL_TP_ROE = 30;
export const BINANCE_MANUAL_SOCKET_SOURCE = 'binance-manual-socket';
export const BINANCE_BOT_SHORT_TP_ONLY_VERSION = 'BINANCE_BOT_SHORT_TP_ONLY_V1_20260824';
export const BINANCE_MANUAL_SHORT_EMA99_TP_ONLY_VERSION = 'BINANCE_MANUAL_SHORT_EMA99_TP_ONLY_V1_20260824';
export const COINGLASS_ZONE_LIFECYCLE_TP_ONLY_VERSION =
  'COINGLASS_ZONE_LIFECYCLE_TP_ONLY_NO_SL_V1_20260828';
export const BINANCE_MANUAL_SHORT_MAX_TP_ROE = 30;

const MANUAL_TP_SOURCES = new Set([
  'orders-manual',
  BINANCE_MANUAL_SOCKET_SOURCE,
]);

export function isLiquidFlowV2Source(source) {
  return String(source ?? '').trim().toLowerCase().includes('liquid-flow-v2');
}

export function isCoinglassWebQualifiedSource(source) {
  return String(source ?? '').trim().toLowerCase() === 'coinglass-web-qualified';
}

export function isCoinglassZoneLifecycleSource(source) {
  return String(source ?? '').trim().toLowerCase() === 'coinglass-zone-lifecycle';
}

export function shouldSuppressCoinglassZoneLifecycleStopLoss({ source, enabled = true } = {}) {
  return enabled === true && isCoinglassZoneLifecycleSource(source);
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

export function shouldSuppressBotShortStopLoss({
  side,
  source,
  enabled = true,
} = {}) {
  if (enabled !== true) return false;
  const normalizedSide = String(side ?? '').trim().toUpperCase();
  if (normalizedSide !== 'SELL' && normalizedSide !== 'SHORT') return false;
  const normalizedSource = String(source ?? '').trim().toLowerCase();
  const isLegacyBotSignalSource = normalizedSource === 'signal';
  // Explicit manual sources must keep their requested protection. Requiring a
  // known bot source (plus the server's legacy auto source "signal") makes
  // unknown/manual fills fail safe.
  if ((!isKnownBotSource(normalizedSource) && !isLegacyBotSignalSource) || normalizedSource.includes('manual')) return false;
  return true;
}

export function isManualShortProtectionSource({ side, source } = {}) {
  const normalizedSide = String(side ?? '').trim().toUpperCase();
  if (normalizedSide !== 'SELL' && normalizedSide !== 'SHORT') return false;
  const normalizedSource = String(source ?? '').trim().toLowerCase();
  return normalizedSource === 'manual'
    || normalizedSource === 'orders-manual'
    || normalizedSource === BINANCE_MANUAL_SOCKET_SOURCE
    || normalizedSource.includes('manual');
}

export function resolveManualShortEma99TakeProfit({
  entryPrice,
  leverage,
  candidates = [],
  maxRoePct = BINANCE_MANUAL_SHORT_MAX_TP_ROE,
} = {}) {
  const entry = Number(entryPrice);
  const lev = Number(leverage);
  const maxRoe = Number(maxRoePct);
  if (!(entry > 0) || !(lev > 0) || !(maxRoe > 0)) return null;

  const validCandidates = (Array.isArray(candidates) ? candidates : [])
    .map((row) => ({ interval: String(row?.interval ?? ''), price: Number(row?.price) }))
    .filter((row) => row.price > 0 && row.price < entry)
    .sort((a, b) => Math.abs(entry - a.price) - Math.abs(entry - b.price));
  const selected = validCandidates[0] ?? null;
  const capPrice = entry * (1 - (maxRoe / 100) / lev);
  const selectedRoePct = selected ? ((entry - selected.price) / entry) * lev * 100 : null;
  const capped = !selected || selectedRoePct > maxRoe;
  const takeProfitPrice = capped ? capPrice : selected.price;
  const roePct = ((entry - takeProfitPrice) / entry) * lev * 100;
  return {
    applied: true,
    direction: 'SHORT',
    takeProfitPrice,
    roePct,
    version: BINANCE_MANUAL_SHORT_EMA99_TP_ONLY_VERSION,
    selectedInterval: selected?.interval || null,
    selectedEma99: selected?.price ?? null,
    selectedEma99RoePct: selectedRoePct,
    cappedAtMaxRoe: capped,
    maxRoePct: maxRoe,
  };
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
  ema99Candidates = [],
  stopLossRoePct = 25,
  stopLossEnabled = true,
} = {}) {
  const manualShort = isManualShortProtectionSource({ side, source: BINANCE_MANUAL_SOCKET_SOURCE });
  const takeProfit = manualShort
    ? resolveManualShortEma99TakeProfit({ entryPrice, leverage, candidates: ema99Candidates })
    : resolveOrdersManualTakeProfit({
        side,
        source: BINANCE_MANUAL_SOCKET_SOURCE,
        entryPrice,
        leverage,
      });
  if (!takeProfit?.applied) return null;

  const entry = Number(entryPrice);
  const lev = Number(leverage);
  const slRoe = Number(stopLossRoePct);
  const stopLossPrice = !manualShort && stopLossEnabled && Number.isFinite(slRoe) && slRoe > 0
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
  if (!direction || !isKnownBotSource(source) || isLiquidFlowV2Source(source)
    || isCoinglassWebQualifiedSource(source) || isCoinglassZoneLifecycleSource(source)
    || !(entry > 0) || !(lev > 0) || !(roe > 0)) {
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
