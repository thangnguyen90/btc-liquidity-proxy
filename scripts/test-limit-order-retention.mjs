import assert from 'node:assert/strict';
import {
  LIMIT_ORDER_RETENTION_VERSION,
  isAutoCancelEntryLimitEnabled,
  isRegularLimitOrder,
  selectAutomaticProtectionCleanupOrders,
} from '../src/limitOrderRetention.js';

assert.equal(LIMIT_ORDER_RETENTION_VERSION, 'LIMIT_ORDER_RETENTION_V1_20260809');
assert.equal(isAutoCancelEntryLimitEnabled(), false);
assert.equal(isAutoCancelEntryLimitEnabled('false'), false);
assert.equal(isAutoCancelEntryLimitEnabled('true'), true);
assert.equal(isRegularLimitOrder({ type: 'LIMIT' }), true);
assert.equal(isRegularLimitOrder({ origType: 'LIMIT_MAKER' }), true);
assert.equal(isRegularLimitOrder({ type: 'STOP_MARKET' }), false);

assert.deepEqual(
  selectAutomaticProtectionCleanupOrders([
    { orderId: 1, type: 'LIMIT' },
    { orderId: 2, origType: 'LIMIT_MAKER' },
    { orderId: 3, type: 'STOP_MARKET' },
    { orderId: 4, type: 'TAKE_PROFIT_MARKET' },
  ]).map((row) => row.orderId),
  [3, 4],
);

console.log('limit-order retention tests passed');
