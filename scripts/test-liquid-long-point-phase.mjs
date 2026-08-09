import assert from 'node:assert/strict';
import { evaluateLiquidLongPointPhase } from '../src/liquidLongPointPhase.js';

const trade = {
  side: 'LONG',
  liquidLongBtcAbsorptionMatched: true,
};

assert.equal(evaluateLiquidLongPointPhase({ ...trade, side: 'SHORT' }, {}).liquidLongPointPhaseTier, 'UNRATED');
assert.equal(evaluateLiquidLongPointPhase(trade, {}).liquidLongPointPhaseTier, 'NO_DATA');

assert.equal(evaluateLiquidLongPointPhase(trade, {
  pointLongScore: 20,
  pointShortScore: 50,
  shortEdgeShortScoreSlope: 4,
  shortEdgeWaveState: 'SHORT_BUILDUP',
}).liquidLongPointPhaseTier, 'SHORT_PRESSURE');

assert.equal(evaluateLiquidLongPointPhase(trade, {
  pointLongScore: 28,
  pointShortScore: 35,
  shortEdgeShortScoreSlope: -5,
  shortEdgeLongScoreSlope: 3,
  shortEdgeShortScoreDropFromPeak: 12,
}).liquidLongPointPhaseTier, 'SHORT_FADE');

assert.equal(evaluateLiquidLongPointPhase(trade, {
  pointLongScore: 24,
  pointShortScore: 30,
}).liquidLongPointPhaseTier, 'BALANCED');

assert.equal(evaluateLiquidLongPointPhase(trade, {
  pointLongScore: 46,
  pointShortScore: 31,
  pointDominantSamples: 2,
}).liquidLongPointPhaseTier, 'LONG_TAKEOVER');

assert.equal(evaluateLiquidLongPointPhase(trade, {
  pointLongScore: 25,
  pointShortScore: 34,
  shortEdgeWaveState: 'SHORT_RELOAD',
}).liquidLongPointPhaseTier, 'SHORT_RELOAD');

assert.equal(evaluateLiquidLongPointPhase(trade, {
  pointLongScore: 42,
  pointShortScore: 36,
}).liquidLongPointPhaseTier, 'TRANSITION');

const closed = evaluateLiquidLongPointPhase({ ...trade, status: 'CLOSED', netPnl: 100 }, {
  pointLongScore: 24,
  pointShortScore: 30,
});
const open = evaluateLiquidLongPointPhase({ ...trade, status: 'OPEN', netPnl: -100 }, {
  pointLongScore: 24,
  pointShortScore: 30,
});
assert.equal(closed.liquidLongPointPhaseTier, open.liquidLongPointPhaseTier);

console.log('liquid long point phase tests passed');
