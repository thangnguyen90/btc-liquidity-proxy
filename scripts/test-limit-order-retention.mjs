import assert from 'node:assert/strict';
import {
  DEFAULT_ENTRY_LIMIT_MAX_AGE_MS,
  COIN_LEVEL_ENTRY_LIMIT_MAX_AGE_MS,
  DCA_ATTACHED_LIMIT_RETENTION_VERSION,
  ENTRY_LIMIT_TWELVE_HOUR_EXPIRY_VERSION,
  LIMIT_ORDER_RETENTION_VERSION,
  isAutoCancelEntryLimitEnabled,
  isEntryLimitExpiryEnabled,
  isEntryLimitOrder,
  isDcaAttachedLimitOrder,
  isRegularLimitOrder,
  selectDcaAttachedLimitOrders,
  selectExpiredEntryLimitOrders,
  selectAutomaticProtectionCleanupOrders,
  shouldRetainDcaAttachedLimitOrder,
} from '../src/limitOrderRetention.js';

assert.equal(LIMIT_ORDER_RETENTION_VERSION, 'LIMIT_ORDER_RETENTION_V1_20260809');
assert.equal(isAutoCancelEntryLimitEnabled(), false);
assert.equal(isAutoCancelEntryLimitEnabled('false'), false);
assert.equal(isAutoCancelEntryLimitEnabled('true'), true);
assert.equal(isRegularLimitOrder({ type: 'LIMIT' }), true);
assert.equal(isRegularLimitOrder({ origType: 'LIMIT_MAKER' }), true);
assert.equal(isRegularLimitOrder({ type: 'STOP_MARKET' }), false);
assert.match(ENTRY_LIMIT_TWELVE_HOUR_EXPIRY_VERSION, /V2_DCA_ATTACHED_EXEMPT_20260828$/);
assert.match(DCA_ATTACHED_LIMIT_RETENTION_VERSION, /V1_20260828$/);
assert.equal(DEFAULT_ENTRY_LIMIT_MAX_AGE_MS, 43_200_000);
assert.equal(COIN_LEVEL_ENTRY_LIMIT_MAX_AGE_MS, 2_700_000);
assert.equal(isEntryLimitExpiryEnabled(), true);
assert.equal(isEntryLimitExpiryEnabled('false'), false);
assert.equal(isEntryLimitOrder({ type: 'LIMIT', reduceOnly: false }), true);
assert.equal(isEntryLimitOrder({ type: 'LIMIT', reduceOnly: true }), false);
assert.equal(isEntryLimitOrder({ type: 'LIMIT', closePosition: true }), false);
assert.equal(isEntryLimitOrder({ type: 'LIMIT', side: 'SELL', positionSide: 'LONG' }), false);
assert.equal(isEntryLimitOrder({ type: 'LIMIT', side: 'BUY', positionSide: 'SHORT' }), false);

const longPosition = { symbol: 'BTCUSDT', positionAmt: '0.01', positionSide: 'BOTH' };
const shortPosition = { symbol: 'ETHUSDT', positionAmt: '-1', positionSide: 'BOTH' };
assert.equal(isDcaAttachedLimitOrder({ symbol: 'BTCUSDT', type: 'LIMIT', side: 'BUY' }, longPosition), true);
assert.equal(isDcaAttachedLimitOrder({ symbol: 'BTCUSDT', type: 'LIMIT', side: 'SELL' }, longPosition), false);
assert.equal(isDcaAttachedLimitOrder({ symbol: 'ETHUSDT', type: 'LIMIT', side: 'SELL' }, shortPosition), true);
assert.equal(isDcaAttachedLimitOrder({ symbol: 'ETHUSDT', type: 'LIMIT', side: 'BUY' }, shortPosition), false);
assert.equal(isDcaAttachedLimitOrder({
  symbol: 'BTCUSDT', type: 'LIMIT', side: 'BUY', positionSide: 'LONG',
}, { symbol: 'BTCUSDT', positionAmt: '0.01', positionSide: 'LONG' }), true);
assert.deepEqual(selectDcaAttachedLimitOrders([
  { orderId: 20, symbol: 'BTCUSDT', type: 'LIMIT', side: 'BUY' },
  { orderId: 21, symbol: 'BTCUSDT', type: 'LIMIT', side: 'SELL' },
  { orderId: 22, symbol: 'ETHUSDT', type: 'LIMIT', side: 'SELL' },
], [longPosition, shortPosition]).map((row) => row.orderId), [20, 22]);
assert.equal(shouldRetainDcaAttachedLimitOrder({
  order: { symbol: 'BTCUSDT', type: 'LIMIT', side: 'BUY', executedQty: 0 },
  position: longPosition,
}), true, 'unfilled same-side LIMIT necessarily predates/overlaps the active position');
assert.equal(shouldRetainDcaAttachedLimitOrder({
  order: { symbol: 'BTCUSDT', type: 'LIMIT', side: 'BUY', executedQty: 0.01 },
  position: { ...longPosition, positionAmt: 0.01 },
}), false, 'a partial standalone LIMIT must not become DCA merely because its own fill created the position');
assert.equal(shouldRetainDcaAttachedLimitOrder({
  order: { symbol: 'BTCUSDT', type: 'LIMIT', side: 'BUY', executedQty: 0.01 },
  position: { ...longPosition, positionAmt: 0.02 },
}), true, 'position quantity larger than partial fill proves pre-existing same-side exposure');
assert.equal(shouldRetainDcaAttachedLimitOrder({
  order: { symbol: 'BTCUSDT', type: 'LIMIT', side: 'BUY', executedQty: 0.01 },
  position: { ...longPosition, positionAmt: 0.01 },
  taggedAtSubmission: true,
}), true, 'submission-time DCA tag is authoritative while parent position remains active');

