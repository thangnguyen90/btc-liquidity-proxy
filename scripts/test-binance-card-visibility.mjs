import assert from 'node:assert/strict';
import {
  BINANCE_CARD_MIN_AVG_ROE,
  binanceCardAvgRoeAttrs,
  enforceBinanceCardAvgRoeVisibility,
  isBinanceCardAvgRoeEligible,
} from '../public/binance-card-visibility.js';

assert.equal(BINANCE_CARD_MIN_AVG_ROE, 4);
assert.equal(isBinanceCardAvgRoeEligible(null), false);
assert.equal(isBinanceCardAvgRoeEligible(undefined), false);
assert.equal(isBinanceCardAvgRoeEligible(4), false);
assert.equal(isBinanceCardAvgRoeEligible('4.0'), false);
assert.equal(isBinanceCardAvgRoeEligible(4.0001), true);
assert.equal(isBinanceCardAvgRoeEligible(8.4), true);
assert.match(binanceCardAvgRoeAttrs(3.9), /eligible="false"/);
assert.match(binanceCardAvgRoeAttrs(4.1), /eligible="true"/);

const card = { dataset: { binanceCardAvgRoe: '4' }, textContent: 'AvgROE +4.0%' };
const attrs = new Map();
const control = {
  textContent: 'BINANCE',
  hidden: false,
  closest: () => card,
  setAttribute: (key, value) => attrs.set(key, value),
};
const root = { querySelectorAll: () => [control] };
enforceBinanceCardAvgRoeVisibility(root);
assert.equal(control.hidden, true);
assert.equal(attrs.get('aria-hidden'), 'true');
card.dataset.binanceCardAvgRoe = '4.1';
enforceBinanceCardAvgRoeVisibility(root);
assert.equal(control.hidden, false);
assert.equal(attrs.get('aria-hidden'), 'false');

console.log('binance card AvgROE visibility tests passed');
