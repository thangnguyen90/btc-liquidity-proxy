export const COIN_LEVEL_ENTRY_WATCH_LIVE_PAYLOAD_VERSION =
  'COIN_LEVEL_ENTRY_WATCH_LIVE_PAYLOAD_V1_20260926';

const RECENT_BIDIRECTIONAL_WINDOW_MS = 30 * 60_000;

export function buildCoinLevelEntryWatchHttpResponse(snapshot = {}, { includeHistory = false } = {}) {
  if (includeHistory) {
    return {
      ...snapshot,
      historyIncluded: true,
      responseVersion: COIN_LEVEL_ENTRY_WATCH_LIVE_PAYLOAD_VERSION,
    };
  }

  const generatedAt = Number(snapshot.generatedAt) || Date.now();
  const cutoff = generatedAt - RECENT_BIDIRECTIONAL_WINDOW_MS;
  const recentObserveHistory = [
    ...(Array.isArray(snapshot.earlyLongHistory) ? snapshot.earlyLongHistory : []),
    ...(Array.isArray(snapshot.earlyShortHistory) ? snapshot.earlyShortHistory : []),
  ]
    .filter((watch) => {
      const observedAt = Number(watch?.observedAt);
      return Number.isFinite(observedAt) && observedAt >= cutoff && observedAt <= generatedAt;
    })
    .map((watch) => ({
      symbol: String(watch?.symbol ?? '').toUpperCase(),
      side: String(watch?.side ?? '').toUpperCase(),
      observedAt: Number(watch?.observedAt),
    }))
    .filter((watch) => watch.symbol && ['LONG', 'SHORT'].includes(watch.side));

  const { earlyLongHistory, earlyShortHistory, ...liveSnapshot } = snapshot;
  return {
    ...liveSnapshot,
    historyIncluded: false,
    recentObserveHistory,
    responseVersion: COIN_LEVEL_ENTRY_WATCH_LIVE_PAYLOAD_VERSION,
  };
}
