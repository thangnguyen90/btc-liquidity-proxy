import { BinanceClient } from './binanceClient.js';
import { analyzeMarket } from './liquidityProxy.js';

export function normalizeSymbol(input) {
  const symbol = String(input).trim().toUpperCase().replace(/[-/_\s]/g, '');

  if (!symbol) {
    return 'BTCUSDT';
  }

  if (symbol.endsWith('USDT')) {
    return symbol;
  }

  return `${symbol}USDT`;
}

export async function fetchAnalysis({
  client = new BinanceClient(),
  symbol,
  interval = '15m',
  limit = 192,
  rangePct = 0.04,
  liqRangePct = 5.0,
  binSizePct = 0.001,
  depthLimit = 1000,
}) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const EMA_LIMIT = 130; // 99 + buffer for EMA warmup
  const [premiumIndex, openInterest, klines, depth, longShortRatio, klines1h, klines4h] = await Promise.all([
    client.getPremiumIndex(normalizedSymbol),
    client.getOpenInterest(normalizedSymbol),
    client.getKlines(normalizedSymbol, interval, limit),
    client.getDepth(normalizedSymbol, depthLimit),
    client.getGlobalLongShortRatio(normalizedSymbol, interval, 1).catch(() => null),
    client.getKlines(normalizedSymbol, '1h', EMA_LIMIT).catch(() => null),
    client.getKlines(normalizedSymbol, '4h', EMA_LIMIT).catch(() => null),
  ]);

  return analyzeMarket({
    symbol: normalizedSymbol,
    klines,
    klines1h,
    klines4h,
    depth,
    premiumIndex,
    openInterest,
    longShortRatio,
    rangePct,
    liqRangePct,
    binSizePct,
    interval,
  });
}
