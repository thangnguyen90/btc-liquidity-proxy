import assert from 'node:assert/strict';
import {
  LIQUID_BTC_WAVE_STATE_VERSION,
  evaluateLiquidBtcWaveState,
} from '../src/liquidBtcWaveState.js';
import { LIQUID_SCAN_STAGE_3_VERSION } from '../src/liquidScanEvalRule.js';

function trade({
  direction = 'down',
  emaTrend1h = direction === 'down' ? 'below' : 'above',
  marketRegime = direction === 'down' ? 'SIDEWAY_DOWN' : 'SIDEWAY_UP',
  trendScore = 60,
  pct6h = direction === 'down' ? -0.6 : 0.6,
  rsi1h = direction === 'down' ? 45 : 60,
  obvTrend = direction === 'down' ? 'falling' : 'rising',
  stage3Tier = 'GOOD_PLUS',
} = {}) {
  return {
    side: 'SHORT',
    liquidStage3Tier: stage3Tier,
    liquidStage3Code: stage3Tier === 'GOOD_PLUS' ? 'GOOD+' : stage3Tier,
    liquidStage3Version: LIQUID_SCAN_STAGE_3_VERSION,
    btcHealth: {
      btcTrendDir: direction,
      emaTrend1h,
      marketRegime,
      btcTrendScore: trendScore,
      pct6h,
      pct24h: pct6h,
      rsi1h,
      obvTrend,
    },
    btcCandlePatternAtEntry: {
      name: 'NEUTRAL_CANDLE',
      direction: 'NEUTRAL',
    },
  };
}

const continuationDown = evaluateLiquidBtcWaveState(trade());
assert.equal(continuationDown.liquidBtcWaveTier, 'CONTINUATION');
assert.equal(continuationDown.liquidBtcWaveVersion, LIQUID_BTC_WAVE_STATE_VERSION);
assert.equal(continuationDown.liquidBtcWaveMomentum, 'ALIGNED');
assert.equal(continuationDown.liquidBtcWaveFlow, 'CONFIRMED');
assert.equal(continuationDown.liquidBtcWaveObservationOnly, true);
assert.equal(continuationDown.liquidBtcWaveAffectsEntry, false);
assert.equal(continuationDown.liquidBtcWaveAffectsMargin, false);

const exhaustedDown = evaluateLiquidBtcWaveState(trade({
  pct6h: -0.1,
  rsi1h: 34,
}));
assert.equal(exhaustedDown.liquidBtcWaveTier, 'EXHAUSTED');
assert.ok(exhaustedDown.liquidBtcWaveExhaustionSignals.includes('DOWN_MOMENTUM_STALLED'));

const transition = evaluateLiquidBtcWaveState(trade({
  emaTrend1h: 'above',
  marketRegime: 'CHOP',
  pct6h: 0.1,
}));
assert.equal(transition.liquidBtcWaveTier, 'TRANSITION');

const exhaustedUp = evaluateLiquidBtcWaveState(trade({
  direction: 'up',
  pct6h: 0.1,
  rsi1h: 65,
  obvTrend: 'falling',
}));
assert.equal(exhaustedUp.liquidBtcWaveTier, 'EXHAUSTED');
assert.equal(exhaustedUp.liquidBtcWaveFlow, 'DIVERGENT');

const continuationUp = evaluateLiquidBtcWaveState(trade({ direction: 'up' }));
assert.equal(continuationUp.liquidBtcWaveTier, 'CONTINUATION');

const noDataTrade = trade();
delete noDataTrade.btcHealth.rsi1h;
assert.equal(evaluateLiquidBtcWaveState(noDataTrade).liquidBtcWaveTier, 'NO_DATA');
assert.ok(
  evaluateLiquidBtcWaveState(noDataTrade).liquidBtcWaveMissingFields.includes('rsi1h'),
);

const unrated = evaluateLiquidBtcWaveState(trade({ stage3Tier: 'WATCH' }));
assert.equal(unrated.liquidBtcWaveTier, 'UNRATED');
assert.equal(unrated.liquidBtcWaveEligible, false);

const outcomeA = evaluateLiquidBtcWaveState({ ...trade(), status: 'CLOSED', netPnl: 10 });
const outcomeB = evaluateLiquidBtcWaveState({ ...trade(), status: 'OPEN', netPnl: -10 });
assert.equal(outcomeA.liquidBtcWaveTier, outcomeB.liquidBtcWaveTier);

console.log('liquid BTC wave-state tests passed');
