export const LIMIT_ORDER_RETENTION_VERSION = 'LIMIT_ORDER_RETENTION_V1_20260809';
export const ENTRY_LIMIT_TWELVE_HOUR_EXPIRY_VERSION = 'ENTRY_LIMIT_TWELVE_HOUR_EXPIRY_V1_20260824';
export const DEFAULT_ENTRY_LIMIT_MAX_AGE_MS = 12 * 60 * 60 * 1000;

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
  return isRegularLimitOrder(order) && !reduceOnly && !closePosition;
}

export function selectExpiredEntryLimitOrders(orders = [], {
  now = Date.now(),
  maxAgeMs = DEFAULT_ENTRY_LIMIT_MAX_AGE_MS,
} = {}) {
  const ageLimit = Number(maxAgeMs);
  if (!(ageLimit > 0)) return [];
  return (Array.isArray(orders) ? orders : []).filter((order) => {
    const openedAt = Number(order?.time ?? order?.createTime);
    return isEntryLimitOrder(order)
      && Number.isFinite(openedAt)
      && openedAt > 0
      && now - openedAt >= ageLimit;
  });
}

export function selectAutomaticProtectionCleanupOrders(orders = []) {
  return (Array.isArray(orders) ? orders : []).filter((order) => !isRegularLimitOrder(order));
}
