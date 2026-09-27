import assert from 'node:assert/strict';
import {
  comparePostMoveLivePrice,
  parsePostMoveMarkPricePayload,
  POST_MOVE_LIVE_PRICE_SOCKET_VERSION,
} from '../public/post-move-live-prices.js';

assert.match(POST_MOVE_LIVE_PRICE_SOCKET_VERSION, /^POST_MOVE_LIVE_PRICE_SOCKET_V1_/);

const ticks = parsePostMoveMarkPricePayload(JSON.stringify([
  { e: 'markPriceUpdate', E: 1000, s: 'BTCUSDT', p: '64000.5' },
  { e: 'markPriceUpdate', E: 1001, s: 'ETHUSDT', p: '3500.25' },
  { e: 'markPriceUpdate', E: 1002, s: 'INVALID', p: '1' },
]), new Set(['ETHUSDT']));
assert.deepEqual(ticks, [{ symbol: 'ETHUSDT', markPrice: 3500.25, eventAt: 1001 }]);

const inside = comparePostMoveLivePrice({
  price: 100,
  snapshotPrice: 98,
  zoneLow: 99,
  zoneHigh: 101,
  midpoint: 100.5,
});
assert.equal(inside.inZone, true);
assert.ok(Math.abs(inside.deltaSnapshotPct - 2.0408163265) < 1e-6);
assert.ok(Math.abs(inside.distanceToMidPct - 0.5) < 1e-9);

const outside = comparePostMoveLivePrice({
  price: 105,
  snapshotPrice: 100,
  zoneLow: 99,
  zoneHigh: 101,
  midpoint: 100,
});
assert.equal(outside.inZone, false);
assert.ok(Math.abs(outside.deltaSnapshotPct - 5) < 1e-9);

console.log('post-move live-price socket tests passed');
