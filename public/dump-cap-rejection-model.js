export const DUMP_CAP_VERSION = 'DUMP_CAP_REJECTION_V1_20260927';
export const DUMP_CAP_FRAMES = Object.freeze({ '5m': 300000, '15m': 900000, '1h': 3600000, '4h': 14400000, '1d': 86400000 });
export const DUMP_CAP_STAGES = Object.freeze({
  AT_CAP: 'ĐÃ HỒI VỀ ĐỈNH',
  REJECTING: 'ĐANG BỊ TỪ CHỐI',
  VOLUME_REJECTION: 'GIẢM · VOLUME TĂNG DẦN',
  INVALIDATED: 'VƯỢT ĐỈNH / MẠNH LẠI',
});

export function dumpCapCardKey(interval, stage) {
  return Object.hasOwn(DUMP_CAP_FRAMES, interval) && Object.hasOwn(DUMP_CAP_STAGES, stage)
    ? `dump-cap:${interval}:${stage}` : null;
}

export function dumpCapTradeKey(trade = {}) {
  const observation = trade.dumpCapObservation;
  return trade.side === 'SHORT' && observation?.version === DUMP_CAP_VERSION
    ? dumpCapCardKey(observation.interval, observation.stage)
    : null;
}
