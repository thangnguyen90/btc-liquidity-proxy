import assert from 'node:assert/strict';
import {
  EDGE_SHORT_LABEL_VERSION,
  decorateEdgeShortLabelSnapshots,
  edgeShortLabelGroup,
  edgeShortLabelGroupStats,
  edgeShortLabelSnapshot,
  edgeShortLabelSnapshotForEntry,
  edgeShortLabelStatsBefore,
  edgeShortLabelVerdict,
} from '../src/edgeShortLabel.js';
import {
  EDGE_SHORT_TIER_VERSION,
  decorateEdgeShortTierSnapshots,
  edgeShortSideBtcLayer,
  edgeShortTierSnapshot,
  edgeShortTierStats,
} from '../src/edgeShortTier.js';

function closedTrade(index, {
  openedAt,
  closedAt,
  pnl = 0.3,
  roe = 3,
} = {}) {
  return {
    id: `closed-${index}`,
    status: 'CLOSED',
    side: 'SHORT',
    pumpSignalType: 'early_dump',
    pumpSignalTimeframe: '15m',
    pumpCombo: 'EARLY_DUMP | SHORT | 15M | BTC_CORR_THEO | BTC_DOWN_MID | THUAN_BTC | GATE_-',
    btcCorr: 0.7,
    btcTrendDir: 'down',
    pnl,
    roe,
    openedAt,
    createdAt: openedAt,
    closedAt,
  };
}

const baseAt = Date.parse('2026-07-21T12:00:00.000Z');
const prior = Array.from({ length: 30 }, (_, index) => closedTrade(index, {
  openedAt: new Date(baseAt - (index + 1_800) * 60_000).toISOString(),
  closedAt: new Date(baseAt - (index + 1_500) * 60_000).toISOString(),
}));
const future = Array.from({ length: 20 }, (_, index) => closedTrade(index + 100, {
  openedAt: new Date(baseAt - (index + 20) * 60_000).toISOString(),
  closedAt: new Date(baseAt + (index + 10) * 60_000).toISOString(),
  pnl: -3,
  roe: -30,
}));
const candidate = {
  id: 'candidate',
  status: 'OPEN',
  side: 'SHORT',
  pumpSignalType: 'early_dump',
  pumpSignalTimeframe: '15m',
  pumpCombo: 'EARLY_DUMP | SHORT | 15M | BTC_CORR_THEO | BTC_DOWN_MID | THUAN_BTC | GATE_-',
  btcCorr: 0.7,
  btcTrendDir: 'down',
  pnl: 1.25,
  roe: 12.5,
  openedAt: new Date(baseAt).toISOString(),
  createdAt: new Date(baseAt).toISOString(),
};

const group = edgeShortLabelGroup(candidate);
assert.equal(group.key, 'EARLY_DUMP | SHORT | 15M | THUAN_BTC');

const beforeStats = edgeShortLabelStatsBefore([...prior, ...future], candidate, baseAt);
assert.equal(beforeStats.closed, 30, 'future-closed trades must not be visible before entry');
const snapshot = edgeShortLabelSnapshot(candidate, beforeStats);
assert.equal(snapshot.edgeShortLabel, 'SE PRIME');
assert.equal(snapshot.edgeShortLabelSamplesBeforeEntry, 30);
assert.equal(snapshot.edgeShortLabelObservationOnly, true);
assert.equal(snapshot.edgeShortLabelVersion, EDGE_SHORT_LABEL_VERSION);

const sameDayLate = {
  ...candidate,
  id: 'same-day-late',
  openedAt: '2026-07-21T23:00:00.000Z',
  createdAt: '2026-07-21T23:00:00.000Z',
};
const decorated = decorateEdgeShortLabelSnapshots([
  ...prior,
  candidate,
  ...future,
  sameDayLate,
]);
const decoratedCandidate = decorated.find((trade) => trade.id === candidate.id);
assert.equal(decoratedCandidate.edgeShortLabel, 'SE PRIME');
assert.equal(decoratedCandidate.edgeShortLabelSamplesBeforeEntry, 30);
assert.equal(decoratedCandidate.edgeShortLabelFrozenDay, '2026-07-21');

const decoratedLate = decorated.find((trade) => trade.id === sameDayLate.id);
assert.equal(decoratedLate.edgeShortLabel, 'SE PRIME');
assert.equal(
  decoratedLate.edgeShortLabelSamplesBeforeEntry,
  30,
  'same-day closes must not change the frozen daily label',
);
assert.equal(
  decoratedLate.edgeShortLabelReason,
  decoratedCandidate.edgeShortLabelReason,
  'same fingerprint must share one label basis for the whole UTC day',
);

const entrySnapshot = edgeShortLabelSnapshotForEntry(
  [...prior, ...future],
  sameDayLate,
  Date.parse(sameDayLate.createdAt),
);
assert.equal(entrySnapshot.edgeShortLabel, 'SE PRIME');
assert.equal(entrySnapshot.edgeShortLabelSamplesBeforeEntry, 30);
assert.equal(entrySnapshot.edgeShortLabelFrozenDay, '2026-07-21');

const earlyTrade = decorated.find((trade) => trade.id === 'closed-0');
assert.equal(earlyTrade.edgeShortLabel, 'SE NO DATA');

const storedSnapshot = {
  ...candidate,
  id: 'stored',
  edgeShortLabelKey: group.key,
  edgeShortLabelGroup: group.label,
  edgeShortLabelTier: 'WATCH',
  edgeShortLabel: 'SE WATCH',
  edgeShortLabelFrozenDay: '2026-07-21',
  edgeShortLabelVersion: EDGE_SHORT_LABEL_VERSION,
};
const preserved = decorateEdgeShortLabelSnapshots([...prior, storedSnapshot])
  .find((trade) => trade.id === 'stored');
