import assert from 'node:assert/strict';
import {
  POSITION_PROTECTION_FILL_WATERMARK_VERSION,
  advanceProtectionFillWatermark,
  normalizeProtectionFillWatermark,
} from '../src/protectionFillWatermark.js';

const initial = normalizeProtectionFillWatermark({}, 1000);
assert.equal(initial.version, POSITION_PROTECTION_FILL_WATERMARK_VERSION);
assert.equal(initial.lastHandledFillAt, 1000);
assert.deepEqual(initial.handledOrderIds, []);

const first = advanceProtectionFillWatermark(initial, { orderId: 123, fillTime: 1500 });
assert.equal(first.lastHandledFillAt, 1500);
assert.deepEqual(first.handledOrderIds, ['123']);

const duplicate = advanceProtectionFillWatermark(first, { orderId: 123, fillTime: 1400 });
assert.equal(duplicate.lastHandledFillAt, 1500);
assert.deepEqual(duplicate.handledOrderIds, ['123']);

const next = advanceProtectionFillWatermark(duplicate, { clientOrderId: 'manual-2', updateTime: 1700 });
assert.equal(next.lastHandledFillAt, 1700);
assert.deepEqual(next.handledOrderIds, ['123', 'manual-2']);

console.log('Protection fill watermark tests passed');
