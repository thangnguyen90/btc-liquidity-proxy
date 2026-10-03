export const IMPULSE_ENTRY_VERSION = 'POST_MOVE_IMPULSE_ENTRY_V1_20260927';
export const IMPULSE_ENTRY_METHODS = Object.freeze({
  RETEST: 'RETEST RỒI TIẾP DIỄN',
  BASE_BREAK: 'PHÁ NỀN TÍCH LŨY NGẮN',
});

export function impulseEntryCardKey(side, method) {
  return ['LONG', 'SHORT'].includes(side) && Object.hasOwn(IMPULSE_ENTRY_METHODS, method)
    ? `btc-session:ENTRY:${side}:${method}` : null;
}

export function impulseEntryTradeKey(trade = {}) {
  const observation = trade.impulseEntryObservation;
  return observation?.version === IMPULSE_ENTRY_VERSION && observation.side === trade.side
    ? impulseEntryCardKey(observation.side, observation.method) : null;
}
