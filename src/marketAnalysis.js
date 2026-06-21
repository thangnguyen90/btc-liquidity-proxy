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
  liquidationLimit = Number(process.env.LIQ_HEATMAP_LOOKBACK_LIMIT ?? 720),
  rangePct = 0.04,
  liqRangePct = 5.0,
  binSizePct = 0.001,
  depthLimit = 1000,
}) {
  const normalizedSymbol = normalizeSymbol(symbol);
  const EMA_LIMIT = 130; // 99 + buffer for EMA warmup
  const signalLimit = Math.max(50, Math.min(1500, Number(limit) || 192));
  const liqLimit = Math.max(signalLimit, Math.min(1500, Number(liquidationLimit) || signalLimit));
  const [premiumIndex, openInterest, klines, depth, longShortRatio, klines1h, klines4h] = await Promise.all([
    client.getPremiumIndex(normalizedSymbol),
    client.getOpenInterest(normalizedSymbol),
    client.getKlines(normalizedSymbol, interval, liqLimit),
    client.getDepth(normalizedSymbol, depthLimit),
    client.getGlobalLongShortRatio(normalizedSymbol, interval, 1).catch(() => null),
    client.getKlines(normalizedSymbol, '1h', EMA_LIMIT).catch(() => null),
    client.getKlines(normalizedSymbol, '4h', EMA_LIMIT).catch(() => null),
  ]);
  const signalKlines = klines.slice(-signalLimit);

  return analyzeMarket({
    symbol: normalizedSymbol,
    klines: signalKlines,
    liquidationKlines: klines,
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