assert.equal(preserved.edgeShortLabel, 'SE WATCH', 'stored entry snapshot must remain immutable');

const primeEntryMetrics = {
  closed: 100,
  wins: 75,
  losses: 25,
  breakeven: 0,
  closedPnl: 25,
  wr: 75,
  avgRoe: 2.6,
};
assert.equal(
  edgeShortLabelVerdict(primeEntryMetrics, 'THUAN_BTC').tier,
  'PRIME',
);
assert.equal(
  edgeShortLabelVerdict(
    { ...primeEntryMetrics, avgRoe: 1.6 },
    'THUAN_BTC',
    'PRIME',
  ).tier,
  'PRIME',
  'PRIME must stay stable inside the 1.5%-2.5% buffer',
);
assert.equal(
  edgeShortLabelVerdict(
    { ...primeEntryMetrics, avgRoe: 0.3 },
    'THUAN_BTC',
    'GOOD',
  ).tier,
  'GOOD',
  'GOOD must stay stable inside the 0.25%-0.75% buffer',
);
assert.equal(
  edgeShortLabelVerdict(
    { ...primeEntryMetrics, avgRoe: 0.3 },
    'THUAN_BTC',
  ).tier,
  'WATCH',
);
assert.equal(
  edgeShortLabelVerdict(
    { ...primeEntryMetrics, closedPnl: -10, avgRoe: -0.8 },
    'THUAN_BTC',
  ).tier,
  'RISK',
);

const labelStats = edgeShortLabelGroupStats([
  { ...decoratedCandidate, status: 'OPEN', pnl: 1.25 },
  {
    ...decoratedCandidate,
    id: 'prime-closed',
    status: 'CLOSED',
    pnl: 0.5,
    roe: 5,
  },
]);
const primeStats = labelStats.find((row) => row.label === 'SE PRIME');
assert.equal(primeStats.active, 1);
assert.equal(primeStats.closed, 1);
assert.equal(primeStats.closedPnl, 0.5);
assert.equal(primeStats.activePnl, 1.25);
assert.equal(primeStats.totalPnl, 1.75);

const bearishBtcCandle = {
  name: 'BEARISH_CANDLE',
  direction: 'BEARISH',
  timeframe: '5m',
};
const bullishBtcCandle = {
  name: 'BULLISH_CANDLE',
  direction: 'BULLISH',
  timeframe: '5m',
};
const tierA = edgeShortTierSnapshot({
  ...decoratedCandidate,
  edgeShortLabelTier: 'PRIME',
  edgeShortLabel: 'SE PRIME',
  btcTrendDir: 'down',
  btcCandlePatternAtEntry: bearishBtcCandle,
});
assert.equal(tierA.edgeShortCoreTier, 'GOOD');
assert.equal(tierA.edgeShortSideBtcTier, 'GOOD');
assert.equal(tierA.edgeShortTier, 'A');
assert.equal(tierA.edgeShortTierObservationOnly, true);
assert.equal(tierA.edgeShortTierAffectsEntry, false);
assert.equal(tierA.edgeShortTierAffectsMargin, false);

const tierB = edgeShortTierSnapshot({
  ...decoratedCandidate,
  edgeShortLabelTier: 'WATCH',
  edgeShortLabel: 'SE WATCH',
  btcTrendDir: 'down',
  btcCandlePatternAtEntry: bearishBtcCandle,
});
assert.equal(tierB.edgeShortCoreTier, 'WATCH');
assert.equal(tierB.edgeShortSideBtcTier, 'GOOD');
assert.equal(tierB.edgeShortTier, 'B');

const blockLabel = edgeShortTierSnapshot({
  ...decoratedCandidate,
  edgeShortLabelTier: 'GOOD',
  edgeShortLabel: 'SE GOOD',
  btcTrendDir: 'up',
  btcCandlePatternAtEntry: bullishBtcCandle,
});
assert.equal(blockLabel.edgeShortSideBtcTier, 'RISK');
assert.equal(blockLabel.edgeShortTier, 'BLOCK');
assert.match(blockLabel.edgeShortTierReason, /không gate\/chặn lệnh/);

assert.equal(
  edgeShortSideBtcLayer({
    side: 'LONG',
    btcTrendDir: 'up',
    btcCandlePatternAtEntry: bullishBtcCandle,
  }).tier,
  'GOOD',
);

const tierStored = {
  ...decoratedCandidate,
  ...tierA,
  edgeShortTierVersion: EDGE_SHORT_TIER_VERSION,
};
const tierPreserved = decorateEdgeShortTierSnapshots([
  {
    ...tierStored,
    btcTrendDir: 'up',
    btcCandlePatternAtEntry: bullishBtcCandle,
  },
])[0];
assert.equal(tierPreserved.edgeShortTier, 'A', 'stored two-layer tier must remain immutable');

const tierStats = edgeShortTierStats([
  { ...tierStored, status: 'OPEN', pnl: 1.25 },
  { ...tierStored, id: 'tier-a-closed', status: 'CLOSED', pnl: 0.5, roe: 5 },
  { ...decoratedCandidate, ...blockLabel, id: 'tier-block-closed', status: 'CLOSED', pnl: -0.3, roe: -30 },
]);
const tierAStats = tierStats.find((row) => row.tier === 'A');
const tierBlockStats = tierStats.find((row) => row.tier === 'BLOCK');
assert.equal(tierAStats.active, 1);
assert.equal(tierAStats.closed, 1);
assert.equal(tierAStats.totalPnl, 1.75);
assert.equal(tierBlockStats.closed, 1);
assert.equal(tierBlockStats.closedPnl, -0.3);

console.log('edge short label tests: OK');
