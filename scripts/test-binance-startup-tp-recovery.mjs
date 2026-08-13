import assert from 'node:assert/strict';
import {
  BINANCE_STARTUP_TP_ONLY_RECOVERY_VERSION,
  buildStartupTakeProfitOrderParams,
  resolveStartupTakeProfitTarget,
  startupPositionNeedsTakeProfit,
} from '../src/binanceStartupTakeProfitRecovery.js';

const longPosition = { symbol: 'PROMUSDT', positionAmt: '34.5', positionSide: 'BOTH' };
const existingTp = {
  symbol: 'PROMUSDT',
  side: 'SELL',
  orderType: 'TAKE_PROFIT_MARKET',
  positionSide: 'BOTH',
  closePosition: true,
  quantity: '0',
};
const existingSlOnly = {
  symbol: 'PROMUSDT',
  side: 'SELL',
  orderType: 'STOP_MARKET',
  positionSide: 'BOTH',
};

assert.match(BINANCE_STARTUP_TP_ONLY_RECOVERY_VERSION, /TP_ONLY/);
assert.equal(BINANCE_STARTUP_TP_ONLY_RECOVERY_VERSION, 'BINANCE_TP_ONLY_GUARD_V2_20260812');
assert.equal(startupPositionNeedsTakeProfit(longPosition, [], [existingTp]), false,
  'an existing closePosition algo TP must be retained');
assert.equal(startupPositionNeedsTakeProfit(longPosition, [], [existingSlOnly]), true,
  'an SL does not count as a TP and recovery must only fill the missing TP leg');

const manualLong = resolveStartupTakeProfitTarget({
  side: 'LONG', entryPrice: 100, leverage: 5, isManual: true,
});
assert.equal(manualLong.takeProfitPrice, 106, 'manual startup recovery keeps +30% ROE TP');

const trackedShort = resolveStartupTakeProfitTarget({
  side: 'SHORT', entryPrice: 100, leverage: 5, trackedTakeProfitPrice: 94,
  isManual: true,
});
assert.equal(trackedShort.takeProfitPrice, 94, 'tracked signal TP wins over manual fallback');

assert.equal(resolveStartupTakeProfitTarget({
  side: 'LONG', entryPrice: 100, leverage: 5, isLiquidFlowV2: true,
}), null, 'Liquid Flow V2 without its original target must not receive an invented fallback');

const botShort = resolveStartupTakeProfitTarget({
  side: 'SHORT', entryPrice: 100, leverage: 5, source: 'edge-short',
});
assert.equal(botShort.takeProfitPrice, 98.8, 'known bot short keeps the configured 6% ROE default');

const orderParams = buildStartupTakeProfitOrderParams({
  symbol: 'PROMUSDT', closeSide: 'SELL', triggerPrice: 3.5, now: 1_000,
});
assert.equal(orderParams.type, 'TAKE_PROFIT_MARKET');
assert.equal(orderParams.closePosition, 'true');
assert.equal('quantity' in orderParams, false, 'closePosition recovery must cover the whole remaining position');
assert.equal(Object.values(orderParams).some((value) => String(value).includes('STOP')), false,
  'startup recovery payload must not contain an SL/STOP instruction');

console.log('binance startup TP-only recovery tests passed');
