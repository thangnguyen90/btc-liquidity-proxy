import assert from 'node:assert/strict';
import {
  LIQUID_EDGE_ACTIVE_POINT_VERSION,
  evaluateLiquidEdgeActivePointLabel,
} from '../src/liquidEdgeActivePointLabel.js';

const base = {
  side: 'SHORT',
  liquidStage3Tier: 'GOOD_PLUS',
  liquidStage4Tier: 'ACTIVE',
};

const point = (shortEdgeWaveState) => ({
  shortEdgeWaveState,
  pointLongScore: 35,
  pointShortScore: 60,
  shortEdgeShortScoreSlope: 10,
  shortEdgeLongScoreSlope: -5,
  shortEdgeShortScoreDropFromPeak: 0,
  shortEdgeBtcRet15m: -0.8,
});

for (const state of ['SHORT_NEUTRAL', 'SHORT_BUILDUP', 'SHORT_IMPULSE']) {
  assert.equal(evaluateLiquidEdgeActivePointLabel(base, point(state)).liquidEdgeActivePointTier, 'GOOD');
}
for (const state of ['BTC_CRASH_RECLAIM', 'SHORT_PEAK', 'SHORT_RELOAD']) {
  assert.equal(evaluateLiquidEdgeActivePointLabel(base, point(state)).liquidEdgeActivePointTier, 'WATCH');
}
assert.equal(evaluateLiquidEdgeActivePointLabel(base, point('SHORT_FADE')).liquidEdgeActivePointTier, 'RISK');
assert.equal(evaluateLiquidEdgeActivePointLabel(base, null).liquidEdgeActivePointTier, 'NO_DATA');
assert.equal(evaluateLiquidEdgeActivePointLabel(base, point('SHORT_NO_DATA')).liquidEdgeActivePointTier, 'NO_DATA');

const unrated = evaluateLiquidEdgeActivePointLabel({ ...base, side: 'LONG' }, point('SHORT_BUILDUP'));
assert.equal(unrated.liquidEdgeActivePointTier, 'UNRATED');
assert.equal(unrated.liquidEdgeActivePointEligible, false);

const labeled = evaluateLiquidEdgeActivePointLabel(base, point('SHORT_IMPULSE'));
assert.equal(labeled.liquidEdgeActivePointGap, 25);
assert.equal(labeled.liquidEdgeActivePointVersion, LIQUID_EDGE_ACTIVE_POINT_VERSION);
assert.equal(labeled.liquidEdgeActivePointObservationOnly, true);
assert.equal(labeled.liquidEdgeActivePointAffectsEntry, false);
assert.equal(labeled.liquidEdgeActivePointAffectsMargin, false);
assert.equal(labeled.liquidEdgeActivePointAffectsSl, false);
assert.equal(labeled.liquidEdgeActivePointAffectsTp, false);

console.log('liquid edge-active point label tests passed');
