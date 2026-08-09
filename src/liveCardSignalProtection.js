export const LIVE_CARD_SIGNAL_PROTECTION_VERSION = 'LIVE_CARD_SIGNAL_PROTECTION_V2_20260809';
export const LIVE_CARD_FILL_ANCHORED_PROTECTION_VERSION = 'LIVE_CARD_FILL_ANCHORED_PROTECTION_V1_20260809';

const upper = (value) => String(value ?? '').trim().toUpperCase();
const positive = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

function normalizedPositionSide(value) {
  const side = upper(value);
  if (side === 'BUY' || side === 'LONG') return 'LONG';
  if (side === 'SELL' || side === 'SHORT') return 'SHORT';
  return null;
}

function directionalDistance(side, entry, price, kind) {
  if (!(entry > 0) || !(price > 0)) return null;
  const distance = kind === 'TP'
    ? (side === 'LONG' ? (price - entry) / entry : (entry - price) / entry)
    : (side === 'LONG' ? (entry - price) / entry : (price - entry) / entry);
  return Number.isFinite(distance) && distance > 0 ? distance : null;
}

export function buildFillAnchoredProtectionSpec({
  side = null,
  signalEntryPrice = null,
  takeProfitPrice = null,
  stopLossPrice = null,
} = {}) {
  const positionSide = normalizedPositionSide(side);
  const entry = positive(signalEntryPrice);
  const tp = positive(takeProfitPrice);
  const sl = positive(stopLossPrice);
  const takeProfitDistanceFraction = positionSide && entry && tp
    ? directionalDistance(positionSide, entry, tp, 'TP')
    : null;
  const stopLossDistanceFraction = positionSide && entry && sl
    ? directionalDistance(positionSide, entry, sl, 'SL')
    : null;
  return {
    fillAnchorVersion: LIVE_CARD_FILL_ANCHORED_PROTECTION_VERSION,
    fillAnchorEnabled: Boolean(positionSide && entry && (takeProfitDistanceFraction || stopLossDistanceFraction)),
    signalEntryPrice: entry,
    signalTakeProfitPrice: tp,
    signalStopLossPrice: sl,
    takeProfitDistanceFraction,
    stopLossDistanceFraction,
  };
}

export function resolveFillAnchoredProtectionPrices({
  side = null,
  fillPrice = null,
  takeProfitPrice = null,
  stopLossPrice = null,
  fillAnchorEnabled = false,
  takeProfitDistanceFraction = null,
  stopLossDistanceFraction = null,
} = {}) {
  const positionSide = normalizedPositionSide(side);
  const fill = positive(fillPrice);
  const originalTp = positive(takeProfitPrice);
  const originalSl = positive(stopLossPrice);
  const tpDistance = positive(takeProfitDistanceFraction);
  const slDistance = positive(stopLossDistanceFraction);
  if (!fillAnchorEnabled || !positionSide || !fill || (!tpDistance && !slDistance)) {
    return {
      rebased: false,
      fillPrice: fill,
      takeProfitPrice: originalTp,
      stopLossPrice: originalSl,
    };
  }
  const resolvedTp = tpDistance
    ? fill * (positionSide === 'LONG' ? 1 + tpDistance : 1 - tpDistance)
    : originalTp;
  const resolvedSl = slDistance
    ? fill * (positionSide === 'LONG' ? 1 - slDistance : 1 + slDistance)
    : originalSl;
  const validRebasedTp = tpDistance ? positive(resolvedTp) : null;
  const validRebasedSl = slDistance ? positive(resolvedSl) : null;
  return {
    rebased: Boolean(validRebasedTp || validRebasedSl),
    fillPrice: fill,
    takeProfitPrice: validRebasedTp ?? originalTp,
    stopLossPrice: validRebasedSl ?? originalSl,
  };
}

export function normalizeProtectionWorkingType(value, fallback = 'MARK_PRICE') {
  const normalized = upper(value);
  return normalized === 'CONTRACT_PRICE' || normalized === 'MARK_PRICE'
    ? normalized
    : fallback;
}

export function isLiveCardSignalProtectionSource(value) {
  return String(value ?? '').trim().toLowerCase().startsWith('live-card-whitelist-');
}

export function isLiveCardSignalProtection({ tracking = null, plan = null } = {}) {
  return Boolean(
    tracking?.preserveSignalProtection === true
      || plan?.preserveSignalProtection === true
      || isLiveCardSignalProtectionSource(tracking?.signalSource)
      || isLiveCardSignalProtectionSource(plan?.source),
  );
}

export function resolveSignalProtectionWorkingTypes({
  source = null,
  preserveSignalProtection = false,
  takeProfitWorkingType = null,
  stopLossWorkingType = null,
} = {}) {
  const preserve = preserveSignalProtection === true || isLiveCardSignalProtectionSource(source);
  return {
    preserveSignalProtection: preserve,
    takeProfitWorkingType: normalizeProtectionWorkingType(
      takeProfitWorkingType,
      preserve ? 'CONTRACT_PRICE' : 'MARK_PRICE',
    ),
    stopLossWorkingType: normalizeProtectionWorkingType(stopLossWorkingType, 'MARK_PRICE'),
  };
}
