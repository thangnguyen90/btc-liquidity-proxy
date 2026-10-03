export const PUMP_BASE_VERSION = 'PUMP_BASE_RECOVERY_V1_20260927';
export const PUMP_BASE_FRAMES = Object.freeze({ '5m': 300000, '15m': 900000, '1h': 3600000, '4h': 14400000, '1d': 86400000 });
export const PUMP_BASE_STAGES = Object.freeze({
  AT_BASE: 'ĐÃ TRẢ VỀ CHÂN', RECOVERING: 'ĐANG HỒI',
  VOLUME_RECOVERY: 'HỒI · VOLUME TĂNG DẦN', WEAKENED: 'YẾU LẠI / MẤT ĐÁY',
});
export function pumpBaseCardKey(interval, stage) {
  return Object.hasOwn(PUMP_BASE_FRAMES, interval) && Object.hasOwn(PUMP_BASE_STAGES, stage)
    ? `pump-base:${interval}:${stage}` : null;
}
export function pumpBaseTradeKey(trade = {}) {
  const o = trade.pumpBaseObservation;
  return trade.side === 'LONG' && o?.version === PUMP_BASE_VERSION ? pumpBaseCardKey(o.interval, o.stage) : null;
}
