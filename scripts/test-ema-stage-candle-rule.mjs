import assert from 'node:assert/strict';
import {
  EMA_STAGE_CANDLE_RULE_VERSION,
  evaluateEmaStageCandle,
} from '../src/emaStageCandleRule.js';

const candle = (name) => ({ name });
const evaluate = (input) => evaluateEmaStageCandle({
  timeframe: '5m',
  side: 'LONG',
  symbolCandle: candle('Doji'),
  btcCandle: candle('Doji'),
  ...input,
});

const preBreakout = evaluate({
  stage: 'PRE_BREAKOUT',
  symbolCandle: candle('Bullish Candle'),
  btcCandle: candle('Bullish Candle'),
});
assert.equal(preBreakout.tier, 'RISK');
assert.match(preBreakout.code, /^PRE_ROUTER_/);

const preBreakdown = evaluate({
  stage: 'PRE_BREAKDOWN',
  side: 'SHORT',
  timeframe: '15m',
  symbolCandle: candle('Bearish Candle'),
  btcCandle: candle('Bullish Candle'),
});
assert.equal(preBreakdown.tier, 'RISK');
assert.match(preBreakdown.code, /^PRE_ROUTER_/);

const breakout = evaluate({
  stage: 'BREAKOUT',
  symbolCandle: candle('Bullish Candle'),
  btcCandle: candle('Bearish Candle'),
});
assert.equal(breakout.tier, 'RISK');

const breakdown = evaluate({
  stage: 'BREAKDOWN',
  side: 'SHORT',
  timeframe: '15m',
  symbolCandle: candle('Bearish Candle'),
  btcCandle: candle('Bearish Candle'),
  btcHealth: { btcTrendDir: 'down' },
});
assert.equal(breakdown.tier, 'GOOD_TEST');

const squeezeLong = evaluate({ stage: 'SQUEEZE_LONG' });
assert.equal(squeezeLong.tier, 'WATCH_PLUS');

const squeezeShort = evaluate({
  stage: 'SQUEEZE_SHORT',
  side: 'SHORT',
  symbolCandle: candle('Bullish Candle'),
  btcCandle: candle('Bullish Candle'),
});
assert.equal(squeezeShort.tier, 'RISK');

const runnerSupport = evaluate({
  stage: 'RUNNER',
  side: 'LONG',
  btcCorr: 0.6,
  symbolCandle: candle('Bullish Marubozu'),
  btcCandle: candle('Bullish Candle'),
});
assert.equal(runnerSupport.tier, 'WATCH_PLUS');

const runnerConflict = evaluate({
  stage: 'RUNNER',
  side: 'LONG',
  btcCorr: 0.6,
  symbolCandle: candle('Bullish Candle'),
  btcCandle: candle('Bearish Candle'),
});
assert.equal(runnerConflict.tier, 'RISK');

const brShort = evaluate({
  stage: 'BR_LIKE_SHORT',
  side: 'SHORT',
  symbolCandle: candle('Bearish Candle'),
  btcCandle: candle('Bearish Marubozu'),
});
assert.equal(brShort.tier, 'WATCH_PLUS');

const brLong = evaluate({
  stage: 'BR_LIKE_LONG',
  side: 'LONG',
  symbolCandle: candle('Bullish Candle'),
  btcCandle: candle('Bullish Candle'),
});
assert.equal(brLong.tier, 'WATCH_PLUS');

const missing = evaluate({
  stage: 'BREAKOUT',
  symbolCandle: null,
  btcCandle: candle('Bullish Candle'),
});
assert.equal(missing.tier, 'WATCH');
assert.equal(missing.code, 'EMA_STAGE_CANDLE_PAIR_MISSING');

for (const row of [
  preBreakout, preBreakdown, breakout, breakdown, squeezeLong, squeezeShort,
  runnerSupport, runnerConflict, brShort, brLong, missing,
]) {
  assert.equal(row.version, EMA_STAGE_CANDLE_RULE_VERSION);
  assert.equal(row.observationOnly, true);
  assert.equal(row.affectsEntry, false);
  assert.equal(row.affectsMargin, false);
  assert.equal(row.affectsSl, false);
  assert.equal(row.affectsTp, false);
}

console.log('ema stage candle observe-only tests passed');
