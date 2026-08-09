import assert from 'node:assert/strict';
import {
  EDGE_SHORT_LIVE_VERSION,
  decorateEdgeShortLiveSnapshots,
  edgeShortLiveSnapshotForEntry,
  edgeShortLiveStats,
} from '../src/edgeShortLiveHealth.js';

function closedTrade({
  id,
  minute,
  pnl,
  roe,
  direction = 'down',
  score = 55,
  setup = 'KILL_SHORT',
}) {
  const openedAt = new Date(Date.parse('2026-07-26T00:00:00.000Z') + minute * 60_000);
  const closedAt = new Date(openedAt.getTime() + 30_000);
  return {
    id,
    edgeShortTier: 'A',
    edgeShortBestSelected: true,
    pumpSignalType: setup,
    side: 'LONG',
    status: 'CLOSED',
    createdAt: openedAt.toISOString(),
    openedAt: openedAt.toISOString(),
    closedAt: closedAt.toISOString(),
    pnl,
    roe,
    btcHealth: {
      btcTrendDir: direction,
      btcTrendScore: score,
    },
  };
}

const samePhase = Array.from({ length: 8 }, (_, index) => closedTrade({
  id: `same-${index}`,
  minute: index,
  pnl: index < 6 ? 1 : -0.5,
  roe: index < 6 ? 3 : -2,
}));
const otherPhase = Array.from({ length: 4 }, (_, index) => closedTrade({
  id: `other-${index}`,
  minute: 10 + index,
  pnl: 2,
  roe: 10,
  direction: 'up',
  score: 70,
}));
const candidate = {
  id: 'candidate',
  edgeShortTier: 'A',
  edgeShortBestSelected: true,
  pumpSignalType: 'KILL_SHORT',
  side: 'LONG',
  status: 'OPEN',
  createdAt: '2026-07-26T01:00:00.000Z',
  openedAt: '2026-07-26T01:00:00.000Z',
  btcHealth: {
    btcTrendDir: 'down',
    btcTrendScore: 55,
  },
};

const phaseSnapshot = edgeShortLiveSnapshotForEntry(
  [...samePhase, ...otherPhase],
  candidate,
  Date.parse(candidate.createdAt),
);
assert.equal(phaseSnapshot.edgeShortLiveVersion, EDGE_SHORT_LIVE_VERSION);
assert.equal(phaseSnapshot.edgeShortLiveEligible, true);
assert.equal(phaseSnapshot.edgeShortLiveTier, 'OK');
assert.equal(phaseSnapshot.edgeShortLiveLabel, 'SE LIVE OK');
assert.equal(phaseSnapshot.edgeShortLiveScope, 'SETUP_SIDE_BTC_PHASE');
assert.equal(phaseSnapshot.edgeShortLiveSamplesBeforeEntry, 8);
assert.equal(phaseSnapshot.edgeShortLiveObservationOnly, true);
assert.equal(phaseSnapshot.edgeShortLiveAffectsEntry, false);
assert.equal(phaseSnapshot.edgeShortLiveAffectsMargin, false);
assert.equal(phaseSnapshot.edgeShortLiveAffectsSl, false);
assert.equal(phaseSnapshot.edgeShortLiveAffectsTp, false);
assert.match(phaseSnapshot.edgeShortLiveReason, /strictly before entry/);
assert.match(phaseSnapshot.edgeShortLiveReason, /không gate\/chặn lệnh/);

const fallbackCandidate = {
  ...candidate,
  id: 'fallback',
  btcHealth: {
    btcTrendDir: 'flat',
    btcTrendScore: 30,
  },
};
const fallbackSnapshot = edgeShortLiveSnapshotForEntry(
  [...samePhase, ...otherPhase],
  fallbackCandidate,
  Date.parse(fallbackCandidate.createdAt),
);
assert.equal(fallbackSnapshot.edgeShortLiveScope, 'SETUP_SIDE');
assert.equal(fallbackSnapshot.edgeShortLiveSamplesBeforeEntry, 12);
assert.equal(fallbackSnapshot.edgeShortLiveTier, 'HOT');

