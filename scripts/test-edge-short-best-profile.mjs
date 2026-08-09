import assert from 'node:assert/strict';
import {
  EDGE_SHORT_BEST_RISK_PHASE_VERSION,
  EDGE_SHORT_BEST_PROFILE_VERSION,
  decorateEdgeShortBestProfileSnapshots,
  edgeShortBestProfileSnapshot,
  edgeShortBestProfileSnapshotForEntry,
  edgeShortBestProfileStats,
  edgeShortBestRiskPhaseStats,
} from '../src/edgeShortBestProfile.js';

function candidate(overrides = {}) {
  return {
    id: 'candidate',
    status: 'OPEN',
    createdAt: '2026-08-01T01:00:00.000Z',
    openedAt: '2026-08-01T01:00:00.000Z',
    side: 'SHORT',
    edgeShortTier: 'A',
    edgeShortBestSelected: true,
    edgeShortBestSetup: 'EARLY_DUMP',
    edgeShortLiveBtcPhase: 'DOWN_MID',
    marketDirectionAtSignal: {
      label: 'MARKET_TRANSITION',
      scores: { short: 40, long: 20 },
      scoreDynamics: { shortWaveState: 'SHORT_BUILDUP' },
    },
    ...overrides,
  };
}

const shortFit = edgeShortBestProfileSnapshotForEntry(candidate());
assert.equal(shortFit.edgeShortBestProfileVersion, EDGE_SHORT_BEST_PROFILE_VERSION);
assert.equal(shortFit.edgeShortBestProfileKey, 'SHORT_FIT');
assert.equal(shortFit.edgeShortBestProfileLabel, 'SE BEST SHORT FIT');
assert.equal(shortFit.edgeShortBestProfileObservationOnly, true);
assert.equal(shortFit.edgeShortBestProfileAffectsEntry, false);
assert.equal(shortFit.edgeShortBestProfileAffectsMargin, false);
assert.equal(shortFit.edgeShortBestProfileAffectsSl, false);
assert.equal(shortFit.edgeShortBestProfileAffectsTp, false);
assert.equal(shortFit.edgeShortBestRiskPhaseKey, 'N_A');

const riskDayBearContinue = edgeShortBestProfileSnapshotForEntry(candidate({
  btcHealth: { pct24h: -2.1 },
  marketDirectionAtSignal: {
    label: 'MARKET_DISPERSION',
    scores: { long: 28, short: 25 },
    scoreDynamics: {
      longWaveState: 'LONG_NEUTRAL',
      longScoreSlope: 0,
      shortWaveState: 'BTC_CRASH_RECLAIM',
      shortScoreSlope: -1,
    },
  },
}));
assert.equal(riskDayBearContinue.edgeShortBestRiskPhaseVersion, EDGE_SHORT_BEST_RISK_PHASE_VERSION);
assert.equal(riskDayBearContinue.edgeShortBestRiskPhaseKey, 'DAY_BEAR_CONTINUE');
assert.equal(riskDayBearContinue.edgeShortBestRiskPhaseLabel, 'RISK DAY BEAR CONTINUE');
assert.equal(riskDayBearContinue.edgeShortBestRiskPhaseObservationOnly, true);
assert.equal(riskDayBearContinue.edgeShortBestRiskPhaseAffectsEntry, false);
assert.equal(riskDayBearContinue.edgeShortBestRiskPhaseAffectsMargin, false);
assert.equal(riskDayBearContinue.edgeShortBestRiskPhaseAffectsSl, false);
assert.equal(riskDayBearContinue.edgeShortBestRiskPhaseAffectsTp, false);

const riskNeutralReversal = edgeShortBestProfileSnapshotForEntry(candidate({
  btcHealth: { pct24h: -0.2 },
  marketDirectionAtSignal: {
    label: 'MARKET_TRANSITION',
    scores: { long: 22, short: 43 },
    scoreDynamics: {
      longWaveState: 'BTC_RALLY_REJECT',
      longScoreSlope: -1,
      shortWaveState: 'SHORT_FADE',
      shortScoreSlope: -2,
    },
  },
}));
assert.equal(riskNeutralReversal.edgeShortBestRiskPhaseKey, 'NEUTRAL_REVERSAL');
assert.equal(riskNeutralReversal.edgeShortBestRiskPhaseLabel, 'RISK NEUTRAL REVERSAL');

