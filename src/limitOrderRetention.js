export const LIMIT_ORDER_RETENTION_VERSION = 'LIMIT_ORDER_RETENTION_V1_20260809';

export function isRegularLimitOrder(order = {}) {
  const type = String(order?.type ?? order?.origType ?? '').trim().toUpperCase();
  return type === 'LIMIT' || type === 'LIMIT_MAKER';
}

export function isAutoCancelEntryLimitEnabled(value = null) {
  return value === true || String(value ?? '').trim().toLowerCase() === 'true';
}

export function selectAutomaticProtectionCleanupOrders(orders = []) {
  return (Array.isArray(orders) ? orders : []).filter((order) => !isRegularLimitOrder(order));
}
