import assert from 'node:assert/strict';
import { evaluatePumpLiftEvidence } from '../src/pumpEvalRule.js';

const parent = { avgNetRoe: 0.4 };

const boost = evaluatePumpLiftEvidence({
  parent,
  cohort: {
    closed: 40,
    capturedClosed: 35,
    days: 5,
    positiveDays: 4,
    negativeDays: 1,
    netPnl: 4,
    avgNetRoe: 1.3,
    profitFactor: 1.6,
  },
});
assert.equal(boost.tier, 'BOOST');
assert.equal(boost.basis, 'OOS');
assert.equal(boost.actionable, true);

const degrade = evaluatePumpLiftEvidence({
  parent,
  cohort: {
    closed: 42,
    capturedClosed: 34,
    days: 5,
    positiveDays: 1,
    negativeDays: 4,
    netPnl: -3,
    avgNetRoe: -0.8,
    profitFactor: 0.6,
  },
});
assert.equal(degrade.tier, 'DEGRADE');
assert.equal(degrade.basis, 'OOS');
assert.equal(degrade.actionable, true);

const bootstrap = evaluatePumpLiftEvidence({
  parent,
  cohort: {
    closed: 40,
    capturedClosed: 5,
    days: 5,
    positiveDays: 4,
    negativeDays: 1,
    netPnl: 4,
    avgNetRoe: 1.3,
    profitFactor: 1.6,
  },
});
assert.equal(bootstrap.tier, 'BOOST');
assert.equal(bootstrap.basis, 'BOOTSTRAP');
assert.equal(bootstrap.actionable, false);

const collecting = evaluatePumpLiftEvidence({
  parent,
  cohort: {
    closed: 12,
    capturedClosed: 12,
    days: 2,
    positiveDays: 2,
    negativeDays: 0,
    netPnl: 2,
    avgNetRoe: 2,
    profitFactor: 2,
  },
});
assert.equal(collecting.tier, 'NEUTRAL');
assert.equal(collecting.code, 'PUMP_LIFT_COLLECT');

console.log('pump lift rule tests passed');
