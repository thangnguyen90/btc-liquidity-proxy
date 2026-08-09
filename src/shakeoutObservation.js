export const SHAKEOUT_OBSERVATION_VERSION = 'SHAKEOUT_CONTEXT_OBS_V1_20260726';

function finiteNumber(value) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalize(value, fallback = 'NO_DATA') {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || fallback;
}

function candleName(value) {
  return normalize(value && typeof value === 'object'
    ? (value.name ?? value.pattern ?? value.label ?? value.direction)
    : value);
}

function scoreBucket(value) {
  const score = finiteNumber(value);
  if (score == null) return 'SCORE_NO_DATA';
  if (score >= 85) return 'SCORE_85_PLUS';
  if (score >= 75) return 'SCORE_75_84';
  if (score >= 65) return 'SCORE_65_74';
  if (score >= 55) return 'SCORE_55_64';
  return 'SCORE_LT_55';
}

function volumeBucket(value) {
  const volume = finiteNumber(value);
  if (volume == null) return 'VOL_NO_DATA';
  if (volume >= 5) return 'VOL_5X_PLUS';
  if (volume >= 3) return 'VOL_3_5X';
  if (volume >= 1.7) return 'VOL_1_7_3X';
  return 'VOL_LT_1_7X';
}

function reclaimBucket(value) {
  const reclaim = finiteNumber(value);
  if (reclaim == null) return 'RECLAIM_NO_DATA';
  if (reclaim >= 7) return 'RECLAIM_7_PLUS';
  if (reclaim >= 4.5) return 'RECLAIM_4_5_7';
  if (reclaim >= 2.5) return 'RECLAIM_2_5_4_5';
  return 'RECLAIM_LT_2_5';
}

function moveBucket(value) {
  const move = finiteNumber(value);
  if (move == null) return 'MOVE_NO_DATA';
  if (move >= 30) return 'MOVE_30_PLUS';
  if (move >= 20) return 'MOVE_20_30';
  if (move >= 12) return 'MOVE_12_20';
  return 'MOVE_LT_12';
}

function wickBucket(value) {
  const wick = finiteNumber(value);
  if (wick == null) return 'WICK_NO_DATA';
  if (wick >= 55) return 'WICK_55_PLUS';
  if (wick >= 35) return 'WICK_35_55';
  return 'WICK_LT_35';
}

function ageBucket(value) {
  const age = finiteNumber(value);
  if (age == null) return 'AGE_NO_DATA';
  if (age <= 3) return 'AGE_0_3';
  if (age <= 6) return 'AGE_4_6';
  if (age <= 10) return 'AGE_7_10';
  return 'AGE_11_PLUS';
}

function entryDistanceBucket(value) {
  const distance = Math.abs(finiteNumber(value) ?? NaN);
  if (!Number.isFinite(distance)) return 'ENTRY_DIST_NO_DATA';
  if (distance <= 1) return 'ENTRY_DIST_0_1';
  if (distance <= 3) return 'ENTRY_DIST_1_3';
  if (distance <= 5) return 'ENTRY_DIST_3_5';
  return 'ENTRY_DIST_5_PLUS';
}

function rrBucket(value) {
  const rr = finiteNumber(value);
  if (rr == null) return 'RR_NO_DATA';
  if (rr >= 2) return 'RR_2_PLUS';
  if (rr >= 1) return 'RR_1_2';
  if (rr >= 0.5) return 'RR_0_5_1';
  return 'RR_LT_0_5';
}

function corrBucket(value) {
  const corr = finiteNumber(value);
  if (corr == null) return 'BTC_CORR_NO_DATA';
  if (corr >= 0.5) return 'BTC_CORR_THEO';
  if (corr >= 0.3) return 'BTC_CORR_YEU';
  return 'BTC_CORR_RAC';
}

function liquidityBucket(value) {
  const quoteVolume = finiteNumber(value);
  if (quoteVolume == null) return 'LIQ_NO_DATA';
  if (quoteVolume >= 100_000_000) return 'LIQ_100M_PLUS';
  if (quoteVolume >= 20_000_000) return 'LIQ_20_100M';
  if (quoteVolume >= 5_000_000) return 'LIQ_5_20M';
  return 'LIQ_LT_5M';
}

function projectedRoeBucket(value) {
  const roe = finiteNumber(value);
  if (roe == null) return 'TP_ROE_NO_DATA';
  if (roe >= 40) return 'TP_ROE_40_PLUS';
  if (roe >= 30) return 'TP_ROE_30_40';
  if (roe >= 20) return 'TP_ROE_20_30';
  return 'TP_ROE_LT_20';
}

