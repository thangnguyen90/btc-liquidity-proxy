export const BINANCE_CLOSE_POSITION_PROTECTION_VERSION = 'BINANCE_CLOSE_POSITION_PROTECTION_V1_20260812';

const SUPPORTED_TYPES = new Set(['TAKE_PROFIT_MARKET', 'STOP_MARKET']);

export function buildClosePositionProtectionParams({
  symbol,
  closeSide,
  type,
  triggerPrice,
  positionSide = 'BOTH',
  workingType = 'MARK_PRICE',
  recvWindow = 5000,
  clientAlgoId = null,
  priceProtect = false,
} = {}) {
  const normalizedType = String(type ?? '').trim().toUpperCase();
  if (!SUPPORTED_TYPES.has(normalizedType)) {
    throw new Error(`Unsupported close-position protection type: ${normalizedType || '-'}`);
  }

  const normalizedSymbol = String(symbol ?? '').trim().toUpperCase();
  const normalizedCloseSide = String(closeSide ?? '').trim().toUpperCase();
  const normalizedPositionSide = String(positionSide ?? 'BOTH').trim().toUpperCase();
  const price = Number(triggerPrice);
  if (!normalizedSymbol) throw new Error('Protection symbol is required.');
  if (!['BUY', 'SELL'].includes(normalizedCloseSide)) throw new Error('Protection close side must be BUY or SELL.');
  if (!Number.isFinite(price) || price <= 0) throw new Error('Protection trigger price must be positive.');

  const params = {
    algoType: 'CONDITIONAL',
    symbol: normalizedSymbol,
    side: normalizedCloseSide,
    type: normalizedType,
    triggerPrice: String(triggerPrice),
    closePosition: 'true',
    workingType: String(workingType ?? 'MARK_PRICE').trim().toUpperCase(),
    recvWindow,
  };
  if (priceProtect) params.priceProtect = 'true';
  if (normalizedPositionSide !== 'BOTH') params.positionSide = normalizedPositionSide;
  if (clientAlgoId) params.clientAlgoId = String(clientAlgoId).slice(0, 36);
  return params;
}
