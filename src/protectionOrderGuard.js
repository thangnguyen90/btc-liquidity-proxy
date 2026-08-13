function normalizedType(order) {
  return String(order?.orderType ?? order?.origType ?? order?.type ?? '').toUpperCase();
}

function normalizedSide(order) {
  return String(order?.side ?? '').toUpperCase();
}

function normalizedPositionSide(order) {
  return String(order?.positionSide ?? 'BOTH').toUpperCase();
}

export function isOpenProtectionOrder(order, {
  symbol,
  closeSide,
  positionSide = 'BOTH',
  kind,
} = {}) {
  if (!order || String(order.symbol ?? '').toUpperCase() !== String(symbol ?? '').toUpperCase()) return false;
  if (normalizedSide(order) !== String(closeSide ?? '').toUpperCase()) return false;

  const expectedPositionSide = String(positionSide ?? 'BOTH').toUpperCase();
  const actualPositionSide = normalizedPositionSide(order);
  if (actualPositionSide !== expectedPositionSide) return false;

  const type = normalizedType(order);
  if (kind === 'SL') return type === 'STOP_MARKET' || type === 'STOP';
  if (kind === 'TP') return type === 'TAKE_PROFIT_MARKET' || type === 'TAKE_PROFIT';
  return false;
}

export function hasOpenProtectionOrder(regularOrders, algoOrders, options) {
  return [...(regularOrders ?? []), ...(algoOrders ?? [])]
    .some((order) => isOpenProtectionOrder(order, options));
}
