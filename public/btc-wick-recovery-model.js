export const BTC_WICK_VERSION = 'BTC_WICK_RECOVERY_V1_20261009';
export const BTC_WICK_PUSH_TYPE = 'BTC_ALT_WICK_RECOVERY_1M';
export const COIN_PUMP_WICK_VERSION = 'COIN_PUMP_WICK_RECOVERY_V2_20261009';
export const COIN_PUMP_WICK_PUSH_TYPE = 'COIN_PUMP_WICK_RECOVERY_1M';
export const COIN_PUMP_WICK_LABELS = Object.freeze({IMMEDIATE:'Sóng bơm · một nến quét sâu rút râu',
  MULTI_BAR:'Sóng bơm · xả sâu rồi hồi trong 1–3 nến'});
export const coinPumpWickKey=pattern=>Object.hasOwn(COIN_PUMP_WICK_LABELS,pattern)?`coin-pump-wick-recovery:${pattern}`:null;
export function coinPumpWickTradeKey(trade={}) {
  const c=trade.coinPumpWickRecoveryAtEntry,raw=trade.entryAt??trade.openedAt;
  const at=typeof raw==='number'?raw:Date.parse(raw??'');
  if(!c||c.version!==COIN_PUMP_WICK_VERSION||c.contextMode!=='COIN_PUMP'||c.source!=='AT_ENTRY'
    ||c.status!=='CONFIRMED'||!(Number(c.confirmedAt)>0)||!Number.isFinite(at)
    ||c.confirmedAt>at||at-c.confirmedAt>120_000)return null;
  return coinPumpWickKey(c.pattern);
}
export const BTC_WICK_LABELS = Object.freeze({ IMMEDIATE:'Rút râu ngay · 1m', MULTI_BAR:'Quét đáy rồi hồi · 1–3 nến 1m' });
export function btcWickKey(pattern) {
  return Object.hasOwn(BTC_WICK_LABELS, pattern) ? `btc-wick-recovery:${pattern}` : null;
}
export function btcWickTradeKey(trade = {}) {
  const c = trade.btcWickRecoveryAtEntry, at = Number(trade.entryAt ?? trade.openedAt);
  if (!c || c.version !== BTC_WICK_VERSION || c.source !== 'AT_ENTRY' || c.status !== 'CONFIRMED'
    || !(Number(c.confirmedAt) > 0) || !Number.isFinite(at) || c.confirmedAt > at || at - c.confirmedAt > 120_000) return null;
  return btcWickKey(c.pattern);
}
