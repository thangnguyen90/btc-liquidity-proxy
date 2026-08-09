import assert from 'node:assert/strict';
import {
  LIVE_CARD_FILL_ANCHORED_PROTECTION_VERSION,
  LIVE_CARD_SIGNAL_PROTECTION_VERSION,
  buildFillAnchoredProtectionSpec,
  isLiveCardSignalProtection,
  isLiveCardSignalProtectionSource,
  normalizeProtectionWorkingType,
  resolveFillAnchoredProtectionPrices,
  resolveSignalProtectionWorkingTypes,
} from '../src/liveCardSignalProtection.js';

assert.equal(LIVE_CARD_SIGNAL_PROTECTION_VERSION, 'LIVE_CARD_SIGNAL_PROTECTION_V2_20260809');
assert.equal(LIVE_CARD_FILL_ANCHORED_PROTECTION_VERSION, 'LIVE_CARD_FILL_ANCHORED_PROTECTION_V1_20260809');
assert.equal(isLiveCardSignalProtectionSource('live-card-whitelist-edge'), true);
assert.equal(isLiveCardSignalProtectionSource('shakeout-reclaim'), false);
assert.equal(normalizeProtectionWorkingType('contract_price'), 'CONTRACT_PRICE');
assert.equal(normalizeProtectionWorkingType('invalid', 'MARK_PRICE'), 'MARK_PRICE');

assert.deepEqual(resolveSignalProtectionWorkingTypes({ source: 'live-card-whitelist-liquid' }), {
  preserveSignalProtection: true,
  takeProfitWorkingType: 'CONTRACT_PRICE',
  stopLossWorkingType: 'MARK_PRICE',
});
assert.deepEqual(resolveSignalProtectionWorkingTypes({ source: 'shakeout-reclaim' }), {
  preserveSignalProtection: false,
  takeProfitWorkingType: 'MARK_PRICE',
  stopLossWorkingType: 'MARK_PRICE',
});
assert.equal(isLiveCardSignalProtection({
  tracking: { signalSource: 'live-card-whitelist-edge' },
}), true);
assert.equal(isLiveCardSignalProtection({
  plan: { preserveSignalProtection: true },
}), true);
assert.equal(isLiveCardSignalProtection({
  tracking: { signalSource: 'manual' },
}), false);

const shortAnchor = buildFillAnchoredProtectionSpec({
  side: 'SHORT',
  signalEntryPrice: 100,
  takeProfitPrice: 98,
  stopLossPrice: 103,
});
assert.equal(shortAnchor.fillAnchorEnabled, true);
assert.equal(shortAnchor.takeProfitDistanceFraction, 0.02);
assert.equal(shortAnchor.stopLossDistanceFraction, 0.03);
assert.deepEqual(resolveFillAnchoredProtectionPrices({
  side: 'SELL',
  fillPrice: 110,
  takeProfitPrice: 98,
  stopLossPrice: 103,
  ...shortAnchor,
}), {
  rebased: true,
  fillPrice: 110,
  takeProfitPrice: 107.8,
  stopLossPrice: 113.3,
});

const longAnchor = buildFillAnchoredProtectionSpec({
  side: 'LONG',
  signalEntryPrice: 200,
  takeProfitPrice: 206,
  stopLossPrice: 196,
});
assert.deepEqual(resolveFillAnchoredProtectionPrices({
  side: 'BUY',
  fillPrice: 190,
  takeProfitPrice: 206,
  stopLossPrice: 196,
  ...longAnchor,
}), {
  rebased: true,
  fillPrice: 190,
  takeProfitPrice: 195.70000000000002,
  stopLossPrice: 186.2,
});

assert.deepEqual(resolveFillAnchoredProtectionPrices({
  side: 'SHORT',
  fillPrice: 110,
  takeProfitPrice: 98,
  stopLossPrice: 103,
}), {
  rebased: false,
  fillPrice: 110,
  takeProfitPrice: 98,
  stopLossPrice: 103,
});

assert.deepEqual(resolveFillAnchoredProtectionPrices({
  side: 'SHORT',
  fillPrice: 100,
  takeProfitPrice: 90,
  stopLossPrice: 110,
  fillAnchorEnabled: true,
  takeProfitDistanceFraction: 1.2,
}), {
  rebased: false,
  fillPrice: 100,
  takeProfitPrice: 90,
  stopLossPrice: 110,
});

console.log('live-card signal protection tests passed');
