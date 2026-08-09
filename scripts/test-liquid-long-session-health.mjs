import assert from 'node:assert/strict';
import {
  LIQUID_LONG_SESSION_HEALTH_VERSION,
  deriveLiquidLongSessionHealthSnapshots,
  evaluateLiquidLongSessionHealthSnapshot,
} from '../src/liquidLongSessionHealth.js';

function closedTrade(id, index, pnl, roe = pnl * 10) {
  const minute = String(index).padStart(2, '0');
  return {
    id,
    side: 'LONG',
    status: 'CLOSED',
    createdAt: `2026-07-28T00:${minute}:00.000Z`,
    openedAt: `2026-07-28T00:${minute}:00.000Z`,
    closedAt: `2026-07-28T01:${minute}:00.000Z`,
    netPnl: pnl,
    netRoe: roe,
  };
}

function candidate(id = 'candidate', at = '2026-07-28T02:00:00.000Z') {
  return {
    id,
    side: 'LONG',
    status: 'OPEN',
    createdAt: at,
    openedAt: at,
  };
}

const healthyHistory = Array.from(
  { length: 20 },
  (_, index) => closedTrade(`healthy-${index}`, index, 1, 5),
);
const healthy = evaluateLiquidLongSessionHealthSnapshot(
  candidate('healthy-candidate'),
  healthyHistory,
);
assert.equal(healthy.liquidLongSessionTier, 'HEALTHY');
assert.equal(healthy.liquidLongSessionHistory.closed, 20);
assert.equal(healthy.liquidLongSessionVersion, LIQUID_LONG_SESSION_HEALTH_VERSION);
assert.equal(healthy.liquidLongSessionObservationOnly, true);
assert.equal(healthy.liquidLongSessionAffectsEntry, false);

const badHistory = Array.from(
  { length: 20 },
  (_, index) => closedTrade(`bad-${index}`, index, -1, -5),
);
const breakdown = evaluateLiquidLongSessionHealthSnapshot(
  candidate('bad-candidate'),
  badHistory,
);
assert.equal(breakdown.liquidLongSessionTier, 'BREAKDOWN');

const warmup = evaluateLiquidLongSessionHealthSnapshot(
  candidate('warmup-candidate'),
  healthyHistory.slice(0, 19),
);
assert.equal(warmup.liquidLongSessionTier, 'WARMUP');

const mixedHistory = [
  ...Array.from({ length: 10 }, (_, index) => closedTrade(`win-${index}`, index, 1, 2)),
  ...Array.from({ length: 10 }, (_, index) => closedTrade(`loss-${index}`, index + 10, -1, -1)),
];
const watch = evaluateLiquidLongSessionHealthSnapshot(
  candidate('watch-candidate'),
  mixedHistory,
);
assert.equal(watch.liquidLongSessionTier, 'WATCH');

const futureLoss = closedTrade('future-loss', 30, -100, -100);
futureLoss.closedAt = '2026-07-28T03:00:00.000Z';
const ignoresFuture = evaluateLiquidLongSessionHealthSnapshot(
  candidate('future-safe'),
  [...healthyHistory, futureLoss],
);
assert.equal(ignoresFuture.liquidLongSessionTier, 'HEALTHY');
assert.equal(ignoresFuture.liquidLongSessionHistory.closed, 20);

const short = evaluateLiquidLongSessionHealthSnapshot(
  { ...candidate('short'), side: 'SHORT' },
  healthyHistory,
);
assert.equal(short.liquidLongSessionTier, 'UNRATED');

const derived = deriveLiquidLongSessionHealthSnapshots([
  ...healthyHistory,
  candidate('derived-candidate'),
]);
assert.equal(derived.get('derived-candidate').liquidLongSessionTier, 'HEALTHY');

console.log('liquid LONG session-health tests passed');
