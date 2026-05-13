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
  binSizePct = 0.001,
  depthLimit = 1000,
}) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const [premiumIndex, openInterest, klines, depth, longShortRatio] = await Promise.all([
    client.getPremiumIndex(normalizedSymbol),
    client.getOpenInterest(normalizedSymbol),
    client.getKlines(normalizedSymbol, interval, limit),
    client.getDepth(normalizedSymbol, depthLimit),
    client.getGlobalLongShortRatio(normalizedSymbol, interval, 1).catch(() => null),
  ]);

  return analyzeMarket({
    symbol: normalizedSymbol,
    klines,
    depth,
    premiumIndex,
    openInterest,
    longShortRatio,
    rangePct,
    binSizePct,
    interval,
  });
}
