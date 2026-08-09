import assert from 'node:assert/strict';
import {
  buildShakeoutPaperAggregateStats,
  evaluateShakeoutMarketIndependentObservation,
} from '../src/shakeoutPaperStats.js';

const base = {
  signalType: 'SHAKEOUT_RECLAIM',
  shakeoutClass: 'CLEAN_RECLAIM',
  side: 'LONG',
  signalTimeframe: '5m',
  shakeoutQuality: 'CHASE',
  shakeoutBtcGateLabel: 'GATE_OK',
  shakeoutRealGateLabel: 'REAL_TEST',
  shakeoutStage2Tier: 'WATCH_PLUS',
  shakeoutStage2Layer1Tier: 'GOOD',
  shakeoutStage2Setup: 'CLEAN_RECLAIM',
  shakeoutStage2Variant: 'MARKET',
  shakeoutStage2FillQuality: 'GOOD_FILL',
  shakeoutStage2AuditCaptured: true,
  shakeoutStage2Flags: [],
  variant: 'MARKET',
  score: 82,
};

const trades = [
  {
    ...base,
    id: 'closed-win',
    createdAt: '2026-07-25T01:00:00.000Z',
    status: 'CLOSED',
    outcome: 'TP',
    netPnl: 4,
    netRoe: 8,
    shakeoutCombo: 'COMBO_A',
  },
  {
    ...base,
    id: 'closed-loss',
    createdAt: '2026-07-25T02:00:00.000Z',
    status: 'CLOSED',
    outcome: 'SL',
    netPnl: -1,
    netRoe: -2,
    shakeoutCombo: 'COMBO_A',
  },
  {
    ...base,
    id: 'open',
    createdAt: '2026-07-26T03:00:00.000Z',
    status: 'OPEN',
    netPnl: 2,
    netRoe: 4,
    shakeoutCombo: 'COMBO_B',
    shakeoutStage2Tier: 'WATCH',
  },
  {
    ...base,
    id: 'pending',
    createdAt: '2026-07-26T04:00:00.000Z',
    status: 'PENDING',
    shakeoutCombo: 'COMBO_B',
    shakeoutStage2Tier: 'RISK',
  },
];

const allStats = buildShakeoutPaperAggregateStats(trades, { day: 'all' });
assert.equal(allStats.scope.paginated, false);
assert.equal(allStats.scope.total, 4);
assert.equal(allStats.chase.total.total, 4);
assert.equal(allStats.chase.total.closed, 2);
assert.equal(allStats.chase.total.pnl, 3);
assert.deepEqual(allStats.chase.shortTiers, []);
assert.equal(allStats.combos.find((row) => row.combo === 'COMBO_A')?.total, 2);
assert.equal(allStats.stage2.scopeTotal, 4);
assert.equal(allStats.stage2.twoLayerTotal, 4);
assert.equal(
  allStats.stage2.tiers.reduce((sum, row) => sum + row.total, 0),
  4,
);
assert.equal(
  allStats.signalScore.rows.reduce((sum, row) => sum + row.total, 0),
  4,
);

const selectedDayStats = buildShakeoutPaperAggregateStats(
  trades.filter((trade) => trade.createdAt.startsWith('2026-07-26')),
  { day: '2026-07-26' },
);
assert.equal(selectedDayStats.scope.total, 2);
assert.equal(selectedDayStats.chase.total.total, 2);
assert.equal(
  selectedDayStats.signalScore.rows.reduce((sum, row) => sum + row.total, 0),
  2,
);

// Simulate page size 1: aggregate remains based on all four rows, while only
// the paper table is allowed to slice the list.
const pageRows = trades.slice(0, 1);
assert.equal(pageRows.length, 1);
assert.equal(allStats.scope.total, 4);
assert.equal(allStats.chase.total.total, 4);

const chaseShortStats = buildShakeoutPaperAggregateStats([
  {
    ...base,
    id: 'chase-short-a-score',
    variant: 'CHASE',
    side: 'SHORT',
    score: 68,
    btcPhase: 'BTC_UP_MID',
    createdAt: '2026-07-26T05:00:00.000Z',
    status: 'CLOSED',
    outcome: 'TP',
    netPnl: 2,
    netRoe: 20,
  },
  {
    ...base,
    id: 'chase-short-a-btc',
    variant: 'CHASE',
    side: 'SHORT',
    score: 58,
    btcPhase: 'BTC_DOWN_MID',
    createdAt: '2026-07-26T06:00:00.000Z',
    status: 'CLOSED',
    outcome: 'TP',
    netPnl: 1,
    netRoe: 10,
  },
  {
    ...base,
    id: 'chase-short-b',
    variant: 'CHASE',
    side: 'SHORT',
    score: 62,
    btcPhase: 'BTC_DOWN_MID',
    createdAt: '2026-07-26T07:00:00.000Z',
    status: 'CLOSED',
    outcome: 'SL',
    netPnl: -1,
    netRoe: -10,
  },
], { day: 'all' });
assert.equal(chaseShortStats.chase.shortTiers.length, 2);
assert.equal(
  chaseShortStats.chase.shortTiers.find((row) => row.key.includes('A ·'))?.total,
  2,
);
assert.equal(
  chaseShortStats.chase.shortTiers.find((row) => row.key.includes('B/TEST'))?.total,
  1,
);

