import assert from 'node:assert/strict';
import {
  LIQUID_STABLE_MECHANISM_FILTER_ALL,
  matchesLiquidStableMechanismFilter,
  normalizeLiquidStableMechanismFilter,
} from '../public/liquid-stable-mechanism-filter.js';

assert.equal(normalizeLiquidStableMechanismFilter(), LIQUID_STABLE_MECHANISM_FILTER_ALL);
assert.equal(normalizeLiquidStableMechanismFilter('ALL'), LIQUID_STABLE_MECHANISM_FILTER_ALL);
assert.equal(normalizeLiquidStableMechanismFilter(' long_decoupled_reset '), 'LONG_DECOUPLED_RESET');

const matched = {
  liquidStableMechanismMatched: true,
  liquidStableMechanismCode: 'LONG_DECOUPLED_RESET',
};
assert.equal(matchesLiquidStableMechanismFilter(matched, 'all'), true);
assert.equal(matchesLiquidStableMechanismFilter(matched, 'LONG_DECOUPLED_RESET'), true);
assert.equal(matchesLiquidStableMechanismFilter(matched, 'LONG_SOFT_CORR_REBOUND'), false);
assert.equal(matchesLiquidStableMechanismFilter({}, 'LONG_DECOUPLED_RESET'), false);
assert.equal(matchesLiquidStableMechanismFilter({
  liquidStableMechanismMatched: false,
  liquidStableMechanismCode: 'LONG_DECOUPLED_RESET',
}, 'LONG_DECOUPLED_RESET'), false);

console.log('liquid stable mechanism filter tests passed');
