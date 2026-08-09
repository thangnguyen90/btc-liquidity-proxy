import assert from 'node:assert/strict';
import {
  EDGE_SHORT_WAVE_2B_VERSION,
  decorateEdgeShortWave2bSnapshots,
  edgeShortWave2bSnapshot,
  edgeShortWave2bStats,
} from '../src/edgeShortWave2b.js';

function trade({
  side,
  direction,
  emaTrend1h,
  regime,
  pct6h,
  rsi1h,
  obvTrend,
  trendScore = 60,
  status = 'CLOSED',
  pnl = 1,
  roe = 10,
  createdAt = '2026-08-01T01:00:00.000Z',
} = {}) {
  return {
    side,
    status,
    pnl,
    roe,
    createdAt,
    btcHealth: {
      btcTrendDir: direction,
      btcTrendScore: trendScore,
      emaTrend1h,
      regime,
      pct6h,
      rsi1h,
      obvTrend,
    },
  };
}

const shortTransition = edgeShortWave2bSnapshot(trade({
  side: 'SHORT',
  direction: 'UP',
  emaTrend1h: 'BELOW',
  regime: 'UP',
  pct6h: 0.5,
  rsi1h: 55,
  obvTrend: 'RISING',
}));
assert.equal(shortTransition.edgeShortWave2bKey, 'SHORT_TRANSITION');

const shortCounterActive = edgeShortWave2bSnapshot(trade({
  side: 'SHORT',
  direction: 'UP',
  emaTrend1h: 'ABOVE',
  regime: 'UP',
  pct6h: 0.7,
  rsi1h: 55,
  obvTrend: 'RISING',
}));
assert.equal(shortCounterActive.edgeShortWave2bKey, 'SHORT_COUNTER_ACTIVE');

const shortCounterExhausted = edgeShortWave2bSnapshot(trade({
  side: 'SHORT',
  direction: 'UP',
  emaTrend1h: 'ABOVE',
  regime: 'UP',
  pct6h: 0.1,
  rsi1h: 70,
  obvTrend: 'FALLING',
}));
assert.equal(shortCounterExhausted.edgeShortWave2bKey, 'SHORT_COUNTER_EXHAUSTED');

const longCounterActive = edgeShortWave2bSnapshot(trade({
  side: 'LONG',
  direction: 'DOWN',
  emaTrend1h: 'BELOW',
  regime: 'DOWN',
  pct6h: -0.7,
  rsi1h: 48,
  obvTrend: 'FALLING',
}));
assert.equal(longCounterActive.edgeShortWave2bKey, 'LONG_COUNTER_ACTIVE');

const longCounterExhausted = edgeShortWave2bSnapshot(trade({
  side: 'LONG',
  direction: 'DOWN',
  emaTrend1h: 'BELOW',
  regime: 'DOWN',
  pct6h: -0.1,
  rsi1h: 40,
  obvTrend: 'FALLING',
}));
assert.equal(longCounterExhausted.edgeShortWave2bKey, 'LONG_COUNTER_EXHAUSTED');

const longTransition = edgeShortWave2bSnapshot(trade({
  side: 'LONG',
  direction: 'DOWN',
  emaTrend1h: 'ABOVE',
  regime: 'DOWN',
  pct6h: -0.5,
  rsi1h: 50,
  obvTrend: 'FALLING',
}));
assert.equal(longTransition.edgeShortWave2bKey, 'LONG_TRANSITION');

const futureAligned = edgeShortWave2bSnapshot(trade({
  side: 'SHORT',
  direction: 'DOWN',
  emaTrend1h: 'BELOW',
  regime: 'DOWN',
  pct6h: -0.8,
  rsi1h: 48,
  obvTrend: 'FALLING',
}));
assert.equal(futureAligned.edgeShortWave2bKey, 'SHORT_ALIGNED_ACTIVE');
assert.equal(futureAligned.edgeShortWave2bTone, 'GOOD');

const noData = edgeShortWave2bSnapshot({ side: 'SHORT', btcHealth: {} });
assert.equal(noData.edgeShortWave2bKey, 'WAVE_NO_DATA');
assert.equal(noData.edgeShortWave2bEligible, false);

for (const snapshot of [
  shortTransition,
  shortCounterActive,
  shortCounterExhausted,
  longCounterActive,
  longCounterExhausted,
  longTransition,
  futureAligned,
  noData,
]) {
  assert.equal(snapshot.edgeShortWave2bVersion, EDGE_SHORT_WAVE_2B_VERSION);
  assert.equal(snapshot.edgeShortWave2bObservationOnly, true);
  assert.equal(snapshot.edgeShortWave2bAffectsEntry, false);
  assert.equal(snapshot.edgeShortWave2bAffectsMargin, false);
  assert.equal(snapshot.edgeShortWave2bAffectsSl, false);
  assert.equal(snapshot.edgeShortWave2bAffectsTp, false);
}

const decorated = decorateEdgeShortWave2bSnapshots([
  trade({
    side: 'SHORT',
    direction: 'UP',
    emaTrend1h: 'ABOVE',
    regime: 'UP',
    pct6h: 0.7,
    rsi1h: 55,
    obvTrend: 'RISING',
  }),
]);
assert.equal(decorated[0].edgeShortWave2bKey, 'SHORT_COUNTER_ACTIVE');
assert.equal(decorated[0].edgeShortWave2bDerived, true);

const statsTrades = [
  {
    ...trade({
      side: 'SHORT', direction: 'UP', emaTrend1h: 'BELOW', regime: 'UP',
      pct6h: 0.5, rsi1h: 55, obvTrend: 'RISING', pnl: 2, roe: 20,
    }),
    ...shortTransition,
  },
  {
    ...trade({
      side: 'SHORT', direction: 'UP', emaTrend1h: 'BELOW', regime: 'UP',
      pct6h: 0.5, rsi1h: 55, obvTrend: 'RISING', pnl: -1, roe: -10,
      createdAt: '2026-08-01T18:30:00.000Z',
    }),
    ...shortTransition,
  },
  {
    ...trade({
      side: 'SHORT', direction: 'UP', emaTrend1h: 'BELOW', regime: 'UP',
      pct6h: 0.5, rsi1h: 55, obvTrend: 'RISING', pnl: 0.5, roe: 5,
      status: 'OPEN',
    }),
    ...shortTransition,
    status: 'OPEN',
    pnl: 0.5,
  },
];
const shortTransitionStats = edgeShortWave2bStats(statsTrades)
  .find((row) => row.key === 'SHORT_TRANSITION');
assert.equal(shortTransitionStats.closed, 2);
assert.equal(shortTransitionStats.active, 1);
assert.equal(shortTransitionStats.wins, 1);
assert.equal(shortTransitionStats.losses, 1);
assert.equal(shortTransitionStats.closedPnl, 1);
assert.equal(shortTransitionStats.activePnl, 0.5);
assert.equal(shortTransitionStats.totalDays, 2);

console.log('Edge Short L2B BTC wave tests passed: labels, history derive, stats and observe-only guardrails are correct.');
