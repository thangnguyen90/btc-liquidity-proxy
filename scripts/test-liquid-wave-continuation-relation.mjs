import assert from 'node:assert/strict';
import {
  advanceLiquidShortEdgeCycle,
  buildLiquidMarketPointCrossoverSnapshots,
  evaluateLiquidWaveContinuationRelation,
} from '../src/liquidWaveContinuationRelation.js';

const warmupCycle = advanceLiquidShortEdgeCycle(null, {
  sampleKey: 'warmup-sample',
  evaluatedAt: Date.parse('2026-07-29T23:55:00Z'),
  longScore: 0,
  shortScore: 0,
});
const recoveredWarmupCycle = advanceLiquidShortEdgeCycle(warmupCycle, {
  sampleKey: 'warmup-sample',
  evaluatedAt: Date.parse('2026-07-29T23:55:00Z'),
  longScore: 27,
  shortScore: 29,
  longScoreSlope: 0,
  shortScoreSlope: 0,
  shortScoreDropFromPeak: 0,
  shortWaveState: 'SHORT_NEUTRAL',
  btcRet15m: 0.1,
});
assert.equal(warmupCycle.phase, 'SHORT_EDGE_NO_DATA');
assert.equal(recoveredWarmupCycle.phase, 'SHORT_EDGE_INTACT');
assert.equal(recoveredWarmupCycle.dataAvailable, true);

function record(tradeId, sampleKey, evaluatedAt, long, short, dynamics) {
  return {
    tradeId,
    loggedAt: new Date(evaluatedAt).toISOString(),
    marketDirection: {
      sampleKey,
      evaluatedAt,
      scores: { long, short },
      scoreDynamics: {
        sampleKey,
        evaluatedAt,
        longScore: long,
        shortScore: short,
        ...dynamics,
      },
    },
  };
}

const start = Date.parse('2026-07-30T00:00:00Z');
const records = [
  record('intact', 's1', start, 20, 60, {
    longScoreSlope: 0,
    shortScoreSlope: 5,
    shortScoreDropFromPeak: 0,
    shortWaveState: 'SHORT_IMPULSE',
    btcRet15m: -0.5,
  }),
  record('decline-one', 's2', start + 5 * 60_000, 25, 55, {
    longScoreSlope: 5,
    shortScoreSlope: -5,
    shortScoreDropFromPeak: 5,
    shortWaveState: 'SHORT_PEAK',
    btcRet15m: 0,
  }),
  record('decay-start', 's3', start + 10 * 60_000, 32, 48, {
    longScoreSlope: 7,
    shortScoreSlope: -7,
    shortScoreDropFromPeak: 12,
    shortWaveState: 'BTC_CRASH_RECLAIM',
    btcRet15m: 0.2,
  }),
  record('after-decay', 's4', start + 15 * 60_000, 60, 40, {
    longScoreSlope: 28,
    shortScoreSlope: -8,
    shortScoreDropFromPeak: 20,
    shortWaveState: 'BTC_CRASH_RECLAIM',
    btcRet15m: 0.4,
  }),
  record('reload', 's5', start + 20 * 60_000, 28, 52, {
    longScoreSlope: -32,
    shortScoreSlope: 12,
    shortScoreDropFromPeak: 8,
    shortWaveState: 'SHORT_RELOAD',
    btcRet15m: -0.2,
  }),
];

const snapshots = buildLiquidMarketPointCrossoverSnapshots(records);
assert.equal(snapshots.get('intact').shortEdgeDecayActive, false);
assert.equal(snapshots.get('decline-one').shortEdgeDecayActive, false);
assert.equal(snapshots.get('decay-start').shortEdgeDecayActive, true);
assert.equal(snapshots.get('decay-start').shortEdgeDecayStartAt, start + 10 * 60_000);
assert.equal(snapshots.get('decay-start').shortEdgeDecayAgeMinutes, 0);
assert.equal(snapshots.get('after-decay').shortEdgeDecayAgeMinutes, 5);
assert.equal(snapshots.get('reload').shortEdgeDecayActive, false);
assert.equal(snapshots.get('reload').shortEdgeDecayStartAt, null);

const intact = evaluateLiquidWaveContinuationRelation({
  side: 'SHORT',
  liquidBtcWaveTier: 'CONTINUATION',
}, snapshots.get('intact'));
assert.equal(intact.liquidWaveContinuationTier, 'SHORT_CONTINUATION_EDGE_INTACT');
assert.equal(intact.liquidWaveContinuationObservationOnly, true);
assert.equal(intact.liquidWaveContinuationAffectsEntry, false);

const afterDecay = evaluateLiquidWaveContinuationRelation({
  side: 'SHORT',
  liquidBtcWaveTier: 'CONTINUATION',
}, snapshots.get('after-decay'));
assert.equal(afterDecay.liquidWaveContinuationTier, 'SHORT_CONTINUATION_AFTER_EDGE_DECAY');
assert.equal(afterDecay.liquidWaveContinuationEdgeDecayAgeMinutes, 5);
assert.equal(afterDecay.liquidWaveContinuationEdgeDecayStartWaveState, 'BTC_CRASH_RECLAIM');

const longSignal = evaluateLiquidWaveContinuationRelation({
  side: 'LONG',
  liquidBtcWaveTier: 'CONTINUATION',
}, snapshots.get('after-decay'));
assert.equal(longSignal.liquidWaveContinuationTier, 'UNRATED');
assert.equal(longSignal.liquidWaveContinuationEligible, false);

const transition = evaluateLiquidWaveContinuationRelation({
  side: 'SHORT',
  liquidBtcWaveTier: 'TRANSITION',
}, snapshots.get('after-decay'));
assert.equal(transition.liquidWaveContinuationTier, 'UNRATED');
assert.equal(transition.liquidWaveContinuationEligible, false);

console.log('liquid wave continuation relation tests passed');
