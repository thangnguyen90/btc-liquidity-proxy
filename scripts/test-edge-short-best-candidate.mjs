import assert from 'node:assert/strict';
import {
  EDGE_SHORT_BEST_VERSION,
  decorateEdgeShortBestSnapshots,
  edgeShortBestSnapshotForEntry,
  edgeShortBestStats,
} from '../src/edgeShortBestCandidate.js';

const prior = Array.from({ length: 10 }, (_, index) => {
  const win = index < 8;
  const createdDay = index < 5 ? '2026-07-20' : '2026-07-21';
  return {
    id: `prior-${index}`,
    edgeShortTier: 'A',
    pumpSignalType: 'EARLY_DUMP',
    status: 'CLOSED',
    createdAt: `${createdDay}T01:00:00.000Z`,
    openedAt: `${createdDay}T01:00:00.000Z`,
    closedAt: `2026-07-${index < 5 ? '20' : '21'}T02:00:00.000Z`,
    pnl: win ? 2 : -1,
    roe: win ? 4 : -2,
    outcome: win ? 'TP' : 'SL',
  };
});

const candidate = {
  id: 'candidate',
  edgeShortTier: 'A',
  pumpSignalType: 'EARLY_DUMP',
  status: 'OPEN',
  createdAt: '2026-07-23T03:00:00.000Z',
  openedAt: '2026-07-23T03:00:00.000Z',
};
const snapshot = edgeShortBestSnapshotForEntry(
  prior,
  candidate,
  Date.parse(candidate.createdAt),
);
assert.equal(snapshot.edgeShortBestVersion, EDGE_SHORT_BEST_VERSION);
assert.equal(snapshot.edgeShortBestSelected, true);
assert.equal(snapshot.edgeShortBestLabel, 'SE BEST');
assert.equal(snapshot.edgeShortBestSamplesBeforeDay, 10);
assert.equal(snapshot.edgeShortBestObservationOnly, true);
assert.equal(snapshot.edgeShortBestAffectsEntry, false);
assert.equal(snapshot.edgeShortBestAffectsMargin, false);
assert.equal(snapshot.edgeShortBestAffectsSl, false);
assert.equal(snapshot.edgeShortBestAffectsTp, false);
assert.match(snapshot.edgeShortBestReason, /prior-day closed only/);
assert.match(snapshot.edgeShortBestReason, /không gate\/chặn lệnh/);

const outcomeInjected = edgeShortBestSnapshotForEntry(
  prior,
  {
    ...candidate,
    status: 'CLOSED',
    outcome: 'SL',
    pnl: -999,
    roe: -999,
  },
  Date.parse(candidate.createdAt),
);
assert.equal(
  outcomeInjected.edgeShortBestSelected,
  snapshot.edgeShortBestSelected,
  'candidate outcome must not affect its pre-entry label',
);
assert.equal(
  outcomeInjected.edgeShortBestSamplesBeforeDay,
  snapshot.edgeShortBestSamplesBeforeDay,
);

const onlyNinePrior = prior.slice(0, 9);
const sameDayClose = {
  ...prior[9],
  id: 'same-day-close',
  createdAt: '2026-07-23T01:00:00.000Z',
  openedAt: '2026-07-23T01:00:00.000Z',
  closedAt: '2026-07-23T02:00:00.000Z',
};
const frozenRows = decorateEdgeShortBestSnapshots([
  ...onlyNinePrior,
  sameDayClose,
  candidate,
]);
const frozenCandidate = frozenRows.find((trade) => trade.id === candidate.id);
assert.equal(frozenCandidate.edgeShortBestSamplesBeforeDay, 9);
assert.equal(frozenCandidate.edgeShortBestSelected, false);

const storedCandidate = {
  ...candidate,
  ...snapshot,
  edgeShortBestDerived: false,
};
const stats = edgeShortBestStats([
  ...prior,
  { ...storedCandidate, status: 'CLOSED', pnl: 3, roe: 6, outcome: 'TP' },
  {
    ...candidate,
    id: 'remaining',
    edgeShortBestSelected: false,
    status: 'CLOSED',
    pnl: -1,
    roe: -2,
    outcome: 'SL',
  },
]);
const best = stats.find((row) => row.key === 'BEST');
const remaining = stats.find((row) => row.key === 'A_B_REMAINING');
assert.equal(best.closed, 1);
assert.equal(best.closedPnl, 3);
assert.equal(remaining.closed, 11);
assert.equal(remaining.totalPnl, 13);

console.log('Edge Short SE BEST tests passed: prior-day freeze and observe-only guardrails are correct.');
