import assert from 'node:assert/strict';
import {
  calculateBtc5mFlipRate,
  capShakeoutChopChaseMargin,
  shakeoutFeeBreakEvenPrice,
} from '../src/shakeoutChaseShadowRule.js';

assert.equal(capShakeoutChopChaseMargin({
  variant: 'CHASE', btcMarketRegimeAtEntry: 'CHOP', marginUsdt: 10, capUsdt: 1,
}), 1);
assert.equal(capShakeoutChopChaseMargin({
  variant: 'MARKET', btcMarketRegimeAtEntry: 'CHOP', marginUsdt: 10, capUsdt: 1,
}), 10);
assert.equal(capShakeoutChopChaseMargin({
  variant: 'CHASE', btcMarketRegimeAtEntry: 'UP', marginUsdt: 2, capUsdt: 1,
}), 2);

const feeRate = 0.0004;
const longBe = shakeoutFeeBreakEvenPrice({ entryPrice: 100, side: 'LONG', feeRate });
const shortBe = shakeoutFeeBreakEvenPrice({ entryPrice: 100, side: 'SHORT', feeRate });
assert.ok(longBe > 100);
assert.ok(shortBe < 100);
assert.ok(Math.abs((longBe - 100) - feeRate * (100 + longBe)) < 1e-10);
assert.ok(Math.abs((100 - shortBe) - feeRate * (100 + shortBe)) < 1e-10);

const base = Date.UTC(2026, 6, 22, 0, 0, 0);
const directions = [1, -1, 1, 1, -1];
const candles = directions.map((direction, index) => ({
  open: 100,
  close: 100 + direction,
  closeTime: base + (index + 1) * 300_000 - 1,
}));
const flip = calculateBtc5mFlipRate(candles, { atMs: base + 5 * 300_000, window: 5 });
assert.deepEqual(flip, {
  timeframe: '5m', window: 5, samples: 5, flips: 3, transitions: 4, rate: 0.75,
});

console.log('shakeout chase shadow rule tests passed');