const now = 2_000_000_000_000;
assert.deepEqual(selectExpiredEntryLimitOrders([
  { orderId: 10, type: 'LIMIT', time: now - DEFAULT_ENTRY_LIMIT_MAX_AGE_MS },
  { orderId: 11, type: 'LIMIT', time: now - DEFAULT_ENTRY_LIMIT_MAX_AGE_MS + 1 },
  { orderId: 12, type: 'LIMIT', time: now - DEFAULT_ENTRY_LIMIT_MAX_AGE_MS - 1, reduceOnly: true },
  { orderId: 13, type: 'TAKE_PROFIT_MARKET', time: now - DEFAULT_ENTRY_LIMIT_MAX_AGE_MS - 1 },
  { orderId: 14, type: 'LIMIT' },
], { now }).map((row) => row.orderId), [10]);
assert.deepEqual(selectExpiredEntryLimitOrders([
  { orderId: 15, type: 'LIMIT', clientOrderId: 'clel_fresh', time: now - COIN_LEVEL_ENTRY_LIMIT_MAX_AGE_MS + 1 },
  { orderId: 16, type: 'LIMIT', clientOrderId: 'clel_expired', time: now - COIN_LEVEL_ENTRY_LIMIT_MAX_AGE_MS },
  { orderId: 17, type: 'LIMIT', clientOrderId: 'clew_market', time: now - COIN_LEVEL_ENTRY_LIMIT_MAX_AGE_MS },
], { now }).map((row) => row.orderId), [16]);
assert.deepEqual(selectExpiredEntryLimitOrders([
  { orderId: 19, type: 'LIMIT', clientOrderId: 'clel_pre_restart', time: now - 10_000 },
  { orderId: 20, type: 'LIMIT', clientOrderId: 'clel_this_process', time: now - 1_000 },
], { now, coinLevelStartedAt: now - 5_000 }).map((row) => row.orderId), [19],
'pending Coin Level LIMIT from a prior process must be cancelled before it can fill without an in-memory protection plan');
assert.deepEqual(selectExpiredEntryLimitOrders([
  { orderId: 18, symbol: 'BTCUSDT', type: 'LIMIT', side: 'BUY', clientOrderId: 'clel_partial',
    time: now - 1_000, executedQty: 0.01 },
], { now, positions: [{ ...longPosition, positionAmt: 0.01 }] }).map((row) => row.orderId), [18],
'a partially filled Coin Level LIMIT must cancel its remainder promptly, not become DCA');

assert.deepEqual(selectExpiredEntryLimitOrders([
  { orderId: 30, symbol: 'BTCUSDT', type: 'LIMIT', side: 'BUY', time: now - DEFAULT_ENTRY_LIMIT_MAX_AGE_MS - 1 },
  { orderId: 31, symbol: 'BTCUSDT', type: 'LIMIT', side: 'SELL', time: now - DEFAULT_ENTRY_LIMIT_MAX_AGE_MS - 1 },
  { orderId: 32, symbol: 'ETHUSDT', type: 'LIMIT', side: 'SELL', time: now - DEFAULT_ENTRY_LIMIT_MAX_AGE_MS - 1 },
], { now, positions: [longPosition, shortPosition] }).map((row) => row.orderId), [31],
'same-side DCA LIMIT must ignore 12h expiry while the original position is active');
assert.deepEqual(selectExpiredEntryLimitOrders([
  {
    orderId: 33,
    symbol: 'BTCUSDT',
    type: 'LIMIT',
    side: 'BUY',
    executedQty: 0.01,
    time: now - DEFAULT_ENTRY_LIMIT_MAX_AGE_MS - 1,
  },
], { now, positions: [{ ...longPosition, positionAmt: 0.01 }] }).map((row) => row.orderId), [33],
'a standalone partial fill remains eligible for expiry when its position equals only its own executed quantity');

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