/**
 * Immutable, analysis-only context captured before/at paper entry.
 *
 * This function never reads status, outcome, PnL, ROE, peak ROE or any
 * post-entry field. Its output is safe to persist for causal cohort learning.
 */
export function evaluateShakeoutObservation(input = {}) {
  const previousSnapshot = input.shakeoutObservationSnapshot
    && typeof input.shakeoutObservationSnapshot === 'object'
    ? input.shakeoutObservationSnapshot
    : {};
  const factors = input.shakeoutSignalFactors && typeof input.shakeoutSignalFactors === 'object'
    ? input.shakeoutSignalFactors
    : input.factors && typeof input.factors === 'object'
      ? input.factors
      : previousSnapshot.factors ?? {};
  const side = normalize(input.side ?? input.action, 'SIDE_NO_DATA');
  const setup = normalize(
    input.shakeoutClass ?? input.subtype ?? input.signalType ?? input.type,
    'SETUP_NO_DATA',
  );
  const stage = normalize(input.stage, 'STAGE_NO_DATA');
  const variant = normalize(input.variant, 'VARIANT_NO_DATA');
  const timeframe = normalize(
    input.signalTimeframe ?? input.timeframe ?? input.interval ?? factors.timeframe,
    'TF_NO_DATA',
  );
  const entryMode = normalize(
    input.shakeoutEntryMode ?? input.entryMode
      ?? (input.btcDynamicEntry ? 'BTC_DYNAMIC' : null)
      ?? previousSnapshot.entryMode,
    'ENTRY_MODE_NO_DATA',
  );
  const btcPhase = normalize(
    input.btcPhase ?? input.btcHealth?.btcPhase ?? previousSnapshot.btcPhase,
    'BTC_NO_DATA',
  );
  const symbolCandle = candleName(
    input.symbolCandleAtEntry ?? input.candlePatternAtEntry ?? input.candlePattern5m
      ?? previousSnapshot.symbolCandle,
  );
  const btcCandle = candleName(
    input.btcCandleAtEntry ?? input.btcCandlePatternAtEntry ?? input.btcCandlePattern5m
      ?? previousSnapshot.btcCandle,
  );
  const riskPct = finiteNumber(
    input.shakeoutObservationRiskPct ?? input.riskPct ?? previousSnapshot.riskPct,
  );
  const rewardPct = finiteNumber(
    input.shakeoutObservationRewardPct ?? input.rewardPct ?? previousSnapshot.rewardPct,
  );
  const derivedRr = riskPct != null && riskPct > 0 && rewardPct != null
    ? rewardPct / riskPct
    : null;
  const rr = finiteNumber(
    input.shakeoutObservationRr ?? input.rr ?? derivedRr ?? previousSnapshot.rr,
  );
  const snapshot = {
    capturedAt: String(
      input.shakeoutObservationCapturedAt
        ?? input.signalAt
        ?? input.openedAt
        ?? input.createdAt
        ?? new Date().toISOString(),
    ),
    side,
    setup,
    stage,
    variant,
    timeframe,
    score: finiteNumber(input.score ?? previousSnapshot.score),
    entryMode,
    entryDistancePct: finiteNumber(input.entryDistancePct ?? previousSnapshot.entryDistancePct),
    projectedRoe: finiteNumber(
      input.shakeoutProjectedRoe ?? previousSnapshot.projectedRoe,
    ),
    riskPct,
    rewardPct,
    rr,
    change24hPct: finiteNumber(
      input.shakeoutSignalChange24hPct ?? input.change24h ?? input.change24hPct
        ?? previousSnapshot.change24hPct,
    ),
    quoteVolume: finiteNumber(
      input.shakeoutSignalQuoteVolume ?? input.volume ?? input.quoteVolume
        ?? previousSnapshot.quoteVolume,
    ),
    btcPhase,
    btcCorr: finiteNumber(input.btcCorr ?? factors.btcCorr ?? previousSnapshot.btcCorr),
    btcBeta: finiteNumber(
      input.btcRelation?.beta ?? factors.btcBeta ?? previousSnapshot.btcBeta,
    ),
    btcRelation: normalize(
      input.btcRelationLabel ?? previousSnapshot.btcRelation,
      'REL_NO_DATA',
    ),
    btcMarketRegime: normalize(
      input.btcMarketRegimeAtSignal ?? input.btcMarketRegimeAtEntry
        ?? previousSnapshot.btcMarketRegime,
      'BTC_REGIME_NO_DATA',
    ),
    symbolCandle,
    btcCandle,
    factors: {
      move5mPct: finiteNumber(factors.move5mPct),
      move15mPct: finiteNumber(factors.move15mPct),
      drop5mPct: finiteNumber(factors.drop5mPct),
      retrace5mPct: finiteNumber(factors.retrace5mPct),
      vol5mX: finiteNumber(factors.vol5mX),
      vol15mX: finiteNumber(factors.vol15mX),
      emaZoneDistPct: finiteNumber(factors.emaZoneDistPct),
      reclaimPct: finiteNumber(factors.reclaimPct),
      pullbackAge5m: finiteNumber(factors.pullbackAge5m),
      wickRejectPct: finiteNumber(factors.wickRejectPct),
      rsi5m: finiteNumber(factors.rsi5m),
      rsi15m: finiteNumber(factors.rsi15m),
      bottomDeclinePct: finiteNumber(factors.bottomDeclinePct),
      bottomReboundPct: finiteNumber(factors.bottomReboundPct),
      bottomLowAge15m: finiteNumber(factors.bottomLowAge15m),
    },
  };

  const rawFactorCount = Object.values(snapshot.factors)
    .filter((value) => value != null).length;
  const marketContextCount = [
    snapshot.btcPhase !== 'BTC_NO_DATA' ? 1 : null,
    snapshot.btcCorr,
    snapshot.btcBeta,
    snapshot.symbolCandle !== 'NO_DATA' ? 1 : null,
    snapshot.btcCandle !== 'NO_DATA' ? 1 : null,
    snapshot.quoteVolume,
  ].filter((value) => value != null).length;
  const executionCount = [
    snapshot.entryDistancePct,
    snapshot.projectedRoe,
    snapshot.riskPct,
    snapshot.rewardPct,
    snapshot.rr,
    snapshot.entryMode !== 'ENTRY_MODE_NO_DATA' ? 1 : null,
  ].filter((value) => value != null).length;
  const capturedFeatureCount = rawFactorCount + marketContextCount + executionCount;
  const expectedFeatureCount = 27;
  const coverage = rawFactorCount >= 10 && marketContextCount >= 4 && executionCount >= 3
    ? 'FULL'
    : capturedFeatureCount >= 10
      ? 'PARTIAL'
      : 'LEGACY';
  const buckets = {
    score: scoreBucket(snapshot.score),
    move5m: moveBucket(snapshot.factors.move5mPct),
    move15m: moveBucket(snapshot.factors.move15mPct),
    volume5m: volumeBucket(snapshot.factors.vol5mX),
    volume15m: volumeBucket(snapshot.factors.vol15mX),
    reclaim: reclaimBucket(snapshot.factors.reclaimPct),
    wick: wickBucket(snapshot.factors.wickRejectPct),
    pullbackAge: ageBucket(snapshot.factors.pullbackAge5m),
    entryDistance: entryDistanceBucket(snapshot.entryDistancePct),
    rr: rrBucket(snapshot.rr),
    projectedRoe: projectedRoeBucket(snapshot.projectedRoe),
    btcCorr: corrBucket(snapshot.btcCorr),
    liquidity: liquidityBucket(snapshot.quoteVolume),
  };
  const layer1Key = [
    setup,
    side,
    stage,
    buckets.score,
    timeframe,
  ].join(' | ');
  const layer2Key = [
    variant,
    entryMode,
    buckets.entryDistance,
    buckets.rr,
    buckets.projectedRoe,
  ].join(' | ');
  const layer3Key = [
    btcPhase,
    buckets.btcCorr,
    buckets.liquidity,
    buckets.move5m,
    buckets.volume5m,
    buckets.reclaim,
    buckets.wick,
    buckets.pullbackAge,
    `ALT_${symbolCandle}`,
    `BTC_${btcCandle}`,
  ].join(' | ');

  return {
    shakeoutObservationVersion: SHAKEOUT_OBSERVATION_VERSION,
    shakeoutObservationOnly: true,
    shakeoutObservationCoverage: coverage,
    shakeoutObservationLabel: `${coverage} · ${buckets.volume5m} · ${buckets.reclaim}`,
    shakeoutObservationCapturedAt: snapshot.capturedAt,
    shakeoutObservationCapturedFeatureCount: capturedFeatureCount,
    shakeoutObservationExpectedFeatureCount: expectedFeatureCount,
    shakeoutObservationSnapshot: snapshot,
    shakeoutObservationBuckets: buckets,
    shakeoutObservationLayer1Key: layer1Key,
    shakeoutObservationLayer2Key: layer2Key,
    shakeoutObservationLayer3Key: layer3Key,
    shakeoutObservationComboKey: `${layer1Key} || ${layer2Key} || ${layer3Key}`,
  };
}

