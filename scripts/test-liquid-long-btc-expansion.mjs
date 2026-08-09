import assert from 'node:assert/strict';
import {
  LIQUID_LONG_BTC_EXPANSION_VERSION,
  evaluateLiquidLongBtcExpansion,
} from '../src/liquidLongBtcExpansion.js';
import { liquidLiveCardKeysOfTrade } from '../src/liquidLiveCardWhitelist.js';

const base = {
  side: 'LONG',
  liquidEvalBtcPhase: 'BTC_UP_STRONG',
  liquidStage3Tier: 'RISK',
  liquidStage2TargetKind: 'LOCAL_SWEEP',
  btcCandlePatternAtEntry: { name: 'BULLISH_MARUBOZU' },
  liquidMarketPointPhaseTier: 'LONG_DOMINANT',
  liquidMarketPointPhaseTradeRelation: 'ALIGNED',
  signalPoint: 75,
  entryPlan: { killZoneCluster: { oneSidedPct: 95 } },
};

const matched = evaluateLiquidLongBtcExpansion(base);
assert.equal(matched.liquidLongBtcExpansionMatched, true);
assert.equal(matched.liquidLongBtcExpansionTier, 'CANDIDATE');
assert.equal(matched.liquidLongBtcExpansionBtcCandleConfirmed, true);
assert.equal(matched.liquidLongBtcExpansionPointAligned, true);
assert.equal(matched.liquidLongBtcExpansionFarRunner, false);
assert.equal(matched.liquidLongBtcExpansionSelected, true);
assert.equal(matched.liquidLongBtcExpansionPrimeTest, true);
assert.equal(matched.liquidLongBtcExpansionLayerTier, 'PRIME_TEST');
assert.equal(matched.liquidLongBtcExpansionSignalPoint, 75);
assert.equal(matched.liquidLongBtcExpansionOneSidedConfirmed, true);
assert.deepEqual(matched.liquidLongBtcExpansionConfirmations, [
  'BTC_CANDLE_CONFIRMED',
  'POINT_ALIGNED',
  'ONE_SIDED_90_CONFIRMED',
]);
assert.equal(matched.liquidLongBtcExpansionObservationOnly, true);
assert.equal(matched.liquidLongBtcExpansionAffectsEntry, false);
assert.equal(matched.liquidLongBtcExpansionAffectsMargin, false);
assert.equal(matched.liquidLongBtcExpansionAffectsSl, false);
assert.equal(matched.liquidLongBtcExpansionAffectsTp, false);
assert.equal(matched.liquidLongBtcExpansionAffectsBinance, false);
assert.equal(matched.liquidLongBtcExpansionVersion, LIQUID_LONG_BTC_EXPANSION_VERSION);
const matchedWhitelistKeys = liquidLiveCardKeysOfTrade({ ...base, ...matched });
assert(matchedWhitelistKeys.includes('long-btc-expansion:CANDIDATE'));
assert(matchedWhitelistKeys.includes('long-btc-expansion:SELECTED'));
assert(matchedWhitelistKeys.includes('long-btc-expansion:PRIME_TEST'));
assert(matchedWhitelistKeys.includes('long-btc-expansion:ONE_SIDED_90'));
assert(matchedWhitelistKeys.includes('long-btc-expansion:BTC_CANDLE_CONFIRMED'));
assert(matchedWhitelistKeys.includes('long-btc-expansion:POINT_ALIGNED'));
assert(!matchedWhitelistKeys.includes('long-btc-expansion:FAR_RUNNER'));

const far = evaluateLiquidLongBtcExpansion({
  ...base,
  liquidStage2TargetKind: 'FAR_ZONE',
  btcCandlePatternAtEntry: { name: 'BEARISH_CANDLE' },
  liquidMarketPointPhaseTier: 'OUTSIDE_DISPERSION',
  liquidMarketPointPhaseTradeRelation: 'NEUTRAL',
});
assert.equal(far.liquidLongBtcExpansionMatched, true);
assert.equal(far.liquidLongBtcExpansionFarRunner, true);
assert.equal(far.liquidLongBtcExpansionBtcCandleConfirmed, false);
assert.equal(far.liquidLongBtcExpansionPointAligned, false);

const selected = evaluateLiquidLongBtcExpansion({ ...base, signalPoint: 85 });
assert.equal(selected.liquidLongBtcExpansionSelected, true);
assert.equal(selected.liquidLongBtcExpansionPrimeTest, false);
assert.equal(selected.liquidLongBtcExpansionLayerTier, 'SELECTED');

for (const [signalPoint, expectedSelected, expectedPrime] of [
  [70, true, true],
  [79.999, true, true],
  [80, true, false],
  [89.999, true, false],
]) {
  const boundary = evaluateLiquidLongBtcExpansion({ ...base, signalPoint });
  assert.equal(boundary.liquidLongBtcExpansionSelected, expectedSelected);
  assert.equal(boundary.liquidLongBtcExpansionPrimeTest, expectedPrime);
}

for (const signalPoint of [69.99, 90, 95]) {
  const outsideSweetSpot = evaluateLiquidLongBtcExpansion({ ...base, signalPoint });
  assert.equal(outsideSweetSpot.liquidLongBtcExpansionMatched, true);
  assert.equal(outsideSweetSpot.liquidLongBtcExpansionSelected, false);
  assert.equal(outsideSweetSpot.liquidLongBtcExpansionPrimeTest, false);
  assert.equal(outsideSweetSpot.liquidLongBtcExpansionLayerTier, 'CANDIDATE');
}

const missingSignalPoint = evaluateLiquidLongBtcExpansion({
  ...base,
  signalPoint: undefined,
});
assert.equal(missingSignalPoint.liquidLongBtcExpansionMatched, true);
assert.equal(missingSignalPoint.liquidLongBtcExpansionSelected, false);
assert.equal(missingSignalPoint.liquidLongBtcExpansionPrimeTest, false);

for (const trade of [
  { ...base, side: 'SHORT' },
  { ...base, liquidEvalBtcPhase: 'BTC_UP_MID' },
  { ...base, liquidStage3Tier: 'WATCH' },
  { ...base, liquidStage2TargetKind: 'MAIN_ZONE' },
]) {
  assert.equal(evaluateLiquidLongBtcExpansion(trade).liquidLongBtcExpansionMatched, false);
}

const legacy = evaluateLiquidLongBtcExpansion({ side: 'LONG' });
assert.equal(legacy.liquidLongBtcExpansionMatched, false);
assert.deepEqual(legacy.liquidLongBtcExpansionMissingFields, [
  'liquidEvalBtcPhase',
  'liquidStage3Tier',
  'liquidStage2TargetKind',
]);

console.log('Liquid LONG BTC expansion observe-only label tests passed.');
