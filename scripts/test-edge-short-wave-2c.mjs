import assert from 'node:assert/strict';
import {
  EDGE_SHORT_WAVE_2C_VERSION,
  decorateEdgeShortWave2cSnapshots,
  edgeShortWave2cSnapshot,
  edgeShortWave2cStats,
} from '../src/edgeShortWave2c.js';

function baseTrade({
  tier = 'A',
  waveKey = 'SHORT_TRANSITION',
  waveLabel = '2B SHORT · BTC TRANSITION',
  status = 'CLOSED',
  pnl = 1,
  roe = 10,
  createdAt = '2026-08-01T01:00:00.000Z',
} = {}) {
  return {
    edgeShortTier: tier,
    edgeShortWave2bKey: waveKey,
    edgeShortWave2bLabel: waveLabel,
    status,
    pnl,
    roe,
    createdAt,
  };
}

const aShortTransition = edgeShortWave2cSnapshot(baseTrade());
assert.equal(aShortTransition.edgeShortWave2cEligible, true);
assert.equal(aShortTransition.edgeShortWave2cKey, 'A_SHORT_TRANSITION');
assert.equal(aShortTransition.edgeShortWave2cLabel, '2C A · SHORT · BTC TRANSITION');
assert.equal(aShortTransition.edgeShortWave2cTone, 'GOOD');

const bShortDrive = edgeShortWave2cSnapshot(baseTrade({
  tier: 'B',
  waveKey: 'SHORT_ALIGNED_ACTIVE',
  waveLabel: '2B SHORT · BTC DRIVE ALIGNED',
}));
assert.equal(bShortDrive.edgeShortWave2cKey, 'B_SHORT_ALIGNED_ACTIVE');
assert.equal(bShortDrive.edgeShortWave2cTone, 'WATCH');

const aShortExhausted = edgeShortWave2cSnapshot(baseTrade({
  waveKey: 'SHORT_ALIGNED_EXHAUSTED',
  waveLabel: '2B SHORT · BTC EXHAUSTED ALIGNED',
}));
assert.equal(aShortExhausted.edgeShortWave2cTone, 'GOOD');

const aLongDrive = edgeShortWave2cSnapshot(baseTrade({
  waveKey: 'LONG_ALIGNED_ACTIVE',
  waveLabel: '2B LONG · BTC DRIVE ALIGNED',
}));
assert.equal(aLongDrive.edgeShortWave2cTone, 'RISK');

const bLongTransition = edgeShortWave2cSnapshot(baseTrade({
  tier: 'B',
  waveKey: 'LONG_TRANSITION',
  waveLabel: '2B LONG · BTC TRANSITION',
}));
assert.equal(bLongTransition.edgeShortWave2cTone, 'WATCH');

const block = edgeShortWave2cSnapshot(baseTrade({ tier: 'BLOCK' }));
assert.equal(block.edgeShortWave2cEligible, false);
assert.equal(block.edgeShortWave2cKey, 'N_A');

for (const snapshot of [aShortTransition, bShortDrive, aShortExhausted, aLongDrive, bLongTransition, block]) {
  assert.equal(snapshot.edgeShortWave2cVersion, EDGE_SHORT_WAVE_2C_VERSION);
  assert.equal(snapshot.edgeShortWave2cObservationOnly, true);
  assert.equal(snapshot.edgeShortWave2cAffectsEntry, false);
  assert.equal(snapshot.edgeShortWave2cAffectsMargin, false);
  assert.equal(snapshot.edgeShortWave2cAffectsSl, false);
  assert.equal(snapshot.edgeShortWave2cAffectsTp, false);
}

const derived = decorateEdgeShortWave2cSnapshots([baseTrade()])[0];
assert.equal(derived.edgeShortWave2cKey, 'A_SHORT_TRANSITION');
assert.equal(derived.edgeShortWave2cDerived, true);

const statsTrades = [
  { ...baseTrade({ pnl: 2, roe: 20 }), ...aShortTransition, pnl: 2, roe: 20 },
  {
    ...baseTrade({ tier: 'B', pnl: -1, roe: -10, createdAt: '2026-08-01T18:00:00.000Z' }),
    ...edgeShortWave2cSnapshot(baseTrade({ tier: 'B' })),
    pnl: -1,
    roe: -10,
    createdAt: '2026-08-01T18:00:00.000Z',
  },
  {
    ...baseTrade({ status: 'OPEN', pnl: 0.5, roe: 5 }),
    ...aShortTransition,
    status: 'OPEN',
    pnl: 0.5,
  },
  { ...baseTrade({ tier: 'BLOCK', pnl: 99 }), ...block, pnl: 99 },
];
const stats = edgeShortWave2cStats(statsTrades);
const aggregate = stats.aggregate.find((row) => row.cohortKey === 'SHORT_TRANSITION');
assert.equal(aggregate.closed, 2);
assert.equal(aggregate.active, 1);
assert.equal(aggregate.closedPnl, 1);
assert.equal(aggregate.activePnl, 0.5);
assert.equal(aggregate.totalDays, 2);
assert.equal(stats.byTier.length, 2);
assert.equal(stats.byTier.find((row) => row.tier === 'A').closed, 1);
assert.equal(stats.byTier.find((row) => row.tier === 'B').closed, 1);

console.log('Edge Short L2C Tier A/B × BTC wave tests passed: labels, history derive, aggregate/detail stats and guardrails are correct.');
