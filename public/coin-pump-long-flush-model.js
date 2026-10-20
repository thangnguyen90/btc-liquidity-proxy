export const COIN_PUMP_FLUSH_VERSION = 'COIN_PUMP_LONG_FLUSH_V1_20261009';
export const COIN_PUMP_FLUSH_DELIVERY_VERSION = 'COIN_PUMP_LONG_FLUSH_DELIVERY_V2_RECOVERY_CHANNEL_20261009';
export const COIN_PUMP_FLUSH_PUSH_TYPE = 'COIN_PUMP_VOLUME_LONG_FLUSH_1M';
export const COIN_PUMP_FLUSH_LABELS = Object.freeze({
  DUMP_CLOSE:'Xả mạnh · đóng dưới hỗ trợ', FLUSH_RECLAIM:'Quét sâu · rút râu lấy lại hỗ trợ',
});
export function coinPumpFlushKey(pattern) {
  return Object.hasOwn(COIN_PUMP_FLUSH_LABELS,pattern)?`coin-pump-long-flush:${pattern}`:null;
}
export function coinPumpFlushTradeKey(trade={}) {
  const c=trade.coinPumpLongFlushAtEntry,at=Number(trade.entryAt??trade.openedAt);
  if(!c || c.version!==COIN_PUMP_FLUSH_VERSION || c.source!=='AT_ENTRY' || c.status!=='CONFIRMED'
    || !(Number(c.confirmedAt)>0) || !Number.isFinite(at) || c.confirmedAt>at || at-c.confirmedAt>120_000) return null;
  return coinPumpFlushKey(c.pattern);
}
