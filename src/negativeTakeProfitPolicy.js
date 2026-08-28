export const BINANCE_NEGATIVE_TP_TO_ENTRY_VERSION = 'BINANCE_NEGATIVE_TP_TO_ENTRY_V4_CAP_TSL_INDEPENDENT_ROE20_20260824';
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
  // Kept in the signature for old callers/JSON compatibility. Cap TSL only
  // caps profit-lock SL progression; it must not disable loss recovery TP.
  void capTsl;
  const normalizedRoe = Number(roe);
  const normalizedThreshold = normalizeNegativeTpRoe(thresholdRoe);
  return Number.isFinite(normalizedRoe) && normalizedRoe <= normalizedThreshold;
}