const riskMixedWatch = edgeShortBestProfileSnapshotForEntry(candidate({
  btcHealth: { pct24h: 1.2 },
  marketDirectionAtSignal: {
    label: 'MARKET_TRANSITION',
    scores: { long: 35, short: 42 },
    scoreDynamics: {
      longWaveState: 'LONG_NEUTRAL',
      shortWaveState: 'SHORT_FADE',
    },
  },
}));
assert.equal(riskMixedWatch.edgeShortBestRiskPhaseKey, 'MIXED_WATCH');

assert.equal(edgeShortBestProfileSnapshot(candidate({
  marketDirectionAtSignal: {
    label: 'MARKET_TRANSITION',
    scores: { short: 42 },
    scoreDynamics: { shortWaveState: 'SHORT_FADE' },
  },
})).edgeShortBestProfileKey, 'PHASE_RISK');

assert.equal(edgeShortBestProfileSnapshot(candidate({
  marketDirectionAtSignal: {
    label: 'MARKET_DISPERSION',
    scores: { short: 25 },
    scoreDynamics: { shortWaveState: 'SHORT_NEUTRAL' },
  },
})).edgeShortBestProfileKey, 'PHASE_RISK');

assert.equal(edgeShortBestProfileSnapshot(candidate({
  edgeShortTier: 'B',
})).edgeShortBestProfileKey, 'TIER_B_TEST');

assert.equal(edgeShortBestProfileSnapshot(candidate({
  side: 'LONG',
  edgeShortBestSetup: 'KILL_SHORT',
  edgeShortLiveBtcPhase: 'UP_MID',
})).edgeShortBestProfileKey, 'LONG_UP');

assert.equal(edgeShortBestProfileSnapshot(candidate({
  edgeShortBestSetup: 'DUMP',
})).edgeShortBestProfileKey, 'SHORT_OTHER');

assert.equal(edgeShortBestProfileSnapshot(candidate({
  edgeShortBestSelected: false,
})).edgeShortBestProfileKey, 'N_A');

const withInjectedOutcome = edgeShortBestProfileSnapshot(candidate({
  status: 'CLOSED',
  pnl: -999,
  roe: -999,
  outcome: 'SL',
}));
assert.equal(withInjectedOutcome.edgeShortBestProfileKey, shortFit.edgeShortBestProfileKey);

const decorated = decorateEdgeShortBestProfileSnapshots([candidate()]);
assert.equal(decorated[0].edgeShortBestProfileKey, 'SHORT_FIT');
assert.equal(decorated[0].edgeShortBestProfileDerived, true);
assert.equal(decorated[0].edgeShortBestRiskPhaseDerived, true);

const stats = edgeShortBestProfileStats([
  {
    ...candidate(),
    ...shortFit,
    id: 'closed-win',
    status: 'CLOSED',
    pnl: 2,
    roe: 4,
  },
  {
    ...candidate(),
    ...shortFit,
    id: 'active',
    pnl: -0.5,
    roe: -1,
  },
]);
const shortFitStats = stats.find((row) => row.key === 'SHORT_FIT');
assert.equal(shortFitStats.closed, 1);
assert.equal(shortFitStats.active, 1);
assert.equal(shortFitStats.closedPnl, 2);
assert.equal(shortFitStats.activePnl, -0.5);
assert.equal(shortFitStats.positiveDays, 1);

const riskStats = edgeShortBestRiskPhaseStats([
  {
    ...candidate(),
    ...riskDayBearContinue,
    id: 'risk-closed-win',
    status: 'CLOSED',
    pnl: 3,
    roe: 6,
  },
  {
    ...candidate(),
    ...riskDayBearContinue,
    id: 'risk-active',
    status: 'OPEN',
    pnl: -0.4,
    roe: -0.8,
  },
  {
    ...candidate(),
    ...riskNeutralReversal,
    id: 'risk-closed-loss',
    status: 'CLOSED',
    pnl: -2,
    roe: -4,
  },
]);
const riskBearStats = riskStats.find((row) => row.key === 'DAY_BEAR_CONTINUE');
const riskReversalStats = riskStats.find((row) => row.key === 'NEUTRAL_REVERSAL');
assert.equal(riskBearStats.closed, 1);
assert.equal(riskBearStats.active, 1);
assert.equal(riskBearStats.closedPnl, 3);
assert.equal(riskBearStats.activePnl, -0.4);
assert.equal(riskBearStats.dayTimeZone, 'Asia/Bangkok');
assert.equal(riskReversalStats.closed, 1);
assert.equal(riskReversalStats.closedPnl, -2);

console.log('Edge Short SE BEST profile/risk-phase tests passed: pre-entry labels and observe-only guardrails are correct.');
