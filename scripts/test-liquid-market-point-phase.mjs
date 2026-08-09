import assert from 'node:assert/strict';
import { buildLiquidMarketPointCrossoverSnapshots } from '../src/liquidWaveContinuationRelation.js';
import {
  LIQUID_MARKET_POINT_PHASE_VERSION,
  advanceLiquidMarketPointState,
  evaluateLiquidMarketPointPhase,
} from '../src/liquidMarketPointPhase.js';

const base = Date.parse('2026-07-30T00:00:00.000Z');
const record = (tradeId, minutes, longScore, shortScore, label = 'MARKET_DISPERSION') => ({
  tradeId,
  loggedAt: new Date(base + minutes * 60_000).toISOString(),
  marketDirection: {
    sampleKey: String(base + minutes * 60_000),
    evaluatedAt: base + minutes * 60_000,
    label,
    scores: { long: longScore, short: shortScore },
    scoreDynamics: {
      longScore,
      shortScore,
      longScoreSlope: 0,
      shortScoreSlope: 0,
      shortScoreDropFromPeak: 0,
      shortWaveState: 'SHORT_NEUTRAL',
      btcRet15m: 0,
    },
  },
});

const snapshots = buildLiquidMarketPointCrossoverSnapshots([
  record('short-hold', 0, 20, 40),
  record('cross-long', 5, 45, 30),
  record('post-long', 15, 46, 29),
  record('long-hold', 50, 50, 25),
  record('tie', 55, 31, 31),
  record('outside', 60, 52, 20, 'LONG_FAVORED'),
]);

const evaluate = (tradeId, side = 'LONG') => evaluateLiquidMarketPointPhase(
  { id: tradeId, side },
  snapshots.get(tradeId),
);

assert.equal(evaluate('short-hold', 'SHORT').liquidMarketPointPhaseTier, 'SHORT_DOMINANT');

const crossLong = evaluate('cross-long', 'LONG');
assert.equal(crossLong.liquidMarketPointPhaseTier, 'CROSS_TO_LONG');
assert.equal(crossLong.liquidMarketPointPhaseTradeRelation, 'ALIGNED');
assert.equal(crossLong.liquidMarketPointPhaseMarketLabel, 'MARKET_DISPERSION');

assert.equal(evaluate('post-long', 'SHORT').liquidMarketPointPhaseTier, 'POST_CROSS_TO_LONG_30M');
assert.equal(evaluate('post-long', 'SHORT').liquidMarketPointPhaseTradeRelation, 'COUNTER');
assert.equal(evaluate('long-hold').liquidMarketPointPhaseTier, 'LONG_DOMINANT');
assert.equal(evaluate('tie').liquidMarketPointPhaseTier, 'POINT_TIE');

const outside = evaluate('outside');
assert.equal(outside.liquidMarketPointPhaseEligible, false);
assert.equal(outside.liquidMarketPointPhaseTier, 'OUTSIDE_DISPERSION');
assert.equal(outside.liquidMarketPointPhaseVersion, LIQUID_MARKET_POINT_PHASE_VERSION);
assert.equal(outside.liquidMarketPointPhaseObservationOnly, true);
assert.equal(outside.liquidMarketPointPhaseAffectsEntry, false);

let liveState = advanceLiquidMarketPointState(null, {
  sampleKey: 'live-1',
  evaluatedAt: base,
  longScore: 20,
  shortScore: 40,
  marketLabel: 'MARKET_DISPERSION',
});
liveState = advanceLiquidMarketPointState(liveState, {
  sampleKey: 'live-2',
  evaluatedAt: base + 5 * 60_000,
  longScore: 45,
  shortScore: 30,
  marketLabel: 'MARKET_DISPERSION',
});
assert.equal(liveState.pointCrossFrom, 'SHORT');
assert.equal(liveState.pointCrossTo, 'LONG');
assert.equal(liveState.pointCrossAgeMinutes, 0);
assert.equal(
  evaluateLiquidMarketPointPhase({ side: 'LONG' }, liveState).liquidMarketPointPhaseTier,
  'CROSS_TO_LONG',
);

console.log('Liquid Market Point Phase tests passed: causal cross, post-cross, dominance and dispersion scope.');
