import assert from 'node:assert/strict';
import {
  BINANCE_EIGHT_HOUR_NEGATIVE_TP_VERSION,
  BINANCE_TWELVE_HOUR_TAKE_PROFIT_VERSION,
  DEFAULT_BINANCE_NEGATIVE_TP_MAX_AGE_MS,
  DEFAULT_BINANCE_TP_MAX_AGE_MS,
  binanceTakeProfitPriceForRoe,
  evaluateBinanceEightHourNegativeTakeProfit,
  evaluateBinanceTwelveHourTakeProfit,
  isBinanceTwelveHourTpPriceMatch,
  parseBinancePositionOpenedAt,
  roundBinanceTakeProfitTowardProfit,
} from '../src/binanceTwelveHourTakeProfit.js';

const now = Date.parse('2026-08-12T12:00:00.000Z');
assert.match(BINANCE_TWELVE_HOUR_TAKE_PROFIT_VERSION, /20260812$/);
assert.equal(BINANCE_EIGHT_HOUR_NEGATIVE_TP_VERSION, 'BINANCE_NEGATIVE_TP_TO_ENTRY_AFTER_8H_V1_20260816');
assert.equal(DEFAULT_BINANCE_NEGATIVE_TP_MAX_AGE_MS, 8 * 60 * 60 * 1000);
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

console.log('Binance 8h-negative and 12h take-profit policy tests passed');
