import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  BINANCE_EIGHT_HOUR_NEGATIVE_TP_VERSION,
  BINANCE_THREE_HOUR_POSITIVE_PNL_CLOSE_VERSION,
  BINANCE_TWELVE_HOUR_TAKE_PROFIT_VERSION,
  DEFAULT_BINANCE_NEGATIVE_TP_MAX_AGE_MS,
  DEFAULT_BINANCE_TP_MAX_AGE_MS,
  binanceTakeProfitPriceForRoe,
  evaluateBinanceEightHourNegativeTakeProfit,
  evaluateBinanceThreeHourPositivePnlClose,
  evaluateBinanceTwelveHourTakeProfit,
  isBinanceTwelveHourTpPriceMatch,
  parseBinancePositionOpenedAt,
  normalizeBinanceTrackedPositionSide,
  roundBinanceTakeProfitTowardProfit,
  resolveBinanceNegativeAgeTpConfig,
  negativeAgeTpOpenedAt,
} from '../src/binanceTwelveHourTakeProfit.js';

const now = Date.parse('2026-08-12T12:00:00.000Z');
assert.equal(BINANCE_TWELVE_HOUR_TAKE_PROFIT_VERSION, 'BINANCE_TP_AFTER_12H_DISABLED_V2_20260905');
assert.equal(BINANCE_EIGHT_HOUR_NEGATIVE_TP_VERSION, 'BINANCE_NEGATIVE_TP_TO_ENTRY_AFTER_3H_V3_MANUAL_SIDE_NORMALIZED_20260926');
assert.equal(BINANCE_THREE_HOUR_POSITIVE_PNL_CLOSE_VERSION, 'BINANCE_POSITIVE_PNL_MARKET_CLOSE_AFTER_3H_V1_20260926');
assert.equal(DEFAULT_BINANCE_NEGATIVE_TP_MAX_AGE_MS, 3 * 60 * 60 * 1000);
assert.deepEqual(resolveBinanceNegativeAgeTpConfig(), { enabled: true, maxAgeMs: 10800000 });
assert.equal(resolveBinanceNegativeAgeTpConfig({ BINANCE_NEGATIVE_TP_AFTER_8H_ENABLED: 'false' }).enabled, false);
assert.equal(resolveBinanceNegativeAgeTpConfig({ BINANCE_NEGATIVE_TP_AFTER_8H_MS: '28800000' }).maxAgeMs, 28800000);
assert.equal(resolveBinanceNegativeAgeTpConfig({ BINANCE_NEGATIVE_TP_AFTER_8H_MS: '28800000', BINANCE_NEGATIVE_TP_AFTER_3H_MS: '10800000' }).maxAgeMs, 10800000);
assert.equal(resolveBinanceNegativeAgeTpConfig({ BINANCE_NEGATIVE_TP_AFTER_3H_MS: 'bad' }).maxAgeMs, 10800000);
const tracked = { openedAt: now - 10800000, entry: 100, entryOrderId: '123', signalSide: 'LONG' };
const position = { entry: 100, amt: 2 };
assert.equal(negativeAgeTpOpenedAt(tracked, position), now - 10800000);
assert.equal(negativeAgeTpOpenedAt({ ...tracked, signalSide: 'BUY' }, position), now - 10800000);
assert.equal(negativeAgeTpOpenedAt({ ...tracked, signalSide: 'SELL' }, { ...position, amt: -2 }), now - 10800000);
assert.equal(negativeAgeTpOpenedAt({ ...tracked, signalSide: 'BUY' }, { ...position, amt: -2 }), null);
assert.equal(negativeAgeTpOpenedAt({ ...tracked, signalSide: 'SIDEWAYS' }, position), null);
assert.equal(normalizeBinanceTrackedPositionSide('buy'), 'LONG');
assert.equal(normalizeBinanceTrackedPositionSide('SELL'), 'SHORT');
assert.equal(normalizeBinanceTrackedPositionSide('LONG'), 'LONG');
assert.equal(normalizeBinanceTrackedPositionSide('SHORT'), 'SHORT');
assert.equal(normalizeBinanceTrackedPositionSide(''), null);
assert.equal(negativeAgeTpOpenedAt({ ...tracked, adopted: true }, position), null);
assert.equal(negativeAgeTpOpenedAt({ ...tracked, entryOrderId: null }, position), null);
assert.equal(negativeAgeTpOpenedAt(tracked, { ...position, entry: 102 }), null);
assert.equal(negativeAgeTpOpenedAt(tracked, { ...position, amt: -2 }), null);
assert.equal(negativeAgeTpOpenedAt(null, position), null);
assert.equal(parseBinancePositionOpenedAt('2026-08-12T00:00:00.000Z'), now - DEFAULT_BINANCE_TP_MAX_AGE_MS);

