import assert from 'node:assert/strict';
import {
  SHAKEOUT_CHASE_SHORT_TIER_VERSION,
  evaluateShakeoutChaseShortTier,
} from '../src/shakeoutChaseShortTier.js';

const scoreA = evaluateShakeoutChaseShortTier({
  variant: 'CHASE',
  side: 'SHORT',
  score: 65,
  btcPhase: 'BTC_UP_MID',
});
assert.equal(scoreA.version, SHAKEOUT_CHASE_SHORT_TIER_VERSION);
assert.equal(scoreA.applies, true);
assert.equal(scoreA.tier, 'A');
assert.equal(scoreA.marginUsdt, 10);
assert.equal(scoreA.code, 'CHASE_SHORT_A_SCORE_65_PLUS');

const downMidA = evaluateShakeoutChaseShortTier({
  variant: 'chase',
  side: 'short',
  score: 59,
  btcPhase: 'BTC_DOWN_MID',
});
assert.equal(downMidA.tier, 'A');
assert.equal(downMidA.marginUsdt, 10);
assert.equal(downMidA.code, 'CHASE_SHORT_A_BTC_DOWN_MID_SCORE_55_59');

const score60IsB = evaluateShakeoutChaseShortTier({
  variant: 'CHASE',
  side: 'SHORT',
  score: 60,
  btcPhase: 'BTC_DOWN_MID',
});
assert.equal(score60IsB.tier, 'B_TEST');
assert.equal(score60IsB.marginUsdt, 5);

const remainderB = evaluateShakeoutChaseShortTier({
  variant: 'CHASE',
  side: 'SHORT',
  score: 59,
  btcPhase: 'BTC_UP_MID',
  tierBMarginUsdt: 7,
});
assert.equal(remainderB.tier, 'B_TEST');
assert.equal(remainderB.marginUsdt, 7);

assert.equal(evaluateShakeoutChaseShortTier({
  variant: 'CHASE',
  side: 'LONG',
  score: 70,
  btcPhase: 'BTC_DOWN_MID',
}).applies, false);

assert.equal(evaluateShakeoutChaseShortTier({
  variant: 'MARKET',
  side: 'SHORT',
  score: 70,
  btcPhase: 'BTC_DOWN_MID',
}).applies, false);

console.log('Shakeout CHASE SHORT tier tests passed: A=$10 and B/TEST=$5.');
