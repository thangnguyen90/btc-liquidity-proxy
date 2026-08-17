export const BINANCE_NEGATIVE_TP_TO_ENTRY_VERSION = 'BINANCE_NEGATIVE_TP_TO_ENTRY_V3_CAP_TSL_EXCLUDED_ROE20_20260815';
export const BINANCE_NEGATIVE_TP_TO_ENTRY_DEFAULT_ROE = -20;

export function normalizeNegativeTpRoe(value = BINANCE_NEGATIVE_TP_TO_ENTRY_DEFAULT_ROE) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed < 0
    ? parsed
    : BINANCE_NEGATIVE_TP_TO_ENTRY_DEFAULT_ROE;
}

export function shouldMoveNegativeTpToEntry({
  roe,
  thresholdRoe = BINANCE_NEGATIVE_TP_TO_ENTRY_DEFAULT_ROE,
  capTsl = false,
} = {}) {
  if (capTsl === true) return false;
  const normalizedRoe = Number(roe);
  const normalizedThreshold = normalizeNegativeTpRoe(thresholdRoe);
  return Number.isFinite(normalizedRoe) && normalizedRoe <= normalizedThreshold;
}
