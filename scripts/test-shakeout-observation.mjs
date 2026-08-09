import assert from 'node:assert/strict';
import {
  SHAKEOUT_OBSERVATION_VERSION,
  buildShakeoutObservationStats,
  enrichShakeoutObservation,
  evaluateShakeoutObservation,
} from '../src/shakeoutObservation.js';

const base = {
  id: 'obs-1',
  createdAt: '2026-07-26T08:00:00.000Z',
  signalAt: '2026-07-26T08:00:00.000Z',
  symbol: 'TESTUSDT',
  side: 'LONG',
  shakeoutClass: 'CLEAN_RECLAIM',
  stage: 'RECLAIM_CONFIRMED',
  variant: 'MARKET',
  signalTimeframe: '5m',
  score: 82,
  shakeoutEntryMode: 'MARKET',
  entryDistancePct: 0.3,
  shakeoutProjectedRoe: 32,
  shakeoutObservationRiskPct: 2,
  shakeoutObservationRewardPct: 4,
  shakeoutObservationRr: 2,
  shakeoutSignalChange24hPct: 12,
  shakeoutSignalQuoteVolume: 35_000_000,
  btcPhase: 'BTC_UP_MID',
  btcCorr: 0.62,
  btcRelation: { beta: 1.4 },
  btcRelationLabel: 'THUAN_BTC',
  btcMarketRegimeAtSignal: 'TREND',
  candlePatternAtEntry: { name: 'BULLISH_ENGULFING' },
  btcCandlePatternAtEntry: { name: 'DOJI' },
  shakeoutSignalFactors: {
    move5mPct: 18,
    move15mPct: 24,
    drop5mPct: 7,
    retrace5mPct: 38,
    vol5mX: 4.2,
    vol15mX: 3.4,
    emaZoneDistPct: 0.8,
    reclaimPct: 5.1,
    pullbackAge5m: 4,
    wickRejectPct: 48,
    rsi5m: 58,
    rsi15m: 55,
    bottomDeclinePct: null,
    bottomReboundPct: null,
    bottomLowAge15m: null,
  },
};

const evaluated = evaluateShakeoutObservation(base);
assert.equal(evaluated.shakeoutObservationVersion, SHAKEOUT_OBSERVATION_VERSION);
assert.equal(evaluated.shakeoutObservationOnly, true);
assert.equal(evaluated.shakeoutObservationCoverage, 'FULL');
assert.equal(evaluated.shakeoutObservationBuckets.volume5m, 'VOL_3_5X');
assert.equal(evaluated.shakeoutObservationBuckets.reclaim, 'RECLAIM_4_5_7');
assert.match(evaluated.shakeoutObservationLayer1Key, /CLEAN_RECLAIM/);
assert.match(evaluated.shakeoutObservationLayer2Key, /RR_2_PLUS/);
assert.match(evaluated.shakeoutObservationLayer3Key, /BTC_CORR_THEO/);

const outcomeChanged = evaluateShakeoutObservation({
  ...base,
  status: 'CLOSED',
  outcome: 'SL',
  pnl: -999,
  netPnl: -999,
  roe: -999,
  netRoe: -999,
  peakRoe: 999,
});
assert.deepEqual(
  outcomeChanged,
  evaluated,
  'observation snapshot must not read status/outcome/PnL/ROE/peak ROE',
);
assert.equal('pnl' in evaluated.shakeoutObservationSnapshot, false);
assert.equal('outcome' in evaluated.shakeoutObservationSnapshot, false);

const stored = { ...base, ...evaluated };
const enrichedStored = enrichShakeoutObservation(stored);
assert.equal(enrichedStored.shakeoutObservationDerived, false);
assert.deepEqual(enrichedStored.shakeoutObservationSnapshot, evaluated.shakeoutObservationSnapshot);

const filled = evaluateShakeoutObservation({
  id: stored.id,
  side: stored.side,
  shakeoutClass: stored.shakeoutClass,
  stage: stored.stage,
  variant: stored.variant,
  signalTimeframe: stored.signalTimeframe,
  ...evaluated,
  shakeoutObservationCapturedAt: '2026-07-26T08:30:00.000Z',
  symbolCandleAtEntry: { name: 'HAMMER' },
  btcCandleAtEntry: { name: 'BULLISH_CANDLE' },
  shakeoutObservationRiskPct: 1.5,
  shakeoutObservationRewardPct: 3,
});
assert.equal(filled.shakeoutObservationSnapshot.entryMode, 'MARKET');
assert.equal(filled.shakeoutObservationSnapshot.quoteVolume, 35_000_000);
assert.equal(filled.shakeoutObservationSnapshot.factors.vol5mX, 4.2);
assert.equal(filled.shakeoutObservationSnapshot.symbolCandle, 'HAMMER');

const legacy = enrichShakeoutObservation({
  id: 'legacy-1',
  side: 'SHORT',
  variant: 'PENDING',
  shakeoutClass: 'WEAK_REJECT',
  createdAt: '2026-07-25T08:00:00.000Z',
});
assert.equal(legacy.shakeoutObservationCoverage, 'LEGACY');
assert.equal(legacy.shakeoutObservationDerived, true);

const stats = buildShakeoutObservationStats([
  {
    ...stored,
    status: 'CLOSED',
    outcome: 'TP',
    closedAt: '2026-07-26T09:00:00.000Z',
    netPnl: 1.5,
    netRoe: 7.5,
  },
  {
    ...stored,
    id: 'obs-open',
    status: 'OPEN',
    netPnl: 0.25,
    netRoe: 1.25,
  },
  legacy,
]);
assert.equal(stats.mode, 'ANALYSIS_ONLY');
assert.equal(stats.canAffectTrading, false);
assert.equal(stats.coverage.find((row) => row.key === 'FULL')?.closed, 1);
assert.equal(stats.coverage.find((row) => row.key === 'FULL')?.open, 1);
assert.equal(stats.coverage.find((row) => row.key === 'LEGACY')?.total, 1);
assert.equal(stats.scope.paginated, false);
assert.equal(stats.badges.length, 1);
assert.equal(stats.badges[0].total, 2);
assert.equal(stats.badges[0].closed, 1);
assert.equal(stats.badges[0].open, 1);
assert.equal(stats.badges[0].pnl, 1.5);
assert.equal(stats.badges[0].activePnl, 0.25);
assert.equal(stats.badges[0].totalPnl, 1.75);
assert.equal(stats.matrix.length, 1, 'an active FULL matrix is shown early for monitoring');
assert.equal(stats.matrix[0].closed, 1);
assert.equal(stats.matrix[0].open, 1);

console.log('Shakeout observation tests passed: causal snapshot, coverage and analysis-only stats are correct.');
