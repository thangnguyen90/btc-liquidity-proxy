import assert from 'node:assert/strict';
import {
  DEFAULT_ENTRY_LIMIT_MAX_AGE_MS,
  ENTRY_LIMIT_TWELVE_HOUR_EXPIRY_VERSION,
  LIMIT_ORDER_RETENTION_VERSION,
  isAutoCancelEntryLimitEnabled,
  isEntryLimitExpiryEnabled,
  isEntryLimitOrder,
  isRegularLimitOrder,
  selectExpiredEntryLimitOrders,
  selectAutomaticProtectionCleanupOrders,
} from '../src/limitOrderRetention.js';

assert.equal(LIMIT_ORDER_RETENTION_VERSION, 'LIMIT_ORDER_RETENTION_V1_20260809');
assert.equal(isAutoCancelEntryLimitEnabled(), false);
assert.equal(isAutoCancelEntryLimitEnabled('false'), false);
assert.equal(isAutoCancelEntryLimitEnabled('true'), true);
assert.equal(isRegularLimitOrder({ type: 'LIMIT' }), true);
assert.equal(isRegularLimitOrder({ origType: 'LIMIT_MAKER' }), true);
assert.equal(isRegularLimitOrder({ type: 'STOP_MARKET' }), false);
assert.match(ENTRY_LIMIT_TWELVE_HOUR_EXPIRY_VERSION, /V1_20260824$/);
assert.equal(DEFAULT_ENTRY_LIMIT_MAX_AGE_MS, 43_200_000);
assert.equal(isEntryLimitExpiryEnabled(), true);
assert.equal(isEntryLimitExpiryEnabled('false'), false);
assert.equal(isEntryLimitOrder({ type: 'LIMIT', reduceOnly: false }), true);
assert.equal(isEntryLimitOrder({ type: 'LIMIT', reduceOnly: true }), false);
assert.equal(isEntryLimitOrder({ type: 'LIMIT', closePosition: true }), false);

const now = 2_000_000_000_000;
assert.deepEqual(selectExpiredEntryLimitOrders([
  { orderId: 10, type: 'LIMIT', time: now - DEFAULT_ENTRY_LIMIT_MAX_AGE_MS },
  { orderId: 11, type: 'LIMIT', time: now - DEFAULT_ENTRY_LIMIT_MAX_AGE_MS + 1 },
  { orderId: 12, type: 'LIMIT', time: now - DEFAULT_ENTRY_LIMIT_MAX_AGE_MS - 1, reduceOnly: true },
  { orderId: 13, type: 'TAKE_PROFIT_MARKET', time: now - DEFAULT_ENTRY_LIMIT_MAX_AGE_MS - 1 },
  { orderId: 14, type: 'LIMIT' },
], { now }).map((row) => row.orderId), [10]);

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
