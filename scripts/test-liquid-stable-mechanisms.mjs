import assert from 'node:assert/strict';
import {
  LIQUID_STABLE_MECHANISM_VERSION,
  evaluateLiquidStableMechanism,
  liquidStableMechanismRules,
} from '../src/liquidStableMechanism.js';

function sample({
  side,
  corr,
  direction,
  score,
  pct24h,
  rsi4h,
}) {
  return {
    signalType: 'LIQUID_KILL_ZONE',
    signalTimeframe: '15m',
    side,
    heavySide: side === 'LONG' ? 'above' : 'below',
    btcCorr: corr,
    btcHealth: {
      btcTrendDir: direction,
      btcTrendScore: score,
      pct24h,
      rsi4h,
    },
  };
}

const cases = [
  ['LONG_SOFT_CORR_REBOUND', sample({ side: 'LONG', corr: 0.4, direction: 'down', score: 30, pct24h: 0, rsi4h: 45 })],
  ['LONG_DECOUPLED_RESET', sample({ side: 'LONG', corr: 0.2, direction: 'up', score: 30, pct24h: -0.4, rsi4h: 45 })],
  ['SHORT_CORR_FADE_CORE', sample({ side: 'SHORT', corr: 0.7, direction: 'up', score: 30, pct24h: 0, rsi4h: 45 })],
  ['SHORT_FAILED_BOUNCE', sample({ side: 'SHORT', corr: 0.4, direction: 'down', score: 30, pct24h: 0.4, rsi4h: 45 })],
  ['SHORT_BEAR_DRIVE', sample({ side: 'SHORT', corr: 0.7, direction: 'down', score: 50, pct24h: -0.4, rsi4h: 54 })],
  ['SHORT_DECOUPLED_HOT_FADE', sample({ side: 'SHORT', corr: 0.2, direction: 'up', score: 50, pct24h: 0.4, rsi4h: 62 })],
];

assert.equal(liquidStableMechanismRules().length, 6);
for (const [expectedCode, trade] of cases) {
  const result = evaluateLiquidStableMechanism(trade);
  assert.equal(result.liquidStableMechanismMatched, true, expectedCode);
  assert.equal(result.liquidStableMechanismCode, expectedCode);
  assert.equal(result.liquidStableMechanismVersion, LIQUID_STABLE_MECHANISM_VERSION);
  assert.equal(result.liquidStableMechanismObservationOnly, true);
  assert.equal(result.liquidStableMechanismAffectsEntry, false);
  assert.equal(result.liquidStableMechanismAffectsMargin, false);
  assert.equal(result.liquidStableMechanismAffectsSl, false);
  assert.equal(result.liquidStableMechanismAffectsTp, false);
  assert.equal(result.liquidStableMechanismAffectsBinance, false);
}

const unrelated = evaluateLiquidStableMechanism(sample({
  side: 'LONG',
  corr: 0.8,
  direction: 'up',
  score: 80,
  pct24h: 2,
  rsi4h: 70,
}));
assert.equal(unrelated.liquidStableMechanismMatched, false);
assert.equal(unrelated.liquidStableMechanismTier, 'UNRATED');

console.log('liquid stable mechanism tests passed');
