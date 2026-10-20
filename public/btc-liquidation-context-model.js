export const BTC_LIQUIDATION_CONTEXT_VERSION = 'BTC_LIQUIDATION_CONTEXT_V4_OBSERVED_WARMUP_20261013';
export const BTC_LIQUIDATION_CONTEXT_V3_VERSION = 'BTC_LIQUIDATION_CONTEXT_V3_EARLY_RISK_20261013';
export const BTC_LIQUIDATION_CONTEXT_V2_VERSION = 'BTC_LIQUIDATION_CONTEXT_V2_SPIKE_MEMORY_20261012';
export const BTC_LIQUIDATION_CONTEXT_LEGACY_VERSION = 'BTC_LIQUIDATION_CONTEXT_V1_20261009';
export const BTC_LIQUIDATION_STATES = Object.freeze({
  WAIT_DATA: 'Chưa đủ dữ liệu để đánh giá',
  NEUTRAL: 'Chưa ghi nhận áp lực thanh lý nổi bật',
  LONG_CROWDED: 'LONG tích tụ · dễ tổn thương',
  SHORT_CROWDED: 'SHORT tích tụ · dễ tổn thương',
  LONG_SPIKE: 'Thanh lý LONG tăng đột biến · chưa xác nhận dây chuyền',
  SHORT_SPIKE: 'Thanh lý SHORT tăng đột biến · chưa xác nhận dây chuyền',
  LONG_OBSERVED_LARGE:'Đã ghi nhận thanh lý LONG đáng chú ý · không chờ đủ nền',
  SHORT_OBSERVED_LARGE:'Đã ghi nhận thanh lý SHORT đáng chú ý · không chờ đủ nền',
  BOTH_OBSERVED_LARGE:'Đã ghi nhận thanh lý đáng chú ý cả LONG và SHORT',
  RECENT_LONG_LIQUIDATION: 'Vừa có đợt thanh lý LONG · tiếp tục theo dõi',
  RECENT_SHORT_LIQUIDATION: 'Vừa có đợt thanh lý SHORT · tiếp tục theo dõi',
  LONG_CASCADE: 'Áp lực thanh lý LONG · rủi ro giảm lan rộng',
  SHORT_CASCADE: 'Áp lực thanh lý SHORT · rủi ro tăng ép SHORT',
  POST_LONG_LIQUIDATION: 'Đang ổn định sau thanh lý LONG',
  POST_SHORT_LIQUIDATION: 'Đang ổn định sau thanh lý SHORT',
});
export function btcLiquidationKey(state) {
  return Object.hasOwn(BTC_LIQUIDATION_STATES, state) && state !== 'WAIT_DATA'
    ? `btc-liquidation-context:${state}` : null;
}
// Only a frozen, explicitly captured pre-entry observation can identify a cohort.
// Live context and historical reconstruction must never label an existing trade.
export function btcLiquidationTradeKey(trade = {}) {
  const c = trade.btcLiquidationContextAtEntry;
  const entryAt = Number(trade.entryAt ?? trade.openedAt);
  const legacy = c?.version === BTC_LIQUIDATION_CONTEXT_LEGACY_VERSION;
  if (!c || (!legacy && ![BTC_LIQUIDATION_CONTEXT_VERSION,BTC_LIQUIDATION_CONTEXT_V2_VERSION,BTC_LIQUIDATION_CONTEXT_V3_VERSION].includes(c.version)) || c.source !== 'AT_ENTRY'
    || c.ready !== true || !Number.isFinite(entryAt) || !(Number(c.evaluatedAt) > 0)
    || c.evaluatedAt > entryAt || entryAt - c.evaluatedAt > 60_000) return null;
  if (legacy && /SPIKE|^RECENT_/.test(c.state)) return null;
  if(c.version!==BTC_LIQUIDATION_CONTEXT_VERSION && /OBSERVED_LARGE/.test(c.state))return null;
  return btcLiquidationKey(c.state);
}
