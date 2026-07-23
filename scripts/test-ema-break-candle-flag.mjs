import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const file = new URL('../public/paper-candle-columns.js', import.meta.url);
const source = fs.readFileSync(file, 'utf8').replace(
  '  const remember = (trade) => {',
  '  window.__testPaperCandleFlag = (trade) => { const signal = signalPatternOf(trade); const btc = btcPatternOf(trade); return sideCandleOf(trade, btc, signal); };\n  const remember = (trade) => {',
);

const context = {
  console,
  location: { pathname: '/ema-squeeze' },
  document: {
    readyState: 'loading',
    documentElement: {},
    addEventListener() {},
    querySelectorAll() { return []; },
  },
  MutationObserver: class { observe() {} },
  requestAnimationFrame() {},
  EventSource: class { addEventListener() {} },
};
context.window = context;
context.fetch = async () => ({ clone: () => ({ json: async () => ({}) }) });
vm.runInNewContext(source, context);

const candle = (name, timeframe = '5m') => ({ name, timeframe });
const evaluate = ({ source: tradeSource, side, alt, btc, btcTrendDir = 'up' }) => context.__testPaperCandleFlag({
  source: tradeSource,
  side,
  candlePatternAtEntry: candle(alt, tradeSource.includes('15m') ? '15m' : '5m'),
  btcCandlePatternAtEntry: candle(btc),
  btcTrendDir,
});

assert.equal(evaluate({ source: 'emasq-5m-breakout-75-mkt', side: 'LONG', alt: 'BULLISH_CANDLE', btc: 'BULLISH_CANDLE' }).label, 'GOOD');
assert.equal(evaluate({ source: 'emasq-5m-breakout-75-mkt', side: 'LONG', alt: 'BULLISH_CANDLE', btc: 'BEARISH_CANDLE' }).label, 'RISK');
assert.equal(evaluate({ source: 'emasq-15m-breakout-75-mkt', side: 'LONG', alt: 'BEARISH_CANDLE', btc: 'BULLISH_CANDLE' }).label, 'WATCH+');
assert.equal(evaluate({ source: 'emasq-5m-breakdown-75-mkt', side: 'SHORT', alt: 'BULLISH_CANDLE', btc: 'BULLISH_CANDLE', btcTrendDir: 'up' }).label, 'RISK');
assert.equal(evaluate({ source: 'emasq-15m-breakdown-75-mkt', side: 'SHORT', alt: 'BEARISH_CANDLE', btc: 'BEARISH_CANDLE', btcTrendDir: 'down' }).label, 'GOOD-TEST');

const observed = evaluate({ source: 'emasq-5m-breakout-75-mkt', side: 'LONG', alt: 'BULLISH_CANDLE', btc: 'BULLISH_CANDLE' });
assert.match(observed.reason, /display only; không đổi entry\/size\/SL\/TP/);
console.log('EMA Breakout/Breakdown candle flags: OK');
