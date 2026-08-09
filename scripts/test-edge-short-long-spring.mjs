import assert from 'node:assert/strict';
import {
  EDGE_SHORT_LONG_SPRING_VERSION,
  decorateEdgeShortLongSpringSnapshots,
  edgeShortLongSpringSnapshot,
  edgeShortLongSpringStats,
} from '../src/edgeShortLongSpring.js';
import { liveCardKeysFromRows } from '../src/liquidLiveCardWhitelist.js';

function trade(overrides = {}) {
  return {
    id: 'spring-1',
    side: 'LONG',
    status: 'CLOSED',
    entryPrice: 100,
    tp: 101.5,
    sl: 97,
    pnl: 1.5,
    roe: 5,
    openedAt: '2026-08-04T02:00:00.000Z',
    pumpSignalType: 'sc_spring',
    candlePatternAtEntry: { direction: 'BULLISH' },
    btcCandlePatternAtEntry: { direction: 'BULLISH' },
    marketDirectionAtSignal: {
      scores: { long: 30, short: 50 },
    },
    ...overrides,
  };
}

const prime = edgeShortLongSpringSnapshot(trade());
assert.equal(prime.edgeShortLongSpringConfirmed, true);
assert.equal(prime.edgeShortLongSpringPrime, true);
assert.equal(prime.edgeShortLongSpringKey, 'PRIME');
assert.equal(prime.edgeShortLongSpringPointGap, 20);
assert.equal(prime.edgeShortLongSpringRewardRisk, 0.5);
assert.equal(prime.edgeShortLongSpringObservationOnly, true);
assert.equal(prime.edgeShortLongSpringAffectsEntry, false);
assert.equal(prime.edgeShortLongSpringAffectsBinance, false);

const confirmed = edgeShortLongSpringSnapshot(trade({ tp: 103 }));
assert.equal(confirmed.edgeShortLongSpringConfirmed, true);
assert.equal(confirmed.edgeShortLongSpringPrime, false);
assert.equal(confirmed.edgeShortLongSpringKey, 'CONFIRMED');

const noPointConfirmation = edgeShortLongSpringSnapshot(trade({
  marketDirectionAtSignal: { scores: { long: 42, short: 50 } },
}));
assert.equal(noPointConfirmation.edgeShortLongSpringEligible, false);
assert.equal(noPointConfirmation.edgeShortLongSpringKey, 'N_A');

const oldJsonTrade = trade({ id: 'old-json' });
const [decorated] = decorateEdgeShortLongSpringSnapshots([oldJsonTrade]);
assert.equal(oldJsonTrade.edgeShortLongSpringVersion, undefined);
assert.equal(decorated.edgeShortLongSpringVersion, EDGE_SHORT_LONG_SPRING_VERSION);
assert.equal(decorated.edgeShortLongSpringDerived, true);

const decoratedTrades = decorateEdgeShortLongSpringSnapshots([
  trade({ id: 'prime-win', pnl: 1.5, roe: 5 }),
  trade({ id: 'confirmed-loss', tp: 103, pnl: -0.5, roe: -2 }),
  trade({ id: 'active-prime', status: 'OPEN', pnl: 0.2, roe: 1 }),
]);
const stats = edgeShortLongSpringStats(decoratedTrades);
const confirmedStats = stats.find((row) => row.key === 'CONFIRMED');
const primeStats = stats.find((row) => row.key === 'PRIME');
assert.equal(confirmedStats.total, 3);
assert.equal(confirmedStats.closed, 2);
assert.equal(confirmedStats.active, 1);
assert.equal(confirmedStats.wins, 1);
assert.equal(confirmedStats.losses, 1);
assert.equal(primeStats.total, 2);
assert.equal(primeStats.closed, 1);
assert.equal(primeStats.active, 1);
assert.equal(primeStats.wins, 1);
assert.deepEqual(
  liveCardKeysFromRows(
    'edge',
    'long-spring',
    edgeShortLongSpringStats([decoratedTrades[0]]),
  ),
  [
    'edge:long-spring:CONFIRMED',
    'edge:long-spring:PRIME',
  ],
);

console.log('edge short LONG SPRING labels/stats: ok');