export function enrichShakeoutObservation(trade = {}) {
  if (trade.shakeoutObservationVersion && trade.shakeoutObservationSnapshot) {
    return {
      ...trade,
      shakeoutObservationOnly: true,
      shakeoutObservationDerived: false,
    };
  }
  return {
    ...trade,
    ...evaluateShakeoutObservation(trade),
    shakeoutObservationDerived: true,
  };
}

function summarizeGroup(rows, key, label) {
  const closed = rows.filter((trade) => trade.status === 'CLOSED' && trade.outcome !== 'INVALID');
  const active = rows.filter((trade) => trade.status === 'OPEN');
  const wins = closed.filter((trade) => Number(trade.netPnl ?? trade.pnl ?? 0) > 0).length;
  const pnl = closed.reduce((sum, trade) => sum + Number(trade.netPnl ?? trade.pnl ?? 0), 0);
  const activePnl = active.reduce(
    (sum, trade) => sum + Number(trade.netPnl ?? trade.pnl ?? 0),
    0,
  );
  const roe = closed.reduce((sum, trade) => sum + Number(trade.netRoe ?? trade.roe ?? 0), 0);
  const days = new Map();
  for (const trade of closed) {
    const day = String(trade.closedAt ?? trade.createdAt ?? '').slice(0, 10);
    if (!day) continue;
    days.set(day, (days.get(day) ?? 0) + Number(trade.netPnl ?? trade.pnl ?? 0));
  }
  return {
    key,
    label,
    total: rows.length,
    open: active.length,
    pending: rows.filter((trade) => trade.status === 'PENDING').length,
    closed: closed.length,
    wins,
    losses: closed.length - wins,
    winRate: closed.length ? Number((wins / closed.length * 100).toFixed(1)) : null,
    pnl: Number(pnl.toFixed(4)),
    activePnl: Number(activePnl.toFixed(4)),
    totalPnl: Number((pnl + activePnl).toFixed(4)),
    avgRoe: closed.length ? Number((roe / closed.length).toFixed(2)) : null,
    positiveDays: [...days.values()].filter((value) => value > 0).length,
    totalDays: days.size,
  };
}

