import assert from 'node:assert/strict';
import {
  BINANCE_POSITION_CLOSE_CONFIRM_VERSION,
  activeBinancePositionForSymbol,
  binancePositionCloseIsConfirmed,
} from '../src/binancePositionCloseConfirmation.js';

assert.equal(BINANCE_POSITION_CLOSE_CONFIRM_VERSION, 'BINANCE_POSITION_CLOSE_CONFIRM_V1_20260812');
const positions = [
  { symbol: 'BTCUSDT', positionAmt: '0' },
  { symbol: 'APRUSDT', positionAmt: '-250', entryPrice: '0.3994' },
];
assert.equal(binancePositionCloseIsConfirmed(positions, 'BTCUSDT'), true);
assert.equal(binancePositionCloseIsConfirmed(positions, 'APRUSDT'), false);
assert.equal(activeBinancePositionForSymbol(positions, 'aprusdt')?.entryPrice, '0.3994');
assert.equal(binancePositionCloseIsConfirmed([], 'APRUSDT'), true);

console.log('Binance position close confirmation tests passed');