assert.equal(evaluateBinanceTwelveHourTakeProfit({
  now,
  openedAt: now - DEFAULT_BINANCE_TP_MAX_AGE_MS + 1,
  entryPrice: 100,
  leverage: 5,
  positionAmount: 2,
}).reason, 'not_expired');

const long = evaluateBinanceTwelveHourTakeProfit({
  now,
  openedAt: now - DEFAULT_BINANCE_TP_MAX_AGE_MS,
  entryPrice: 100,
  leverage: 5,
  positionAmount: 2,
});
assert.equal(long.eligible, true);
assert.equal(long.side, 'LONG');
assert.equal(long.closeSide, 'SELL');
assert.ok(Math.abs(long.targetPrice - 100.2) < 1e-9, '5x LONG +1% ROE requires +0.2% price');

const short = evaluateBinanceTwelveHourTakeProfit({
  now,
  openedAt: now - DEFAULT_BINANCE_TP_MAX_AGE_MS - 1,
  entryPrice: 100,
  leverage: 10,
  positionAmount: -2,
});
assert.equal(short.eligible, true);
assert.equal(short.side, 'SHORT');
assert.equal(short.closeSide, 'BUY');
assert.ok(Math.abs(short.targetPrice - 99.9) < 1e-9, '10x SHORT +1% ROE requires -0.1% price');

assert.equal(binanceTakeProfitPriceForRoe({ entryPrice: 100, leverage: 5, side: 'LONG', targetRoePct: 1 }), 100.2);
assert.ok(Math.abs(roundBinanceTakeProfitTowardProfit({ price: 100.201, tickSize: 0.01, side: 'LONG' }) - 100.21) < 1e-9);
assert.ok(Math.abs(roundBinanceTakeProfitTowardProfit({ price: 99.899, tickSize: 0.01, side: 'SHORT' }) - 99.89) < 1e-9);
assert.equal(isBinanceTwelveHourTpPriceMatch(100.2, 100.2, 0.01), true);
assert.equal(isBinanceTwelveHourTpPriceMatch(100, 100.2, 0.01), false, 'entry TP must not be mistaken for +1% ROE target');
assert.equal(evaluateBinanceTwelveHourTakeProfit({ enabled: false }).reason, 'disabled');
assert.equal(evaluateBinanceTwelveHourTakeProfit({ now, openedAt: null }).reason, 'missing_opened_at');
assert.equal(evaluateBinanceTwelveHourTakeProfit({
  now,
  openedAt: now - DEFAULT_BINANCE_TP_MAX_AGE_MS,
  entryPrice: 100,
  leverage: 5,
  positionAmount: 0,
}).reason, 'position_closed');

assert.equal(evaluateBinanceEightHourNegativeTakeProfit({
  now,
  openedAt: now - DEFAULT_BINANCE_NEGATIVE_TP_MAX_AGE_MS + 1,
  entryPrice: 100,
  positionAmount: 2,
  currentRoe: -0.01,
}).reason, 'not_expired');

const eightHourLong = evaluateBinanceEightHourNegativeTakeProfit({
  now,
  openedAt: now - DEFAULT_BINANCE_NEGATIVE_TP_MAX_AGE_MS,
  entryPrice: 100,
  positionAmount: 2,
  currentRoe: -0.01,
});
assert.equal(eightHourLong.eligible, true);
assert.equal(eightHourLong.side, 'LONG');
assert.equal(eightHourLong.closeSide, 'SELL');
assert.equal(eightHourLong.targetPrice, 100);
assert.equal(eightHourLong.targetRoePct, 0);

const eightHourShort = evaluateBinanceEightHourNegativeTakeProfit({
  now,
  openedAt: now - DEFAULT_BINANCE_NEGATIVE_TP_MAX_AGE_MS - 1,
  entryPrice: 100,
  positionAmount: -2,
  currentRoe: -5,
});
assert.equal(eightHourShort.eligible, true);
assert.equal(eightHourShort.side, 'SHORT');
assert.equal(eightHourShort.closeSide, 'BUY');
assert.equal(eightHourShort.targetPrice, 100);

