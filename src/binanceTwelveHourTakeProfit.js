export const BINANCE_TWELVE_HOUR_TAKE_PROFIT_VERSION = 'BINANCE_TP_TO_ROE1_AFTER_12H_V1_20260812';
export const DEFAULT_BINANCE_TP_MAX_AGE_MS = 12 * 60 * 60 * 1000;
export const DEFAULT_BINANCE_TP_TARGET_ROE_PCT = 1;
export const BINANCE_EIGHT_HOUR_NEGATIVE_TP_VERSION = 'BINANCE_NEGATIVE_TP_TO_ENTRY_AFTER_8H_V1_20260816';
export const DEFAULT_BINANCE_NEGATIVE_TP_MAX_AGE_MS = 8 * 60 * 60 * 1000;

function finitePositive(value) {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
}

export function parseBinancePositionOpenedAt(value) {
  if (value == null || value === '') return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const parsed = Date.parse(String(value));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function binanceTakeProfitPriceForRoe({ entryPrice, leverage, side, targetRoePct = 1 }) {
  const entry = finitePositive(entryPrice);
  const lev = finitePositive(leverage);
  const roePct = finitePositive(targetRoePct);
  const normalizedSide = String(side ?? '').toUpperCase();
  if (!entry || !lev || !roePct || !['LONG', 'SHORT'].includes(normalizedSide)) return null;

  const priceMove = roePct / 100 / lev;
  return normalizedSide === 'LONG'
    ? entry * (1 + priceMove)
    : entry * (1 - priceMove);
}

export function roundBinanceTakeProfitTowardProfit({ price, tickSize, side }) {
  const rawPrice = finitePositive(price);
  const tick = finitePositive(tickSize);
  const normalizedSide = String(side ?? '').toUpperCase();
  if (!rawPrice || !tick || !['LONG', 'SHORT'].includes(normalizedSide)) return null;

  const ratio = rawPrice / tick;
  const epsilon = 1e-10;
  const ticks = normalizedSide === 'LONG'
    ? Math.ceil(ratio - epsilon)
    : Math.floor(ratio + epsilon);
  const rounded = ticks * tick;
  return Number.isFinite(rounded) && rounded > 0 ? rounded : null;
}

export function evaluateBinanceTwelveHourTakeProfit({
  enabled = true,
  now = Date.now(),
  openedAt,
  entryPrice,
  leverage,
  positionAmount,
  maxAgeMs = DEFAULT_BINANCE_TP_MAX_AGE_MS,
  targetRoePct = DEFAULT_BINANCE_TP_TARGET_ROE_PCT,
} = {}) {
  if (!enabled) return { eligible: false, reason: 'disabled' };
  const openedAtMs = parseBinancePositionOpenedAt(openedAt);
  if (!openedAtMs) return { eligible: false, reason: 'missing_opened_at' };

  const timestamp = Number(now);
  const ageLimit = finitePositive(maxAgeMs);
  if (!Number.isFinite(timestamp) || !ageLimit) return { eligible: false, reason: 'invalid_time_config' };
  const ageMs = Math.max(0, timestamp - openedAtMs);
  if (ageMs < ageLimit) return { eligible: false, reason: 'not_expired', ageMs };

  const amount = Number(positionAmount);
  if (!Number.isFinite(amount) || amount === 0) return { eligible: false, reason: 'position_closed', ageMs };
  const side = amount > 0 ? 'LONG' : 'SHORT';
  const targetPrice = binanceTakeProfitPriceForRoe({ entryPrice, leverage, side, targetRoePct });
  if (!targetPrice) return { eligible: false, reason: 'invalid_position', ageMs };

  return {
    eligible: true,
    reason: 'expired',
    ageMs,
    side,
    closeSide: side === 'LONG' ? 'SELL' : 'BUY',
    targetPrice,
    targetRoePct: Number(targetRoePct),
  };
}

export function evaluateBinanceEightHourNegativeTakeProfit({
  enabled = true,
  now = Date.now(),
  openedAt,
  entryPrice,
  positionAmount,
  currentRoe,
  capTsl = false,
  maxAgeMs = DEFAULT_BINANCE_NEGATIVE_TP_MAX_AGE_MS,
} = {}) {
  if (!enabled) return { eligible: false, reason: 'disabled' };
  if (capTsl === true) return { eligible: false, reason: 'cap_tsl_excluded' };
  const openedAtMs = parseBinancePositionOpenedAt(openedAt);
  if (!openedAtMs) return { eligible: false, reason: 'missing_opened_at' };

  const timestamp = Number(now);
  const ageLimit = finitePositive(maxAgeMs);
  if (!Number.isFinite(timestamp) || !ageLimit) return { eligible: false, reason: 'invalid_time_config' };
  const ageMs = Math.max(0, timestamp - openedAtMs);
  if (ageMs < ageLimit) return { eligible: false, reason: 'not_expired', ageMs };

  const amount = Number(positionAmount);
  if (!Number.isFinite(amount) || amount === 0) return { eligible: false, reason: 'position_closed', ageMs };
  const entry = finitePositive(entryPrice);
  if (!entry) return { eligible: false, reason: 'invalid_position', ageMs };
  if (currentRoe == null || currentRoe === '') return { eligible: false, reason: 'missing_roe', ageMs };
  const roe = Number(currentRoe);
  if (!Number.isFinite(roe)) return { eligible: false, reason: 'missing_roe', ageMs };
  if (roe >= 0) return { eligible: false, reason: 'not_negative', ageMs, currentRoe: roe };

  const side = amount > 0 ? 'LONG' : 'SHORT';
  return {
    eligible: true,
    reason: 'negative_after_8h',
    ageMs,
    currentRoe: roe,
    side,
    closeSide: side === 'LONG' ? 'SELL' : 'BUY',
    targetPrice: entry,
    targetRoePct: 0,
  };
}

export function isBinanceTwelveHourTpPriceMatch(actualPrice, expectedPrice, tickSize) {
  const actual = finitePositive(actualPrice);
  const expected = finitePositive(expectedPrice);
  const tick = finitePositive(tickSize) ?? 0;
  if (!actual || !expected) return false;
  return Math.abs(actual - expected) <= Math.max(tick * 1.1, expected * 1e-8);
}
