import assert from 'node:assert/strict';
import {
  BINANCE_CLOSE_POSITION_PROTECTION_VERSION,
  buildClosePositionProtectionParams,
} from '../src/binanceClosePositionProtection.js';

assert.equal(BINANCE_CLOSE_POSITION_PROTECTION_VERSION, 'BINANCE_CLOSE_POSITION_PROTECTION_V1_20260812');

const oneWay = buildClosePositionProtectionParams({
  symbol: 'btcusdt',
  closeSide: 'sell',
  type: 'STOP_MARKET',
  triggerPrice: '99500.0',
  clientAlgoId: 'lp_sl_test',
});
assert.equal(oneWay.closePosition, 'true');
assert.equal(oneWay.clientAlgoId, 'lp_sl_test');
assert.equal(oneWay.positionSide, undefined);
assert.equal(oneWay.quantity, undefined);
assert.equal(oneWay.reduceOnly, undefined);
assert.equal(oneWay.newClientOrderId, undefined);

const hedge = buildClosePositionProtectionParams({
  symbol: 'ethusdt',
  closeSide: 'buy',
  type: 'TAKE_PROFIT_MARKET',
  triggerPrice: 3100,
  positionSide: 'SHORT',
  workingType: 'CONTRACT_PRICE',
});
assert.equal(hedge.closePosition, 'true');
assert.equal(hedge.positionSide, 'SHORT');
assert.equal(hedge.workingType, 'CONTRACT_PRICE');
assert.equal(hedge.quantity, undefined);
assert.equal(hedge.reduceOnly, undefined);

assert.throws(() => buildClosePositionProtectionParams({
  symbol: 'BTCUSDT', closeSide: 'SELL', type: 'LIMIT', triggerPrice: 1,
}), /Unsupported/);

console.log('Binance close-position protection tests passed');