assert.equal(evaluateBinanceEightHourNegativeTakeProfit({
  now,
  openedAt: now - DEFAULT_BINANCE_NEGATIVE_TP_MAX_AGE_MS,
  entryPrice: 100,
  positionAmount: 2,
  currentRoe: 0,
}).reason, 'not_negative');
assert.equal(evaluateBinanceEightHourNegativeTakeProfit({
  now,
  openedAt: now - DEFAULT_BINANCE_NEGATIVE_TP_MAX_AGE_MS,
  entryPrice: 100,
  positionAmount: 2,
  currentRoe: -5,
  capTsl: true,
}).reason, 'cap_tsl_excluded');
assert.equal(evaluateBinanceEightHourNegativeTakeProfit({
  now,
  openedAt: now - DEFAULT_BINANCE_NEGATIVE_TP_MAX_AGE_MS,
  entryPrice: 100,
  positionAmount: 2,
  currentRoe: null,
}).reason, 'missing_roe');

assert.equal(evaluateBinanceThreeHourPositivePnlClose({
  now,
  openedAt: now - DEFAULT_BINANCE_NEGATIVE_TP_MAX_AGE_MS + 1,
  entryPrice: 100,
  positionAmount: 2,
  unrealizedPnl: 0.01,
}).reason, 'not_expired');
const positiveTimeoutLong = evaluateBinanceThreeHourPositivePnlClose({
  now,
  openedAt: now - DEFAULT_BINANCE_NEGATIVE_TP_MAX_AGE_MS,
  entryPrice: 100,
  positionAmount: 2,
  unrealizedPnl: 0.000001,
});
assert.equal(positiveTimeoutLong.eligible, true);
assert.equal(positiveTimeoutLong.side, 'LONG');
assert.equal(positiveTimeoutLong.closeSide, 'SELL');
const positiveTimeoutShort = evaluateBinanceThreeHourPositivePnlClose({
  now,
  openedAt: now - DEFAULT_BINANCE_NEGATIVE_TP_MAX_AGE_MS,
  entryPrice: 100,
  positionAmount: -2,
  unrealizedPnl: 1,
});
assert.equal(positiveTimeoutShort.eligible, true);
assert.equal(positiveTimeoutShort.side, 'SHORT');
assert.equal(positiveTimeoutShort.closeSide, 'BUY');
for (const unrealizedPnl of [-1, 0]) {
  assert.equal(evaluateBinanceThreeHourPositivePnlClose({
    now,
    openedAt: now - DEFAULT_BINANCE_NEGATIVE_TP_MAX_AGE_MS,
    entryPrice: 100,
    positionAmount: 2,
    unrealizedPnl,
  }).reason, 'not_positive');
}
assert.equal(evaluateBinanceThreeHourPositivePnlClose({
  now,
  openedAt: now - DEFAULT_BINANCE_NEGATIVE_TP_MAX_AGE_MS,
  entryPrice: 100,
  positionAmount: 2,
  unrealizedPnl: 1,
  capTsl: true,
}).reason, 'cap_tsl_excluded');
assert.equal(evaluateBinanceThreeHourPositivePnlClose({
  now,
  openedAt: null,
  entryPrice: 100,
  positionAmount: 2,
  unrealizedPnl: 1,
}).reason, 'missing_opened_at');
assert.equal(evaluateBinanceThreeHourPositivePnlClose({
  now,
  openedAt: now - DEFAULT_BINANCE_NEGATIVE_TP_MAX_AGE_MS,
  entryPrice: 100,
  positionAmount: 0,
  unrealizedPnl: 1,
}).reason, 'position_closed');

const serverSource = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
assert.match(
  serverSource,
  /const enabled = process\.env\.BINANCE_TP_AFTER_12H_ENABLED === 'true';/,
  '12h take-profit runtime must stay explicit opt-in',
);

for (const currentRoe of [0, 1, 12]) {
  assert.equal(evaluateBinanceEightHourNegativeTakeProfit({
    now, openedAt: now - 10800001, entryPrice: 100, positionAmount: -2, currentRoe,
  }).eligible, false, 'non-negative positions must keep their TP');
}
assert.equal(evaluateBinanceEightHourNegativeTakeProfit({ enabled: false }).eligible, false);
assert.equal(evaluateBinanceEightHourNegativeTakeProfit({ now, openedAt: now - 10800000,
  entryPrice: 100, positionAmount: 0, currentRoe: -1 }).eligible, false);
assert.equal(evaluateBinanceEightHourNegativeTakeProfit({ now, openedAt: now + 1,
  entryPrice: 100, positionAmount: 1, currentRoe: -1 }).eligible, false);
assert.match(serverSource, /openedAt: negativeAgeTpOpenedAt\(slTracking.positions\?\.\[symbol\], pos\)/);
assert.match(serverSource, /!deepLossOverridesFastWave && !ageLimitOverridesFastWave/);
assert.match(serverSource, /isBinanceProtectionExcluded\(symbol, 'NEGATIVE_TP_MOVE'\)/);
console.log('Binance 3h-negative and 12h take-profit policy tests passed');
