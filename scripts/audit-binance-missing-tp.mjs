import { BinanceClient } from '../src/binanceClient.js';
import { loadEnv } from '../src/env.js';
import { startupPositionNeedsTakeProfit } from '../src/binanceStartupTakeProfitRecovery.js';
import { hasOpenProtectionOrder } from '../src/protectionOrderGuard.js';

loadEnv();
const client = new BinanceClient({
  baseUrl: process.env.BINANCE_FUTURES_BASE_URL || undefined,
  timeoutMs: 20_000,
});
const auth = {
  apiKey: process.env.BINANCE_API_KEY,
  apiSecret: process.env.BINANCE_API_SECRET,
};
// BinanceRateGate intentionally unrefs queue timers for the long-running
// service. Keep this one-shot CLI alive while its queued requests settle.
const keepAlive = setInterval(() => {}, 1_000);
const [positions, regular, algoResult] = await Promise.all([
  client.getPositions(auth),
  client.getOpenOrders(auth),
  client.getOpenAlgoOrders(auth),
]);
const algo = Array.isArray(algoResult?.orders)
  ? algoResult.orders
  : Array.isArray(algoResult) ? algoResult : [];
const active = positions.filter((position) => Number(position.positionAmt) !== 0);
const rows = active.map((position) => {
  const amount = Number(position.positionAmt);
  const protectionSpec = {
    symbol: position.symbol,
    closeSide: amount > 0 ? 'SELL' : 'BUY',
    positionSide: position.positionSide ?? 'BOTH',
  };
  const hasTp = hasOpenProtectionOrder(regular, algo, { ...protectionSpec, kind: 'TP' });
  const hasSl = hasOpenProtectionOrder(regular, algo, { ...protectionSpec, kind: 'SL' });
  return {
    symbol: position.symbol,
    side: amount > 0 ? 'LONG' : 'SHORT',
    entry: Number(position.entryPrice),
    mark: Number(position.markPrice),
    roe: ((Number(position.markPrice) - Number(position.entryPrice)) / Number(position.entryPrice))
      * Number(position.leverage)
      * (amount > 0 ? 1 : -1)
      * 100,
    leverage: Number(position.leverage),
    hasTp,
    hasSl,
    missingTp: startupPositionNeedsTakeProfit(position, regular, algo),
  };
});
const missingProtectionSymbols = rows.filter((row) => !row.hasTp || !row.hasSl).map((row) => row.symbol);
const recentTrades = {};
const recentAlgoOrders = {};
for (const symbol of missingProtectionSymbols) {
  recentTrades[symbol] = (await client.getUserTrades({ symbol, limit: 10, ...auth }))
    .slice(-5)
    .map((trade) => ({
      orderId: trade.orderId,
      side: trade.side,
      positionSide: trade.positionSide,
      price: Number(trade.price),
      qty: Number(trade.qty),
      realizedPnl: Number(trade.realizedPnl),
      time: Number(trade.time),
      timeIso: new Date(Number(trade.time)).toISOString(),
    }));
  const algoHistory = await client.signedRequest(
    'GET',
    '/fapi/v1/allAlgoOrders',
    { symbol, limit: 20, recvWindow: 5000 },
    auth,
  ).catch((error) => ({ error: error.message }));
  recentAlgoOrders[symbol] = Array.isArray(algoHistory?.orders)
    ? algoHistory.orders.slice(-10)
    : Array.isArray(algoHistory)
      ? algoHistory.slice(-10)
      : algoHistory;
}
clearInterval(keepAlive);
console.log(JSON.stringify({
  active: active.length,
  missingTp: rows.filter((row) => row.missingTp).length,
  missingSl: rows.filter((row) => !row.hasSl).length,
  recentTrades,
  recentAlgoOrders,
  rows,
}, null, 2));