const longObservation = evaluateShakeoutMarketIndependentObservation({
  side: 'LONG',
  variant: 'MARKET',
  btcRelationLabel: 'DOC_LAP',
});
assert.equal(longObservation.shakeoutMarketIndependentApplies, true);
assert.equal(longObservation.shakeoutMarketIndependentTier, 'LONG_EDGE');
assert.equal(longObservation.shakeoutMarketIndependentOnly, true);

const shortObservation = evaluateShakeoutMarketIndependentObservation({
  side: 'SHORT',
  variant: 'MARKET',
  btcCorr: 0.12,
});
assert.equal(shortObservation.shakeoutMarketIndependentTier, 'SHORT_NO_EDGE');
const shortProbeObservation = evaluateShakeoutMarketIndependentObservation({
  side: 'SHORT',
  variant: 'MARKET',
  btcRelationLabel: 'DOC_LAP',
  shakeoutClass: 'WEAK_REJECT',
  highJumpRisk: true,
  score: 61,
  btcPhase: 'BTC_UP_MID',
});
assert.equal(shortProbeObservation.shakeoutMarketIndependentTier, 'SHORT_PROBE');
assert.equal(shortProbeObservation.shakeoutMarketIndependentLabel, 'OBS SHORT PROBE');
assert.equal(shortProbeObservation.shakeoutMarketIndependentShortProbePreferred, true);
assert.equal(
  evaluateShakeoutMarketIndependentObservation({
    side: 'LONG',
    variant: 'PENDING',
    btcRelationLabel: 'DOC_LAP',
  }).shakeoutMarketIndependentApplies,
  false,
);

const marketIndependentStats = buildShakeoutPaperAggregateStats([
  {
    ...base,
    id: 'mi-long-win',
    side: 'LONG',
    variant: 'MARKET',
    btcRelationLabel: 'DOC_LAP',
    status: 'CLOSED',
    outcome: 'TP',
    createdAt: '2026-07-24T01:00:00.000Z',
    openedAt: '2026-07-24T01:00:00.000Z',
    netPnl: 2,
    netRoe: 20,
  },
  {
    ...base,
    id: 'mi-long-open',
    side: 'LONG',
    variant: 'MARKET',
    btcRelationLabel: 'BTC_CORR_RAC',
    status: 'OPEN',
    createdAt: '2026-07-25T01:00:00.000Z',
    openedAt: '2026-07-25T01:00:00.000Z',
    netPnl: 0.5,
    netRoe: 5,
  },
  {
    ...base,
    id: 'mi-short-loss',
    side: 'SHORT',
    variant: 'MARKET',
    btcCorr: 0.1,
    status: 'CLOSED',
    outcome: 'SL',
    createdAt: '2026-07-24T02:00:00.000Z',
    openedAt: '2026-07-24T02:00:00.000Z',
    netPnl: -1,
    netRoe: -10,
  },
  {
    ...base,
    id: 'mi-short-probe-win',
    side: 'SHORT',
    variant: 'MARKET',
    btcRelationLabel: 'DOC_LAP',
    shakeoutClass: 'WEAK_REJECT',
    highJumpRisk: true,
    score: 61,
    btcPhase: 'BTC_UP_MID',
    status: 'CLOSED',
    outcome: 'TP',
    createdAt: '2026-07-25T02:00:00.000Z',
    openedAt: '2026-07-25T02:00:00.000Z',
    netPnl: 1.5,
    netRoe: 15,
  },
  {
    ...base,
    id: 'mi-not-applicable',
    side: 'LONG',
    variant: 'PENDING',
    btcRelationLabel: 'DOC_LAP',
    status: 'CLOSED',
    outcome: 'TP',
    createdAt: '2026-07-24T03:00:00.000Z',
    openedAt: '2026-07-24T03:00:00.000Z',
    netPnl: 99,
    netRoe: 99,
  },
], { day: 'all' }).marketIndependent;
assert.equal(marketIndependentStats.mode, 'OBSERVE_ONLY');
assert.equal(marketIndependentStats.canAffectTrading, false);
const miLong = marketIndependentStats.groups.find((row) => row.side === 'LONG');
const miShortProbe = marketIndependentStats.groups.find((row) => row.tier === 'SHORT_PROBE');
const miShortNoEdge = marketIndependentStats.groups.find((row) => row.tier === 'SHORT_NO_EDGE');
assert.equal(miLong.total, 2);
assert.equal(miLong.closed, 1);
assert.equal(miLong.open, 1);
assert.equal(miLong.closedPnl, 2);
assert.equal(miLong.activePnl, 0.5);
assert.equal(miLong.daily.find((row) => row.day === '2026-07-24')?.closed, 1);
assert.equal(miShortProbe.total, 1);
assert.equal(miShortProbe.closedPnl, 1.5);
assert.equal(miShortProbe.daily.find((row) => row.day === '2026-07-25')?.closed, 1);
assert.equal(miShortNoEdge.total, 1);
assert.equal(miShortNoEdge.closedPnl, -1);

