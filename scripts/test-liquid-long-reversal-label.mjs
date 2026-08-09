import assert from 'node:assert/strict';
import {
  LIQUID_LONG_REVERSAL_VERSION,
  evaluateLiquidLongReversal,
} from '../src/liquidLongReversalLabel.js';

function baseTrade(overrides = {}) {
  return {
    side: 'LONG',
    candlePatternAtEntry: { name: 'BEARISH_CANDLE' },
    sweepTargetPrice: 95,
    entryPlan: {
      killZoneCluster: {
        exhaustionZone: { low: 94, high: 96 },
      },
    },
    btcHealth: {
      pct6h: -0.3,
      btcTrendScore: 42,
    },
    ...overrides,
  };
}

const both = evaluateLiquidLongReversal(baseTrade());
assert.equal(both.liquidLongReversalTier, 'CORE_AND_TEST');
assert.equal(both.liquidLongCapitulationMatched, true);
assert.equal(both.liquidLongControlledSellMatched, true);
assert.equal(both.liquidLongReversalLabels.length, 2);
assert.equal(both.liquidLongReversalVersion, LIQUID_LONG_REVERSAL_VERSION);
assert.equal(both.liquidLongReversalObservationOnly, true);
assert.equal(both.liquidLongReversalAffectsEntry, false);
assert.equal(both.liquidLongReversalAffectsMargin, false);

const core = evaluateLiquidLongReversal(baseTrade({
  btcHealth: { pct6h: 0.2, btcTrendScore: 55 },
}));
assert.equal(core.liquidLongReversalTier, 'CORE');
assert.equal(core.liquidLongCapitulationMatched, true);
assert.equal(core.liquidLongControlledSellMatched, false);

const test = evaluateLiquidLongReversal(baseTrade({
  candlePatternAtEntry: { name: 'DOJI' },
}));
assert.equal(test.liquidLongReversalTier, 'TEST');
assert.equal(test.liquidLongCapitulationMatched, false);
assert.equal(test.liquidLongControlledSellMatched, true);

const decoupled = evaluateLiquidLongReversal(baseTrade({
  candlePatternAtEntry: { name: 'DOJI' },
  btcCorr: -0.31,
  btcCandlePatternAtEntry: { name: 'BULLISH_CANDLE' },
  btcHealth: { pct6h: 0.4, btcTrendScore: 55, emaTrend1h: 'below' },
}));
assert.equal(decoupled.liquidLongReversalTier, 'DECOUPLED');
assert.equal(decoupled.liquidLongDecoupledReboundMatched, true);
assert.equal(decoupled.liquidLongBtcAbsorptionMatched, false);

const absorption = evaluateLiquidLongReversal(baseTrade({
  candlePatternAtEntry: { name: 'DOJI' },
  btcCorr: 0.2,
  btcCandlePatternAtEntry: { name: 'HAMMER' },
  btcHealth: { pct6h: 0.1, btcTrendScore: 55, emaTrend1h: 'above' },
}));
assert.equal(absorption.liquidLongReversalTier, 'ABSORPTION');
assert.equal(absorption.liquidLongDecoupledReboundMatched, false);
assert.equal(absorption.liquidLongBtcAbsorptionMatched, true);

const multiEdge = evaluateLiquidLongReversal(baseTrade({
  candlePatternAtEntry: { name: 'DOJI' },
  btcCorr: -0.31,
  btcCandlePatternAtEntry: { name: 'BULLISH_PIN_BAR' },
  btcHealth: { pct6h: 0.1, btcTrendScore: 55, emaTrend1h: 'below' },
}));
assert.equal(multiEdge.liquidLongReversalTier, 'MULTI_EDGE');
assert.equal(multiEdge.liquidLongDecoupledReboundMatched, true);
assert.equal(multiEdge.liquidLongBtcAbsorptionMatched, true);
assert.equal(multiEdge.liquidLongReversalLabels.length, 2);

const noEdge = evaluateLiquidLongReversal(baseTrade({
  candlePatternAtEntry: { name: 'DOJI' },
  btcHealth: { pct6h: 0.2, btcTrendScore: 55 },
}));
assert.equal(noEdge.liquidLongReversalTier, 'NO_EDGE');

const short = evaluateLiquidLongReversal({ ...baseTrade(), side: 'SHORT' });
assert.equal(short.liquidLongReversalTier, 'UNRATED');
assert.equal(short.liquidLongReversalEligible, false);

const outcomeA = evaluateLiquidLongReversal({ ...baseTrade(), status: 'CLOSED', netPnl: 99 });
const outcomeB = evaluateLiquidLongReversal({ ...baseTrade(), status: 'OPEN', netPnl: -99 });
assert.equal(outcomeA.liquidLongReversalTier, outcomeB.liquidLongReversalTier);
assert.deepEqual(outcomeA.liquidLongReversalLabels, outcomeB.liquidLongReversalLabels);

console.log('liquid LONG reversal label tests passed');
