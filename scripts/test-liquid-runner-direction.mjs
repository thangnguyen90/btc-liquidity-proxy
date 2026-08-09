import assert from 'node:assert/strict';
import {
  LIQUID_RUNNER_DIRECTION_VERSION,
  deriveLiquidRunnerDirectionSnapshots,
  evaluateLiquidRunnerDirectionSnapshot,
  liquidRunnerDirectionCohorts,
  liquidRunnerDirectionRelation,
} from '../src/liquidRunnerDirectionEdge.js';

function runnerTrade({
  id,
  side = 'SHORT',
  plannedTpRoe = 40,
  createdAt,
  closedAt = null,
  netRoe = null,
  status = closedAt ? 'CLOSED' : 'OPEN',
  corr = 0.5,
  btcDirection = side === 'SHORT' ? 'down' : 'up',
  candleDirection = side === 'SHORT' ? 'BEARISH' : 'BULLISH',
} = {}) {
  const entryPrice = 100;
  const leverage = 10;
  const takeProfitPrice = side === 'LONG'
    ? entryPrice * (1 + plannedTpRoe / leverage / 100)
    : entryPrice * (1 - plannedTpRoe / leverage / 100);
  return {
    id,
    symbol: `${id}USDT`,
    side,
    status,
    createdAt,
    openedAt: createdAt,
    closedAt,
    netRoe,
    netPnl: netRoe == null ? null : netRoe / 100,
    marginUsdt: 1,
    entryPrice,
    takeProfitPrice,
    sweepTargetPrice: takeProfitPrice,
    leverage,
    btcCorr: corr,
    btcHealth: {
      btcTrendDir: btcDirection,
      emaTrend1h: btcDirection === 'down' ? 'below' : 'above',
      marketRegime: btcDirection === 'down' ? 'SIDEWAY_DOWN' : 'SIDEWAY_UP',
    },
    candlePatternAtEntry: {
      direction: candleDirection,
    },
  };
}

function historySeries({
  prefix,
  startDay,
  count,
  netRoe,
  side = 'SHORT',
  hourOffset = 0,
}) {
  const base = Date.parse(`${startDay}T00:00:00.000Z`);
  return Array.from({ length: count }, (_, index) => {
    const createdMs = base + ((hourOffset + index * 3) * 60 * 60 * 1000);
    return runnerTrade({
      id: `${prefix}-${index}`,
      side,
      createdAt: new Date(createdMs).toISOString(),
      closedAt: new Date(createdMs + 60 * 60 * 1000).toISOString(),
      netRoe: typeof netRoe === 'function' ? netRoe(index) : netRoe,
    });
  });
}

const positiveHistory = historySeries({
  prefix: 'positive',
  startDay: '2026-07-20',
  count: 14,
  netRoe: (index) => (index % 4 === 0 ? -5 : 35),
});
const primeCandidate = runnerTrade({
  id: 'prime-candidate',
  createdAt: '2026-07-24T00:00:00.000Z',
});
const prime = evaluateLiquidRunnerDirectionSnapshot(primeCandidate, positiveHistory);
assert.equal(prime.tier, 'PRIME');
assert.equal(prime.version, LIQUID_RUNNER_DIRECTION_VERSION);
assert.equal(prime.basis, 'SNAPSHOT');
assert.equal(prime.affectsEntry, false);
assert.equal(prime.affectsMargin, false);
assert.equal(prime.history.highHits, 10);

const negativeRecent = historySeries({
  prefix: 'negative',
  startDay: '2026-07-24',
  count: 10,
  netRoe: -10,
});
const fadedCandidate = runnerTrade({
  id: 'faded-candidate',
  createdAt: '2026-07-26T12:00:00.000Z',
});
const faded = evaluateLiquidRunnerDirectionSnapshot(
  fadedCandidate,
  [...positiveHistory, ...negativeRecent],
);
assert.equal(faded.tier, 'FADED');
assert.ok(faded.recent.profitFactor < 0.9);

const recoveryTail = historySeries({
  prefix: 'recovery',
  startDay: '2026-07-26',
  count: 3,
  netRoe: (index) => (index === 0 ? 35 : 1),
});
const recoveryCandidate = runnerTrade({
  id: 'recovery-candidate',
  createdAt: '2026-07-27T12:00:00.000Z',
});
const recovery = evaluateLiquidRunnerDirectionSnapshot(
  recoveryCandidate,
  [...positiveHistory, ...negativeRecent.slice(0, 5), ...recoveryTail],
);
assert.equal(recovery.tier, 'RECOVERY');

const longCandidate = runnerTrade({
  id: 'long-new',
  side: 'LONG',
  createdAt: '2026-07-24T00:00:00.000Z',
});
const longNew = evaluateLiquidRunnerDirectionSnapshot(longCandidate, []);
assert.equal(longNew.tier, 'NEW');
assert.equal(longNew.side, 'LONG');
assert.equal(liquidRunnerDirectionCohorts(longCandidate).eligible, true);

const stretched = evaluateLiquidRunnerDirectionSnapshot(
  runnerTrade({
    id: 'stretched',
    plannedTpRoe: 70,
    createdAt: '2026-07-24T00:00:00.000Z',
  }),
  positiveHistory,
);
assert.equal(stretched.tier, 'STRETCHED');

const futureClose = runnerTrade({
  id: 'future-close',
  createdAt: '2026-07-23T00:00:00.000Z',
  closedAt: '2026-07-25T00:00:00.000Z',
  netRoe: 35,
});
const noLeak = evaluateLiquidRunnerDirectionSnapshot(primeCandidate, [futureClose]);
assert.equal(noLeak.tier, 'NEW');
assert.equal(noLeak.history.closed, 0);

const derived = deriveLiquidRunnerDirectionSnapshots([
  ...positiveHistory,
  primeCandidate,
]);
assert.equal(derived.get('prime-candidate').tier, 'PRIME');
assert.equal(derived.get('positive-0').basis, 'BACKFILL_CAUSAL');

assert.equal(
  liquidRunnerDirectionRelation(runnerTrade({
    id: 'signed-corr',
    side: 'SHORT',
    createdAt: '2026-07-24T00:00:00.000Z',
    corr: -0.4,
    btcDirection: 'up',
  })).relation,
  'ALIGNED_STRONG',
);

console.log('liquid runner direction tests passed');
