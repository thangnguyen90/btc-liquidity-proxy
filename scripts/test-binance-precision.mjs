import assert from 'node:assert/strict';
import {
  BINANCE_SCIENTIFIC_STEP_PRECISION_VERSION,
  decimalsFromStep,
} from '../src/binancePrecision.js';

assert.equal(BINANCE_SCIENTIFIC_STEP_PRECISION_VERSION, 'BINANCE_SCIENTIFIC_STEP_PRECISION_V1_20260810');
assert.equal(decimalsFromStep(1e-8), 8);
assert.equal(decimalsFromStep(1e-7), 7);
assert.equal(decimalsFromStep(1.25e-7), 9);
assert.equal(decimalsFromStep(0.000001), 6);
assert.equal(decimalsFromStep('0.01000000'), 2);
assert.equal(decimalsFromStep(1), 0);
assert.equal(decimalsFromStep(0), 0);
assert.equal(decimalsFromStep('bad'), 0);

const smallPrice = (Math.round(0.0000109592 / 1e-8) * 1e-8)
  .toFixed(decimalsFromStep(1e-8))
  .replace(/\.?0+$/, '');
assert.equal(smallPrice, '0.00001096');

console.log('Binance scientific-step precision tests passed');
