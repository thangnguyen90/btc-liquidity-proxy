export const COIN_PUMP_WICK_EARLY_VERSION = 'COIN_PUMP_WICK_EARLY_V1_20261010';
export const COIN_PUMP_WICK_EARLY_PUSH_TYPE = 'COIN_PUMP_WICK_EARLY_1M';
export const COIN_PUMP_WICK_EARLY_LABEL = 'MỚI · Rút râu sớm sau sóng bơm · chưa xác nhận hồi';
export const coinPumpWickEarlyKey = pattern => pattern === 'EARLY_WICK' ? 'coin-pump-wick-early:EARLY_WICK' : null;
export function coinPumpWickEarlyTradeKey(trade = {}) {
  const c = trade.coinPumpWickEarlyAtEntry, raw = trade.entryAt ?? trade.openedAt;
  const at = typeof raw === 'number' ? raw : Date.parse(raw ?? '');
  if (!c || c.version !== COIN_PUMP_WICK_EARLY_VERSION || c.source !== 'AT_ENTRY'
    || c.status !== 'WICK_DETECTED' || !(Number(c.detectedAt) > 0) || !Number.isFinite(at)
    || c.detectedAt > at || at - c.detectedAt > 120_000) return null;
  return coinPumpWickEarlyKey(c.pattern);
}
