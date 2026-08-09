import assert from 'node:assert/strict';
import { evaluatePumpComboSelectorEvidence } from '../src/pumpComboSelectorRule.js';

const windowRow = (name, {
  exactClosed,
  supportClosed = exactClosed,
  mean,
  pf,
  slRate = 0.2,
  se = 0.5,
  exactDays = 3,
  exactPositiveDays = mean > 0 ? 2 : 0,
  exactNegativeDays = mean < 0 ? 2 : 0,
}) => ({
  name,
  exactClosed,
  supportClosed,
  posteriorMeanRoe: mean,
  profitFactor: pf,
  slRate,
  standardError: se,
  exactDays,
  exactPositiveDays,
  exactNegativeDays,
});

const core = evaluatePumpComboSelectorEvidence({
  windows: [
    windowRow('1d', { exactClosed: 6, mean: 2.4, pf: 1.5 }),
    windowRow('3d', { exactClosed: 18, mean: 2.0, pf: 1.4 }),
    windowRow('7d', { exactClosed: 32, mean: 1.8, pf: 1.35 }),
  ],
  exactClosed: 32,
  candleTier: 'GOOD',
  snapshot: true,
});
assert.equal(core.tier, 'CORE');
assert.equal(core.basis, 'SNAPSHOT');
assert.equal(core.affectsEntry, false);

const probe = evaluatePumpComboSelectorEvidence({
  windows: [
    windowRow('1d', { exactClosed: 2, mean: 2.2, pf: 1.3 }),
    windowRow('3d', { exactClosed: 4, mean: 1.8, pf: 1.25 }),
    windowRow('7d', { exactClosed: 7, mean: 1.5, pf: 1.2, se: 1.1 }),
  ],
  exactClosed: 7,
  candleTier: 'WATCH',
});
assert.equal(probe.tier, 'PROBE');
assert.equal(probe.basis, 'BACKFILL');

const avoid = evaluatePumpComboSelectorEvidence({
  windows: [
    windowRow('1d', { exactClosed: 4, mean: -2.5, pf: 0.5, slRate: 0.6 }),
    windowRow('3d', { exactClosed: 9, mean: -1.8, pf: 0.65, slRate: 0.55 }),
    windowRow('7d', { exactClosed: 16, mean: -1.3, pf: 0.7, slRate: 0.5 }),
  ],
  exactClosed: 16,
  candleTier: 'RISK',
});
assert.equal(avoid.tier, 'AVOID');

const oneDayNegative = evaluatePumpComboSelectorEvidence({
  windows: [
    windowRow('1d', {
      exactClosed: 17,
      mean: -6,
      pf: 0.5,
      slRate: 0.6,
      exactDays: 1,
      exactPositiveDays: 0,
      exactNegativeDays: 1,
    }),
    windowRow('3d', {
      exactClosed: 17,
      mean: -6,
      pf: 0.5,
      slRate: 0.6,
      exactDays: 1,
      exactPositiveDays: 0,
      exactNegativeDays: 1,
    }),
    windowRow('7d', {
      exactClosed: 17,
      mean: -6,
      pf: 0.5,
      slRate: 0.6,
      exactDays: 1,
      exactPositiveDays: 0,
      exactNegativeDays: 1,
    }),
  ],
  exactClosed: 17,
  candleTier: 'RISK',
});
assert.equal(oneDayNegative.tier, 'WATCH');
assert.equal(oneDayNegative.code, 'PUMP_SELECTOR_COLLECT_DAYS');

const watch = evaluatePumpComboSelectorEvidence({
  windows: [
    windowRow('1d', { exactClosed: 3, mean: -0.2, pf: 0.9 }),
    windowRow('3d', { exactClosed: 5, mean: 0.3, pf: 1 }),
    windowRow('7d', { exactClosed: 8, mean: 0.1, pf: 1 }),
  ],
  exactClosed: 8,
  candleTier: 'WATCH',
});
assert.equal(watch.tier, 'WATCH');

console.log('pump combo selector rule tests passed');
