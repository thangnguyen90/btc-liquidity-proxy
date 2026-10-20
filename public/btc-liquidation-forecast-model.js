export const BTC_LIQUIDATION_FORECAST_VERSION = 'BTC_LIQUIDATION_EARLY_RISK_V2_UNWINDING_20261013';
export const BTC_LIQUIDATION_FORECAST_LEGACY_VERSION = 'BTC_LIQUIDATION_EARLY_RISK_V1_20261013';
export const BTC_LIQUIDATION_FORECAST_TIERS = Object.freeze({
  WAIT_DATA:'Chưa đủ dữ liệu cảnh báo sớm',
  MONITOR:'Chưa đủ dấu hiệu ép vị thế',
  WATCH:'Vị thế dễ tổn thương · theo dõi',
  EARLY:'Nguy cơ bị ép cao hơn · cảnh báo sớm',
  UNWINDING:'Đang tháo vị thế · nghiêng ép hướng này',
});
export function btcLiquidationForecastKey(side,tier) {
  return ['LONG','SHORT'].includes(side) && ['WATCH','EARLY','UNWINDING'].includes(tier)
    ? `btc-liquidation-forecast:${side}:${tier}` : null;
}
export function btcLiquidationForecastTradeKey(trade={}) {
  const c=trade.btcLiquidationForecastAtEntry, entry=Number(trade.entryAt??trade.openedAt);
  if(!c || ![BTC_LIQUIDATION_FORECAST_VERSION,BTC_LIQUIDATION_FORECAST_LEGACY_VERSION].includes(c.version) || c.source!=='AT_ENTRY' || c.ready!==true
    || !Number.isFinite(entry) || !(Number(c.evaluatedAt)>0) || c.evaluatedAt>entry || entry-c.evaluatedAt>60_000) return null;
  if(c.version===BTC_LIQUIDATION_FORECAST_LEGACY_VERSION && c.tier==='UNWINDING')return null;
  return btcLiquidationForecastKey(c.side,c.tier);
}
