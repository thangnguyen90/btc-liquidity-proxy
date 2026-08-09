import assert from 'node:assert/strict';
import {
  EDGE_SHORT_UTAD_VERSION,
  decorateEdgeShortUtadSnapshots,
  edgeShortUtadSnapshot,
  edgeShortUtadStats,
} from '../src/edgeShortUtad.js';
import { liveCardKeysFromRows } from '../src/liquidLiveCardWhitelist.js';

function trade(overrides = {}) {
  return {
    id: 'utad-1',
    side: 'SHORT',
    status: 'CLOSED',
    entryPrice: 100,
    tp: 98.5,
    sl: 103,
    pnl: 1.5,
    roe: 5,
    openedAt: '2026-08-04T02:00:00.000Z',
    pumpSignalType: 'bc_utad',
    candlePatternAtEntry: { direction: 'BEARISH' },
    btcCandlePatternAtEntry: { direction: 'BEARISH' },
    marketDirectionAtSignal: {
      scores: { long: 50, short: 42 },
    },
    ...overrides,
  };
}

const prime = edgeShortUtadSnapshot(trade());
assert.equal(prime.edgeShortUtadEligible, true);
assert.equal(prime.edgeShortUtadConfirmed, true);
assert.equal(prime.edgeShortUtadPrimeTest, true);
assert.equal(prime.edgeShortUtadKey, 'PRIME_TEST');
assert.equal(prime.edgeShortUtadPointGap, 8);
assert.equal(prime.edgeShortUtadRewardRisk, 0.5);
assert.equal(prime.edgeShortUtadObservationOnly, true);
assert.equal(prime.edgeShortUtadAffectsEntry, false);
assert.equal(prime.edgeShortUtadAffectsBinance, false);

const confirmed = edgeShortUtadSnapshot(trade({
  marketDirectionAtSignal: { scores: { long: 50, short: 48 } },
}));
assert.equal(confirmed.edgeShortUtadConfirmed, true);
assert.equal(confirmed.edgeShortUtadPrimeTest, false);
assert.equal(confirmed.edgeShortUtadKey, 'CONFIRMED');

const noPointConfirmation = edgeShortUtadSnapshot(trade({
  marketDirectionAtSignal: { scores: { long: 40, short: 45 } },
}));
assert.equal(noPointConfirmation.edgeShortUtadEligible, true);
assert.equal(noPointConfirmation.edgeShortUtadConfirmed, false);
assert.equal(noPointConfirmation.edgeShortUtadKey, 'N_A');

const noPrimeOnHighRr = edgeShortUtadSnapshot(trade({ tp: 97 }));
assert.equal(noPrimeOnHighRr.edgeShortUtadConfirmed, true);
assert.equal(noPrimeOnHighRr.edgeShortUtadPrimeTest, false);

const noConfirmWithoutBearishPair = edgeShortUtadSnapshot(trade({
  btcCandlePatternAtEntry: { direction: 'BULLISH' },
}));
assert.equal(noConfirmWithoutBearishPair.edgeShortUtadEligible, false);
assert.equal(noConfirmWithoutBearishPair.edgeShortUtadConfirmed, false);

const oldJsonTrade = trade({ id: 'old-json' });
const [decorated] = decorateEdgeShortUtadSnapshots([oldJsonTrade]);
assert.equal(oldJsonTrade.edgeShortUtadVersion, undefined);
assert.equal(decorated.edgeShortUtadVersion, EDGE_SHORT_UTAD_VERSION);
assert.equal(decorated.edgeShortUtadDerived, true);

const decoratedTrades = decorateEdgeShortUtadSnapshots([
  trade({ id: 'prime-win', pnl: 1.5, roe: 5 }),
  trade({
    id: 'confirmed-loss',
    pnl: -0.5,
    roe: -2,
    marketDirectionAtSignal: { scores: { long: 50, short: 48 } },
  }),
  trade({ id: 'active-prime', status: 'OPEN', pnl: 0.2, roe: 1 }),
]);
const stats = edgeShortUtadStats(decoratedTrades);
const confirmedStats = stats.find((row) => row.key === 'CONFIRMED');
const primeStats = stats.find((row) => row.key === 'PRIME_TEST');
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
    'short-utad',
    edgeShortUtadStats([decoratedTrades[0]]),
  ),
  [
    'edge:short-utad:CONFIRMED',
    'edge:short-utad:PRIME_TEST',
  ],
);

console.log('edge SHORT UTAD labels/stats: ok');
