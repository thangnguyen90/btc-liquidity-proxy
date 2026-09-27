import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  COIN_LEVEL_OBSERVE_MANUAL_ORDER_VERSION,
  buildCoinLevelObserveManualOrder,
} from '../src/coinLevelObserveManualOrder.js';

const now = Date.UTC(2026, 8, 22, 13, 0);
const observedAt = now - 60_000;
const longWatch = {
  symbol: 'TESTUSDT', side: 'LONG', observedAt,
  watchOnly: true, binanceEligible: false, priceAtWatch: 1,
  invalidationPrice: 0.97, earlyScore: 82, reason: 'EARLY_LONG_SCORE_PRESSURE',
};
const shortWatch = {
  symbol: 'SHORTUSDT', side: 'SHORT', observedAt,
  watchOnly: true, binanceEligible: false, priceAtWatch: 2,
  invalidationPrice: 2.08, earlyScore: 79, reason: 'EARLY_SHORT_SCORE_BREAKDOWN_PRESSURE',
  setupMode: 'BREAKDOWN_PRESSURE',
};
const snapshot = {
  generatedAt: now - 1_000,
  binanceExecution: {
    masterEnabled: true,
    routes: { LONG: { leverage: 5 }, SHORT: { leverage: 7 } },
  },
  marketRegime: { state: 'RISK_ON', allowLongEntry: true },
  earlyLongWatches: [longWatch],
  earlyShortWatches: [shortWatch],
  earlyLongHistory: [{ ...longWatch, liveNow: true, liveState: 'ACTIVE', livePrice: 1.01 }],
  earlyShortHistory: [{ ...shortWatch, liveNow: true, liveState: 'ACTIVE', livePrice: 1.99 }],
};

const long = buildCoinLevelObserveManualOrder({
  body: { symbol: 'testusdt', side: 'LONG', observedAt, marginUsdt: 3, leverage: 8 }, snapshot, now,
});
assert.equal(long.plan.version, COIN_LEVEL_OBSERVE_MANUAL_ORDER_VERSION);
assert.equal(long.plan.source, 'orders-manual');
assert.equal(long.plan.side, 'BUY');
assert.equal(long.plan.orderType, 'MARKET');
assert.equal(long.marginUsdt, 3);
assert.equal(long.leverage, 8);
assert.equal(long.plan.notionalUsdt, 24);
assert.equal(long.plan.stopLossPrice, 0.97);
assert.equal(long.plan.dryRun, false);
assert.equal(long.plan.protectionOnFill, true);

const short = buildCoinLevelObserveManualOrder({
  body: { symbol: 'SHORTUSDT', side: 'SHORT', observedAt, marginUsdt: 1.25 }, snapshot, now,
});
assert.equal(short.plan.side, 'SELL');
assert.equal(short.leverage, 7);
assert.equal(short.plan.notionalUsdt, 8.75);
assert.equal(short.plan.stopLossPrice, null,
  'manual SHORT uses the existing actual-fill SL30 policy instead of a pre-fill watch price');

const rejects = (patch, code) => assert.throws(
  () => buildCoinLevelObserveManualOrder({
    body: { symbol: 'TESTUSDT', side: 'LONG', observedAt, marginUsdt: 3 },
    snapshot: { ...snapshot, ...patch }, now,
  }),
  (error) => error.code === code,
);
rejects({ binanceExecution: { ...snapshot.binanceExecution, masterEnabled: false } }, 'MASTER_BINANCE_OFF');
rejects({ marketRegime: { state: 'RISK_OFF', allowLongEntry: false } }, 'MARKET_REGIME_BLOCKED');
rejects({ earlyLongWatches: [] }, 'WATCH_NOT_ACTIVE');
rejects({
  earlyLongHistory: [{ ...longWatch, liveNow: false, liveState: 'INVALIDATED', liveInvalidated: true }],
}, 'WATCH_LIVE_INVALIDATED');
assert.throws(() => buildCoinLevelObserveManualOrder({
  body: { symbol: 'TESTUSDT', side: 'LONG', observedAt, marginUsdt: 101 }, snapshot, now,
}), (error) => error.code === 'INVALID_MARGIN');
assert.throws(() => buildCoinLevelObserveManualOrder({
  body: { symbol: 'TESTUSDT', side: 'LONG', observedAt, marginUsdt: 1, leverage: 5.5 }, snapshot, now,
}), (error) => error.code === 'INVALID_LEVERAGE');
assert.throws(() => buildCoinLevelObserveManualOrder({
  body: { symbol: 'TESTUSDT', side: 'LONG', observedAt, marginUsdt: 1, leverage: 126 }, snapshot, now,
}), (error) => error.code === 'INVALID_LEVERAGE');
assert.throws(() => buildCoinLevelObserveManualOrder({
  body: { symbol: 'SHORTUSDT', side: 'SHORT', observedAt, marginUsdt: 1 },
  snapshot: { ...snapshot, generatedAt: now - 61_000 }, now,
}), (error) => error.code === 'STALE_SNAPSHOT');

const [server, html, ui, css] = await Promise.all([
  readFile(new URL('../src/server.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/coin-level-analysis.html', import.meta.url), 'utf8'),
  readFile(new URL('../public/coin-level-analysis.js', import.meta.url), 'utf8'),
  readFile(new URL('../public/coin-level-analysis.css', import.meta.url), 'utf8'),
]);
assert.match(server, /\/api\/coin-level-observe-manual-order/);
assert.match(server, /ordersAuthClient\.getPositions/);
assert.match(server, /EXISTING_POSITION/);
assert.match(server, /EXISTING_ENTRY_ORDER/);
assert.match(html, /<th>Coin · lệnh Binance<\/th>/);
assert.doesNotMatch(html, /<th>Lệnh Binance<\/th>/);
assert.match(html, /KHÔNG TỰ ĐẶT · CÓ NÚT THỦ CÔNG/);
assert.match(ui, /function earlyManualOrderControl/);
assert.match(ui, /early-coin-order-head/);
assert.match(ui, /function submitEarlyManualOrder/);
assert.match(ui, /SỐ TIỀN \(USDT\)/);
assert.match(ui, /ĐÒN BẨY \(x\)/);
assert.match(ui, /early-manual-leverage/);
assert.match(ui, /RISK-OFF/);
assert.match(ui, /x-orders-token/);
assert.match(ui, /GỬI LỆNH THẬT BINANCE MARKET/);
assert.match(css, /\.early-manual-margin/);
assert.match(css, /\.early-manual-leverage/);
assert.match(css, /\.early-coin-order-head/);
assert.match(css, /\.observe-recent-bidirectional/);
assert.match(css, /\.early-manual-submit\.short/);

console.log('Coin Level observe manual MARKET: active-watch validation, margin input, auth and duplicate guards OK.');
