export const BINANCE_POSITION_CLOSE_CONFIRM_VERSION = 'BINANCE_POSITION_CLOSE_CONFIRM_V1_20260812';

export function activeBinancePositionForSymbol(positions = [], symbol = '') {
  const normalizedSymbol = String(symbol ?? '').trim().toUpperCase();
  if (!normalizedSymbol) return null;
  return (Array.isArray(positions) ? positions : []).find((position) => (
    String(position?.symbol ?? '').trim().toUpperCase() === normalizedSymbol
    && Number(position?.positionAmt ?? position?.amt) !== 0
  )) ?? null;
}

export function binancePositionCloseIsConfirmed(positions = [], symbol = '') {
  return activeBinancePositionForSymbol(positions, symbol) == null;
}
