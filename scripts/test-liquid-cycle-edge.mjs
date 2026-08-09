import assert from 'node:assert/strict';
import {
  LIQUID_SCAN_CYCLE_EDGE_VERSION,
  deriveLiquidScanCycleEdgeSnapshots,
  evaluateLiquidScanCycleEdgeSnapshot,
  liquidScanCycleFamily,
} from '../src/liquidScanCycleEdge.js';
import { LIQUID_SCAN_STAGE_3_VERSION } from '../src/liquidScanEvalRule.js';

function shortGoodPlus({
  id,
  createdAt,
  closedAt = null,
  netRoe = null,
  status = closedAt ? 'CLOSED' : 'OPEN',
} = {}) {
  return {
    id,
    symbol: `${id}USDT`,
    side: 'SHORT',
    status,
    createdAt,
    openedAt: createdAt,
    closedAt,
    netRoe,
    netPnl: netRoe == null ? null : netRoe / 10,
    marginUsdt: 1,
    outcome: netRoe == null ? null : netRoe > 0 ? 'TP' : 'SL',
    liquidStage3Tier: 'GOOD_PLUS',
    liquidStage3Code: 'GOOD+',
    liquidStage3Version: LIQUID_SCAN_STAGE_3_VERSION,
    liquidStage2TargetKind: 'LOCAL_SWEEP',
    btcHealth: {
      btcTrendDir: 'down',
      emaTrend1h: 'below',
      marketRegime: 'SIDEWAY_DOWN',
    },
  };
}

function historySeries({
  prefix,
  startDay,
  count,
  netRoe,
  hourOffset = 0,
}) {
  const base = Date.parse(`${startDay}T00:00:00.000Z`);
  return Array.from({ length: count }, (_, index) => {
    const createdMs = base + ((hourOffset + index * 3) * 60 * 60 * 1000);
    return shortGoodPlus({
      id: `${prefix}-${index}`,
      createdAt: new Date(createdMs).toISOString(),
      closedAt: new Date(createdMs + 60 * 60 * 1000).toISOString(),
      netRoe: typeof netRoe === 'function' ? netRoe(index) : netRoe,
    });
  });
}

const activeHistory = historySeries({
  prefix: 'active',
  startDay: '2026-07-20',
  count: 12,
  netRoe: (index) => (index % 5 === 0 ? -5 : 8),
});
const activeCandidate = shortGoodPlus({
  id: 'active-candidate',
  createdAt: '2026-07-23T18:00:00.000Z',
});
const active = evaluateLiquidScanCycleEdgeSnapshot(activeCandidate, activeHistory);
assert.equal(active.tier, 'ACTIVE');
assert.equal(active.version, LIQUID_SCAN_CYCLE_EDGE_VERSION);
assert.equal(active.affectsEntry, false);
assert.equal(active.affectsMargin, false);
assert.equal(active.basis, 'SNAPSHOT');
assert.equal(active.cycleFamily, 'BTC_DOWN_CONFIRMED');

const positivePrior = historySeries({
  prefix: 'prior',
  startDay: '2026-07-18',
  count: 10,
  netRoe: 8,
});
const negativeRecent = historySeries({
  prefix: 'faded',
  startDay: '2026-07-22',
  count: 8,
  netRoe: -10,
});
const fadedCandidate = shortGoodPlus({
  id: 'faded-candidate',
  createdAt: '2026-07-24T18:00:00.000Z',
});
const faded = evaluateLiquidScanCycleEdgeSnapshot(
  fadedCandidate,
  [...positivePrior, ...negativeRecent],
);
assert.equal(faded.tier, 'FADED');
assert.ok(faded.recent.profitFactor < 0.9);

const recoveryTail = historySeries({
  prefix: 'recovery',
  startDay: '2026-07-23',
  count: 3,
  netRoe: 6,
});
const recoveryCandidate = shortGoodPlus({
  id: 'recovery-candidate',
  createdAt: '2026-07-24T20:00:00.000Z',
});
const recovery = evaluateLiquidScanCycleEdgeSnapshot(
  recoveryCandidate,
  [
    ...positivePrior,
    ...negativeRecent.slice(0, 5),
    ...recoveryTail,
  ],
);
assert.equal(recovery.tier, 'RECOVERY');

const newCandidate = shortGoodPlus({
  id: 'new-candidate',
  createdAt: '2026-07-24T18:00:00.000Z',
});
const sparse = evaluateLiquidScanCycleEdgeSnapshot(
  newCandidate,
  positivePrior.slice(0, 3),
);
assert.equal(sparse.tier, 'NEW');

const futureClose = shortGoodPlus({
  id: 'future-close',
  createdAt: '2026-07-24T10:00:00.000Z',
  closedAt: '2026-07-25T10:00:00.000Z',
  netRoe: 20,
});
const noLeak = evaluateLiquidScanCycleEdgeSnapshot(newCandidate, [futureClose]);
assert.equal(noLeak.tier, 'NEW', 'outcome closed after entry must not affect the label');
assert.equal(noLeak.history.closed, 0);

const derived = deriveLiquidScanCycleEdgeSnapshots([
  ...activeHistory,
  activeCandidate,
]);
assert.equal(derived.get('active-candidate').tier, 'ACTIVE');
assert.equal(derived.get('active-0').basis, 'BACKFILL_CAUSAL');

assert.equal(
  liquidScanCycleFamily({
    btcHealth: {
      btcTrendDir: 'up',
      emaTrend1h: 'above',
      marketRegime: 'SIDEWAY_UP',
    },
  }),
  'BTC_UP_CONFIRMED',
);

console.log('liquid cycle edge tests passed');
