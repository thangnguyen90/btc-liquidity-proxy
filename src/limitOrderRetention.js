export const LIMIT_ORDER_RETENTION_VERSION = 'LIMIT_ORDER_RETENTION_V1_20260809';
export const ENTRY_LIMIT_TWELVE_HOUR_EXPIRY_VERSION = 'ENTRY_LIMIT_TWELVE_HOUR_EXPIRY_V2_DCA_ATTACHED_EXEMPT_20260828';
export const DCA_ATTACHED_LIMIT_RETENTION_VERSION = 'BINANCE_DCA_ATTACHED_LIMIT_RETENTION_V1_20260828';
export const DEFAULT_ENTRY_LIMIT_MAX_AGE_MS = 12 * 60 * 60 * 1000;
export const COIN_LEVEL_ENTRY_LIMIT_MAX_AGE_MS = 45 * 60 * 1000;

const upper = (value) => String(value ?? '').trim().toUpperCase();

function positionDirection(position = {}) {
  const positionSide = upper(position?.positionSide ?? 'BOTH');
  if (positionSide === 'LONG' || positionSide === 'SHORT') return positionSide;
  const amount = Number(position?.positionAmt ?? position?.amt);
  if (amount > 0) return 'LONG';
  if (amount < 0) return 'SHORT';
  return null;
}

export function isRegularLimitOrder(order = {}) {
  const type = String(order?.type ?? order?.origType ?? '').trim().toUpperCase();
  return type === 'LIMIT' || type === 'LIMIT_MAKER';
}

export function isAutoCancelEntryLimitEnabled(value = null) {
  return value === true || String(value ?? '').trim().toLowerCase() === 'true';
}

export function isEntryLimitExpiryEnabled(value = null) {
  return value == null || String(value).trim() === ''
    ? true
    : value === true || String(value).trim().toLowerCase() === 'true';
}

export function isEntryLimitOrder(order = {}) {
  const reduceOnly = order?.reduceOnly === true || String(order?.reduceOnly ?? '').toLowerCase() === 'true';
  const closePosition = order?.closePosition === true || String(order?.closePosition ?? '').toLowerCase() === 'true';
  const positionSide = upper(order?.positionSide ?? 'BOTH');
  const side = upper(order?.side);
  const closesHedgePosition = (positionSide === 'LONG' && side === 'SELL')
    || (positionSide === 'SHORT' && side === 'BUY');
  return isRegularLimitOrder(order) && !reduceOnly && !closePosition && !closesHedgePosition;
}

export function isDcaAttachedLimitOrder(order = {}, position = {}) {
  if (!isEntryLimitOrder(order)) return false;
  const orderSymbol = upper(order?.symbol);
  const positionSymbol = upper(position?.symbol);
  if (!orderSymbol || !positionSymbol || orderSymbol !== positionSymbol) return false;
  const direction = positionDirection(position);
  if (!direction) return false;
  const orderPositionSide = upper(order?.positionSide ?? 'BOTH');
  if (orderPositionSide !== 'BOTH' && orderPositionSide !== direction) return false;
  return direction === 'LONG' ? upper(order?.side) === 'BUY' : upper(order?.side) === 'SELL';
}

export function selectDcaAttachedLimitOrders(orders = [], positions = []) {
  const activePositions = (Array.isArray(positions) ? positions : [])
    .filter((position) => positionDirection(position));
  return (Array.isArray(orders) ? orders : []).filter((order) => (
    activePositions.some((position) => isDcaAttachedLimitOrder(order, position))
  ));
}

export function shouldRetainDcaAttachedLimitOrder({
  order = {},
  position = {},
  taggedAtSubmission = false,
} = {}) {
  if (!isDcaAttachedLimitOrder(order, position)) return false;
  if (taggedAtSubmission === true) return true;
  const executedQuantity = Math.abs(Number(order?.executedQty ?? order?.cumQty ?? 0));
  if (!(executedQuantity > 0)) return true;
  const positionQuantity = Math.abs(Number(position?.positionAmt ?? position?.amt));
  const tolerance = Math.max(executedQuantity * 1e-8, 1e-12);
  return positionQuantity > executedQuantity + tolerance;
}

export function selectExpiredEntryLimitOrders(orders = [], {
  now = Date.now(),
  maxAgeMs = DEFAULT_ENTRY_LIMIT_MAX_AGE_MS,
  positions = [],
  coinLevelStartedAt = null,
} = {}) {
  const ageLimit = Number(maxAgeMs);
  if (!(ageLimit > 0)) return [];
  return (Array.isArray(orders) ? orders : []).filter((order) => {
    const openedAt = Number(order?.time ?? order?.createTime);
    const coinLevelLimit = String(order?.clientOrderId ?? '').startsWith('clel_');
    const orderAgeLimit = coinLevelLimit
      ? Math.min(ageLimit, COIN_LEVEL_ENTRY_LIMIT_MAX_AGE_MS)
      : ageLimit;
    return isEntryLimitOrder(order)
      && (coinLevelLimit || !(Array.isArray(positions) && positions.some((position) => (
        shouldRetainDcaAttachedLimitOrder({ order, position })
      ))))
      && Number.isFinite(openedAt)
      && openedAt > 0
      && (coinLevelLimit && (Number(order?.executedQty ?? 0) > 0
        || Number.isFinite(Number(coinLevelStartedAt)) && Number(coinLevelStartedAt) > 0
          && openedAt < Number(coinLevelStartedAt))
        || now - openedAt >= orderAgeLimit);
  });
}

export function selectAutomaticProtectionCleanupOrders(orders = []) {
  return (Array.isArray(orders) ? orders : []).filter((order) => !isRegularLimitOrder(order));
}
