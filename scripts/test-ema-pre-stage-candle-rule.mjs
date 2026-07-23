import assert from 'node:assert/strict';
import { evaluateEmaPreStageCandle } from '../src/emaPreStageCandleRule.js';

const candle = (name, direction) => ({ name, direction });
const evaluate = (stage, interval, symbolCandle, btcCandle) => evaluateEmaPreStageCandle({
  stage,
  side: stage === 'PRE_BREAKOUT' ? 'LONG' : 'SHORT',
  interval,
  symbolCandle,
  btcCandle,
});

assert.deepEqual(
  { tier: evaluate('PRE_BREAKOUT', '5m', candle('BEARISH_CANDLE', 'BEARISH'), candle('BULLISH_CANDLE', 'BULLISH')).tier,
    label: evaluate('PRE_BREAKOUT', '5m', candle('BEARISH_CANDLE', 'BEARISH'), candle('BULLISH_CANDLE', 'BULLISH')).label },
  { tier: 'WATCH', label: 'GOOD-TEST' },
);
assert.equal(evaluate('PRE_BREAKOUT', '5m', candle('BULLISH_CANDLE', 'BULLISH'), candle('BULLISH_CANDLE', 'BULLISH')).tier, 'RISK');
assert.equal(evaluate('PRE_BREAKOUT', '5m', candle('DOJI', 'NEUTRAL'), candle('BEARISH_CANDLE', 'BEARISH')).tier, 'GOOD');
assert.equal(evaluate('PRE_BREAKOUT', '15m', candle('BULLISH_CANDLE', 'BULLISH'), candle('BEARISH_CANDLE', 'BEARISH')).tier, 'RISK');
assert.equal(evaluate('PRE_BREAKOUT', '15m', candle('BEARISH_CANDLE', 'BEARISH'), candle('DOJI', 'NEUTRAL')).label, 'WATCH+');
assert.equal(evaluate('PRE_BREAKDOWN', '15m', candle('BEARISH_CANDLE', 'BEARISH'), candle('BULLISH_CANDLE', 'BULLISH')).tier, 'RISK');
assert.equal(evaluate('PRE_BREAKDOWN', '15m', candle('BULLISH_CANDLE', 'BULLISH'), candle('BEARISH_CANDLE', 'BEARISH')).tier, 'WATCH');
assert.equal(evaluate('PRE_BREAKDOWN', '5m', candle('BULLISH_CANDLE', 'BULLISH'), candle('BEARISH_CANDLE', 'BEARISH')).tier, 'RISK');
assert.equal(evaluate('PRE_BREAKOUT', '5m', null, null).label, 'WATCH');
assert.equal(evaluate('PRE_BREAKOUT', '5m', null, null).marginUsdt, null);
assert.equal(evaluate('PRE_BREAKOUT', '5m', null, null).observationOnly, true);
assert.equal(evaluate('PRE_BREAKOUT', '5m', null, null).affectsEntry, false);
assert.equal(evaluate('PRE_BREAKOUT', '5m', null, null).affectsMargin, false);

console.log('EMA pre-stage candle rule: OK');
