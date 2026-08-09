import assert from 'node:assert/strict';
import {
  BINANCE_PROFIT_LOCK_VERSION,
  binanceProfitLockStopPrice,
  resolveBinanceProfitLockRoe,
} from '../src/binanceProfitLock.js';

assert.equal(BINANCE_PROFIT_LOCK_VERSION, 'BINANCE_PROFIT_LOCK_V1_20260809');
assert.equal(resolveBinanceProfitLockRoe(4.99), null);
assert.equal(resolveBinanceProfitLockRoe(5), 1);
assert.equal(resolveBinanceProfitLockRoe(14.99), 1);
assert.equal(resolveBinanceProfitLockRoe(15), 5);
assert.equal(resolveBinanceProfitLockRoe(20), 10);
assert.equal(resolveBinanceProfitLockRoe(5, { triggerRoe: 6, firstLockRoe: 2 }), null);
assert.equal(resolveBinanceProfitLockRoe(6, { triggerRoe: 6, firstLockRoe: 2 }), 2);
assert.equal(resolveBinanceProfitLockRoe(6, { triggerRoe: 0, firstLockRoe: 1 }), null);
assert.equal(resolveBinanceProfitLockRoe(6, { triggerRoe: 5, firstLockRoe: -1 }), null);

assert.equal(binanceProfitLockStopPrice({ side: 'LONG', entryPrice: 100, leverage: 10, lockRoe: 1 }), 100.1);
assert.equal(binanceProfitLockStopPrice({ side: 'SHORT', entryPrice: 100, leverage: 10, lockRoe: 1 }), 99.9);
assert.equal(binanceProfitLockStopPrice({ side: 'LONG', entryPrice: 0, leverage: 10, lockRoe: 1 }), null);
assert.equal(binanceProfitLockStopPrice({ side: 'LONG', entryPrice: 100, leverage: 10, lockRoe: -1 }), null);

console.log('Binance profit-lock tests passed');
