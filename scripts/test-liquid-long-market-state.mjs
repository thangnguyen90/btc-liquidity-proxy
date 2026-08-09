import assert from 'node:assert/strict';
import {
  LIQUID_LONG_MARKET_STATE_VERSION,
  evaluateLiquidLongMarketState,
} from '../src/liquidLongMarketState.js';

function trade({
  side = 'LONG',
  direction = 'up',
  emaTrend1h = direction === 'up' ? 'above' : 'below',
  marketRegime = direction === 'up' ? 'SIDEWAY_UP' : 'SIDEWAY_DOWN',
  pct6h = direction === 'up' ? 0.4 : -0.4,
  rsi1h = direction === 'up' ? 60 : 42,
  obvTrend = direction === 'up' ? 'rising' : 'falling',
  btcCandleName = 'DOJI',
  btcCandleDirection = 'NEUTRAL',
} = {}) {
  return {
    side,
    btcHealth: {
      btcTrendDir: direction,
      btcTrendScore: 55,
      emaTrend1h,
      marketRegime,
      pct6h,
      pct24h: pct6h,
      rsi1h,
      obvTrend,
    },
    btcCandlePatternAtEntry: {
      name: btcCandleName,
      direction: btcCandleDirection,
    },
  };
}

const tailwind = evaluateLiquidLongMarketState(trade());
assert.equal(tailwind.liquidLongMarketTier, 'TAILWIND');
assert.equal(tailwind.liquidLongMarketVersion, LIQUID_LONG_MARKET_STATE_VERSION);
assert.equal(tailwind.liquidLongMarketObservationOnly, true);
assert.equal(tailwind.liquidLongMarketAffectsEntry, false);

const reclaim = evaluateLiquidLongMarketState(trade({
  direction: 'down',
  pct6h: 0.1,
  obvTrend: 'rising',
  btcCandleName: 'HAMMER',
  btcCandleDirection: 'BULLISH',
}));
assert.equal(reclaim.liquidLongMarketTier, 'RECLAIM');

const late = evaluateLiquidLongMarketState(trade({ rsi1h: 72 }));
assert.equal(late.liquidLongMarketTier, 'LATE');

const headwind = evaluateLiquidLongMarketState(trade({ direction: 'down' }));
assert.equal(headwind.liquidLongMarketTier, 'HEADWIND');

const transition = evaluateLiquidLongMarketState(trade({
  direction: 'up',
  emaTrend1h: 'below',
  marketRegime: 'CHOP',
  pct6h: -0.1,
  obvTrend: 'falling',
}));
assert.equal(transition.liquidLongMarketTier, 'TRANSITION');

const noDataTrade = trade();
delete noDataTrade.btcHealth.obvTrend;
assert.equal(evaluateLiquidLongMarketState(noDataTrade).liquidLongMarketTier, 'NO_DATA');

const short = evaluateLiquidLongMarketState(trade({ side: 'SHORT' }));
assert.equal(short.liquidLongMarketTier, 'UNRATED');

const outcomeA = evaluateLiquidLongMarketState({ ...trade(), status: 'CLOSED', netPnl: 10 });
const outcomeB = evaluateLiquidLongMarketState({ ...trade(), status: 'OPEN', netPnl: -10 });
assert.equal(outcomeA.liquidLongMarketTier, outcomeB.liquidLongMarketTier);

console.log('liquid LONG market-state tests passed');