const shortWaveStats = buildShakeoutPaperAggregateStats([
  {
    ...base,
    id: 'wave-family-a-market',
    signalId: 'wave-family-a',
    side: 'SHORT',
    shakeoutClass: 'WEAK_REJECT',
    score: 65,
    variant: 'MARKET',
    signalAt: '2026-06-21T10:00:00.000Z',
    createdAt: '2026-06-21T10:00:00.000Z',
    openedAt: '2026-06-21T10:00:00.000Z',
    status: 'CLOSED',
    outcome: 'TP',
    netPnl: 2,
    netRoe: 20,
  },
  {
    ...base,
    id: 'wave-family-a-pending-clone',
    signalId: 'wave-family-a',
    side: 'SHORT',
    shakeoutClass: 'WEAK_REJECT',
    score: 65,
    variant: 'PENDING',
    signalAt: '2026-06-21T10:01:00.000Z',
    createdAt: '2026-06-21T10:01:00.000Z',
    status: 'PENDING',
  },
  {
    ...base,
    id: 'wave-family-b',
    signalId: 'wave-family-b',
    side: 'SHORT',
    shakeoutClass: 'WEAK_REJECT',
    score: 70,
    variant: 'MARKET',
    signalAt: '2026-06-21T11:00:00.000Z',
    createdAt: '2026-06-21T11:00:00.000Z',
    openedAt: '2026-06-21T11:00:00.000Z',
    status: 'CLOSED',
    outcome: 'SL',
    netPnl: -1,
    netRoe: -10,
  },
  {
    ...base,
    id: 'wave-family-c-too-late',
    signalId: 'wave-family-c',
    side: 'SHORT',
    shakeoutClass: 'WEAK_REJECT',
    score: 79,
    variant: 'MARKET',
    signalAt: '2026-06-21T13:01:00.000Z',
    createdAt: '2026-06-21T13:01:00.000Z',
    openedAt: '2026-06-21T13:01:00.000Z',
    status: 'CLOSED',
    outcome: 'TP',
    netPnl: 1,
    netRoe: 10,
  },
  {
    ...base,
    id: 'wave-before-valid-log',
    signalId: 'wave-before-valid-log',
    side: 'SHORT',
    shakeoutClass: 'WEAK_REJECT',
    score: 65,
    variant: 'MARKET',
    signalAt: '2026-06-20T23:59:00.000Z',
    createdAt: '2026-06-20T23:59:00.000Z',
    status: 'CLOSED',
    outcome: 'TP',
    netPnl: 99,
    netRoe: 99,
  },
], { day: 'all' }).shortWave;
assert.equal(shortWaveStats.mode, 'OBSERVE_ONLY');
assert.equal(shortWaveStats.canAffectTrading, false);
assert.equal(shortWaveStats.dataStart, '2026-06-21');
assert.equal(shortWaveStats.windowMinutes, 120);
const wave = shortWaveStats.groups.find((row) => row.tier === 'WAVE');
const isolated = shortWaveStats.groups.find((row) => row.tier === 'ISOLATED');
assert.equal(wave.total, 1);
assert.equal(wave.closed, 1);
assert.equal(wave.closedPnl, -1);
assert.equal(isolated.total, 2);
assert.equal(isolated.closed, 2);
assert.equal(isolated.pending, 0);
assert.equal(isolated.closedPnl, 3);
assert.equal(wave.daily.find((row) => row.day === '2026-06-21')?.closed, 1);

console.log('Shakeout paper stats test passed: aggregates are global and pagination only slices rows.');
