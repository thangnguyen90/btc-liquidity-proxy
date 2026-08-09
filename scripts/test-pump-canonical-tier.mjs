import assert from 'node:assert/strict';
import {
  PUMP_CANONICAL_RUNTIME_VALIDATED,
  PUMP_CANONICAL_TIER_VERSION,
  buildPumpCanonicalModel,
  decoratePumpCanonicalTier,
  evaluatePumpCanonicalTier,
  mergePumpCanonicalTierStats,
  pumpCanonicalTierStats,
} from '../src/pumpCanonicalTier.js';

const base = {
  source: 'pump-92',
  side: 'LONG',
  status: 'CLOSED',
  marginUsdt: 1,
  leverage: 10,
  pnl: 0.12,
  roe: 12,
  pumpSignalType: 'EMA_PULLBACK',
  pumpSignalTimeframe: '15m',
  pumpSignalFactors: { volRatio: 3 },
  btcHealth: { btcTrendDir: 'UP', btcTrendScore: 55 },
  btcCorr: 0.2,
};

const history = [];
for (let day = 20; day <= 24; day += 1) {
  for (let index = 0; index < 8; index += 1) {
    history.push({
      ...base,
      id: `${day}-${index}`,
      createdAt: `2026-07-${day}T${String(index).padStart(2, '0')}:00:00.000Z`,
    });
  }
}

const model = buildPumpCanonicalModel(history, '2026-07-25');
const rule = evaluatePumpCanonicalTier({
  ...base,
  status: 'OPEN',
  createdAt: '2026-07-25T01:00:00.000Z',
}, model, { snapshot: true });

assert.equal(PUMP_CANONICAL_RUNTIME_VALIDATED, false);
assert.equal(rule.version, PUMP_CANONICAL_TIER_VERSION);
assert.equal(rule.candidateTier, 'A');
assert.equal(rule.tier, 'WATCH');
assert.equal(rule.label, 'PUMP V2 · COLLECT');
assert.equal(rule.runtimeAllow, true);
assert.equal(rule.marginUsdt, null);
assert.equal(rule.observationOnly, true);
assert.equal(rule.affectsEntry, false);
assert.equal(rule.affectsMargin, false);

const decorated = decoratePumpCanonicalTier({
  ...base,
  status: 'OPEN',
  pnl: 0.05,
  createdAt: '2026-07-25T01:00:00.000Z',
}, model);
assert.equal(decorated.pumpCanonicalTier, 'WATCH');
assert.equal(decorated.pumpCanonicalCandidateTier, 'A');
assert.equal(decorated.pumpCanonicalDerived, true);

const stats = pumpCanonicalTierStats([
  {
    ...base,
    createdAt: '2026-07-25T02:00:00.000Z',
  },
  {
    ...base,
    status: 'OPEN',
    pnl: -0.03,
    createdAt: '2026-07-25T03:00:00.000Z',
  },
], model);
const collect = stats.find((row) => row.tier === 'WATCH');
assert.equal(collect.total, 2);
assert.equal(collect.closed, 1);
assert.equal(collect.active, 1);
assert.equal(collect.open, 1);
assert.equal(collect.pending, 0);
assert.ok(collect.realizedPnl > 0);
assert.equal(collect.unrealizedPnl, -0.03);

const merged = mergePumpCanonicalTierStats(
  pumpCanonicalTierStats([history[0]], model),
  pumpCanonicalTierStats([{
    ...base,
    status: 'PENDING',
    pnl: 0,
    createdAt: '2026-07-25T04:00:00.000Z',
  }], model),
).find((row) => row.tier === 'WATCH');
assert.equal(merged.total, 2);
assert.equal(merged.closed, 1);
assert.equal(merged.active, 1);
assert.equal(merged.pending, 1);

assert.equal(evaluatePumpCanonicalTier({
  ...base,
  source: 'emasq-15m-breakout-90',
}, model), null);

console.log('Pump V2 COLLECT observe-only tier: OK');