function groupStats(
  trades,
  keyOf,
  {
    limit = 16,
    minClosed = 0,
    activeFirst = false,
  } = {},
) {
  const groups = new Map();
  for (const trade of trades) {
    const key = keyOf(trade);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(trade);
  }
  return [...groups.entries()]
    .map(([key, rows]) => summarizeGroup(rows, key, key))
    .filter((row) => row.closed >= minClosed || row.open > 0 || row.pending > 0)
    .sort((a, b) => (
      (activeFirst ? b.open - a.open : 0)
      || b.closed - a.closed
      || b.total - a.total
      || Math.abs(b.pnl) - Math.abs(a.pnl)
    ))
    .slice(0, limit);
}

function observationBadgeKey(trade = {}) {
  const coverage = String(trade.shakeoutObservationCoverage ?? 'LEGACY').toUpperCase();
  const captured = Number(trade.shakeoutObservationCapturedFeatureCount ?? 0);
  const expected = Number(trade.shakeoutObservationExpectedFeatureCount ?? 27);
  const buckets = trade.shakeoutObservationBuckets ?? {};
  return [
    `OBS ${coverage}`,
    `${captured}/${expected}`,
    buckets.volume5m ?? 'VOL_NO_DATA',
    buckets.reclaim ?? 'RECLAIM_NO_DATA',
    buckets.btcCorr ?? 'BTC_CORR_NO_DATA',
    buckets.rr ?? 'RR_NO_DATA',
  ].join(' | ');
}

export function buildShakeoutObservationStats(rawTrades = []) {
  const trades = rawTrades.map(enrichShakeoutObservation);
  const usableTrades = trades.filter((trade) =>
    ['FULL', 'PARTIAL'].includes(trade.shakeoutObservationCoverage));
  return {
    version: SHAKEOUT_OBSERVATION_VERSION,
    mode: 'ANALYSIS_ONLY',
    canAffectTrading: false,
    scope: {
      paginated: false,
      filtered: false,
      label: 'ALL_HISTORY',
    },
    badges: groupStats(
      usableTrades,
      observationBadgeKey,
      { limit: 30, activeFirst: true },
    ),
    coverage: ['FULL', 'PARTIAL', 'LEGACY'].map((coverage) => summarizeGroup(
      trades.filter((trade) => trade.shakeoutObservationCoverage === coverage),
      coverage,
      coverage,
    )),
    layer1: groupStats(usableTrades, (trade) => trade.shakeoutObservationLayer1Key),
    layer2: groupStats(usableTrades, (trade) => trade.shakeoutObservationLayer2Key),
    layer3: groupStats(usableTrades, (trade) => trade.shakeoutObservationLayer3Key),
    matrix: groupStats(
      trades.filter((trade) => trade.shakeoutObservationCoverage === 'FULL'),
      (trade) => trade.shakeoutObservationComboKey,
      { limit: 20, minClosed: 2 },
    ),
  };
}
