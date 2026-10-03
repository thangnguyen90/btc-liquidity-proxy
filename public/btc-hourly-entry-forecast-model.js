export const BTC_HOURLY_ENTRY_FORECAST_CARD_VERSION = 'BTC_HOURLY_ENTRY_FORECAST_V1_DAILY_CAUSAL_20261001';

export function btcHourlyEntryForecastTradeKey(trade = {}) {
  const observation = trade.btcHourlyEntryForecastObservation;
  if (!observation || observation.version !== BTC_HOURLY_ENTRY_FORECAST_CARD_VERSION) return null;
  const direction = String(observation.direction ?? '').trim().toUpperCase();
  if (!['LONG', 'SHORT', 'NEUTRAL'].includes(direction)) return null;
  return `btc-hourly-forecast:${direction}`;
}
