export const COIN_LEVEL_OBSERVE_LIVE_STATUS_VERSION =
  'COIN_LEVEL_OBSERVE_LIVE_STATUS_V1_20260922';

function positiveNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

export function buildCoinLevelObserveLiveStatus({
  watch,
  closedCandleActive = false,
  liveQuote = null,
} = {}) {
  const side = String(watch?.side ?? '').toUpperCase();
  const priceAtWatch = positiveNumber(watch?.priceAtWatch);
  const invalidationPrice = positiveNumber(watch?.invalidationPrice);
  const livePrice = positiveNumber(liveQuote?.price);
  const livePriceAt = Number.isFinite(Number(liveQuote?.at)) ? Number(liveQuote.at) : null;
  const hasLivePrice = livePrice != null;
  const liveInvalidated = Boolean(
    hasLivePrice
      && invalidationPrice != null
      && ((side === 'LONG' && livePrice <= invalidationPrice)
        || (side === 'SHORT' && livePrice >= invalidationPrice)),
  );
  const liveMovePct = hasLivePrice && priceAtWatch != null
    ? ((livePrice / priceAtWatch) - 1) * 100
    : null;
  const liveState = liveInvalidated
    ? 'INVALIDATED'
    : closedCandleActive
      ? (hasLivePrice ? 'ACTIVE' : 'ACTIVE_PRICE_UNAVAILABLE')
      : 'HISTORY';

  return {
    liveStatusVersion: COIN_LEVEL_OBSERVE_LIVE_STATUS_VERSION,
    closedCandleActive: Boolean(closedCandleActive),
    liveNow: Boolean(closedCandleActive) && !liveInvalidated,
    liveState,
    liveInvalidated,
    livePrice,
    livePriceAt,
    livePriceSource: hasLivePrice ? String(liveQuote?.source ?? 'UNKNOWN') : null,
    liveMovePct,
  };
}