const futureLoss = {
  ...closedTrade({
    id: 'future-loss',
    minute: 61,
    pnl: -999,
    roe: -999,
  }),
  closedAt: '2026-07-26T01:02:00.000Z',
};
const noFutureLeak = edgeShortLiveSnapshotForEntry(
  [...samePhase, ...otherPhase, futureLoss],
  candidate,
  Date.parse(candidate.createdAt),
);
assert.equal(noFutureLeak.edgeShortLiveTier, phaseSnapshot.edgeShortLiveTier);
assert.equal(
  noFutureLeak.edgeShortLiveSamplesBeforeEntry,
  phaseSnapshot.edgeShortLiveSamplesBeforeEntry,
);

const outcomeInjected = edgeShortLiveSnapshotForEntry(
  [...samePhase, ...otherPhase],
  {
    ...candidate,
    status: 'CLOSED',
    pnl: -999,
    roe: -999,
  },
  Date.parse(candidate.createdAt),
);
assert.equal(outcomeInjected.edgeShortLiveTier, phaseSnapshot.edgeShortLiveTier);
assert.equal(
  outcomeInjected.edgeShortLiveSamplesBeforeEntry,
  phaseSnapshot.edgeShortLiveSamplesBeforeEntry,
);

const newSnapshot = edgeShortLiveSnapshotForEntry(
  samePhase.slice(0, 7),
  candidate,
  Date.parse(candidate.createdAt),
);
assert.equal(newSnapshot.edgeShortLiveTier, 'NEW');
assert.equal(newSnapshot.edgeShortLiveSamplesBeforeEntry, 7);

const notBest = edgeShortLiveSnapshotForEntry(
  [...samePhase, ...otherPhase],
  { ...candidate, id: 'not-best', edgeShortBestSelected: false },
  Date.parse(candidate.createdAt),
);
assert.equal(notBest.edgeShortLiveEligible, false);
assert.equal(notBest.edgeShortLiveTier, 'N_A');
assert.equal(notBest.edgeShortLiveLabel, 'SE LIVE N/A');

const stored = {
  ...candidate,
  ...phaseSnapshot,
  edgeShortLiveTier: 'COOL',
  edgeShortLiveLabel: 'SE LIVE COOL',
  edgeShortLiveDerived: false,
};
const decorated = decorateEdgeShortLiveSnapshots([
  ...samePhase,
  ...otherPhase,
  stored,
]);
const preserved = decorated.find((trade) => trade.id === stored.id);
assert.equal(preserved.edgeShortLiveTier, 'COOL');
assert.equal(preserved.edgeShortLiveDerived, false);

const stats = edgeShortLiveStats([
  {
    ...candidate,
    ...phaseSnapshot,
    status: 'CLOSED',
    pnl: 2,
    roe: 5,
  },
  {
    ...candidate,
    id: 'cool-result',
    ...phaseSnapshot,
    edgeShortLiveTier: 'COOL',
    edgeShortLiveLabel: 'SE LIVE COOL',
    status: 'CLOSED',
    pnl: -1,
    roe: -3,
  },
  {
    ...candidate,
    id: 'active-hot',
    ...fallbackSnapshot,
    status: 'OPEN',
    pnl: 0.4,
    roe: 4,
  },
]);
const okStats = stats.find((row) => row.tier === 'OK');
const hotStats = stats.find((row) => row.tier === 'HOT');
const coolStats = stats.find((row) => row.tier === 'COOL');
assert.equal(okStats.closed, 1);
assert.equal(okStats.closedPnl, 2);
assert.equal(hotStats.active, 1);
assert.equal(hotStats.activePnl, 0.4);
assert.equal(coolStats.losses, 1);
assert.equal(coolStats.closedPnl, -1);

console.log('Edge Short SE LIVE tests passed: causal rolling snapshots and observe-only guardrails are correct.');
