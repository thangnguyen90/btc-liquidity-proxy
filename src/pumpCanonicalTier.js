export const PUMP_CANONICAL_TIER_VERSION = 'PUMP_CANONICAL_TIER_V2_20260726';
// Walk-forward 2026-07-20..2026-07-26 did not validate the candidate ranking
// (prediction correlation -0.052; the physical RISK bucket beat GOOD).
// Keep candidate results for audit, but runtime stays COLLECT until a later
// out-of-sample run proves stable ordering across days.
export const PUMP_CANONICAL_RUNTIME_VALIDATED = false;

const WINDOW_CONFIG = [
  { name: '1d', days: 1, weight: 0.35 },
  { name: '3d', days: 3, weight: 0.30 },
  { name: '7d', days: 7, weight: 0.25 },
  { name: '14d', days: 14, weight: 0.10 },
];
const TIER_ORDER = ['A', 'B', 'WATCH', 'BLOCK'];

function finite(value, fallback = null) {
  if (value == null || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function token(value, fallback = 'NO_DATA') {
  const normalized = String(value ?? '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || fallback;
}

function dateOf(trade = {}) {
  return String(trade.createdAt ?? trade.openedAt ?? '').slice(0, 10);
}

function scoreOf(trade = {}) {
  return finite(
    trade.score
      ?? trade.pumpScore
      ?? String(trade.source ?? '').match(/^pump-(\d+)/i)?.[1],
  );
}

function scoreBucket(value) {
  const score = finite(value);
  if (score == null) return 'SCORE_NO_DATA';
  if (score >= 90) return 'SCORE_90_PLUS';
  if (score >= 80) return 'SCORE_80_89';
  if (score >= 75) return 'SCORE_75_79';
  return 'SCORE_LT_75';
}

function volumeBucket(value) {
  const volume = finite(value);
  if (volume == null) return 'VOL_NO_DATA';
  if (volume >= 5) return 'VOL_5X_PLUS';
  if (volume >= 2) return 'VOL_2_5X';
  return 'VOL_LOW';
}

function btcPhaseOf(trade = {}) {
  const health = trade.btcHealth ?? {};
  let direction = token(
    trade.pumpCanonicalBtcPhase
      ?? trade.pumpEvalBtcPhase
      ?? health.btcTrendDir
      ?? trade.btcTrendDir,
    '',
  );
  if (direction.startsWith('BTC_')) return direction;
  const pct6h = finite(health.pct6h ?? trade.btcPct6h);
  if (!['UP', 'DOWN', 'FLAT'].includes(direction)) {
    direction = pct6h == null
      ? 'NO_DATA'
      : pct6h > 0.15
        ? 'UP'
        : pct6h < -0.15
          ? 'DOWN'
          : 'FLAT';
  }
  if (direction === 'NO_DATA') return 'BTC_NO_DATA';
  const score = finite(health.btcTrendScore ?? trade.btcTrendScore);
  const strength = score == null
    ? 'NO_SCORE'
    : score < 45
      ? 'WEAK'
      : score < 65
        ? 'MID'
        : 'STRONG';
  return `BTC_${direction}_${strength}`;
}

function corrBucketOf(value) {
  const corr = finite(value);
  if (corr == null) return 'CORR_NO_DATA';
  if (corr < 0.3) return 'DOC_LAP';
  if (corr < 0.5) return 'THEO_YEU';
  return 'THEO';
}

function netResultOf(trade = {}) {
  const pnl = finite(trade.pnl, 0);
  const margin = finite(trade.marginUsdt ?? trade.marginUsd ?? trade.margin);
  const leverage = finite(trade.leverage, 10);
  const estimatedFee = finite(
    trade.estimatedFeeUsdt
      ?? trade.feeUsdt,
    margin != null && margin > 0 && leverage != null && leverage > 0
      ? margin * leverage * 2 * 0.0004
      : 0,
  );
  const netPnl = pnl - estimatedFee;
  const rawNetRoe = margin != null && margin > 0
    ? netPnl / margin * 100
    : finite(trade.roe, 0);
  return {
    netPnl,
    rawNetRoe,
    cappedNetRoe: Math.max(-20, Math.min(20, rawNetRoe)),
  };
}

function createAccumulator() {
  return {
    closed: 0,
    roeSum: 0,
    roeSquareSum: 0,
    grossWin: 0,
    grossLoss: 0,
    slCount: 0,
    dailyPnl: new Map(),
  };
}

function addObservation(accumulator, trade = {}) {
  if (trade.status !== 'CLOSED') return;
  const result = netResultOf(trade);
  accumulator.closed += 1;
  accumulator.roeSum += result.cappedNetRoe;
  accumulator.roeSquareSum += result.cappedNetRoe ** 2;
  // Tier quality must be independent of the historical paper size ($1/$10).
  // Use normalized capped ROE for PF/day stability instead of absolute PnL.
  if (result.cappedNetRoe > 0) accumulator.grossWin += result.cappedNetRoe;
  else if (result.cappedNetRoe < 0) accumulator.grossLoss += Math.abs(result.cappedNetRoe);
  if (
    String(trade.outcome ?? '').toUpperCase() === 'SL'
    || result.rawNetRoe <= -14.5
  ) {
    accumulator.slCount += 1;
  }
  const day = dateOf(trade);
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) {
    accumulator.dailyPnl.set(
      day,
      (accumulator.dailyPnl.get(day) ?? 0) + result.cappedNetRoe,
    );
  }
}

function finalizeAccumulator(accumulator = createAccumulator()) {
  const closed = accumulator.closed;
  const meanRoe = closed > 0 ? accumulator.roeSum / closed : 0;
  const variance = closed > 1
    ? Math.max(
        0,
        (accumulator.roeSquareSum - closed * meanRoe * meanRoe) / (closed - 1),
      )
    : 64;
  const values = [...accumulator.dailyPnl.values()];
  return {
    closed,
    days: values.length,
    positiveDays: values.filter((value) => value > 0).length,
    negativeDays: values.filter((value) => value < 0).length,
    meanRoe,
    standardError: Math.sqrt(variance) / Math.sqrt(Math.max(1, closed)),
    profitFactor: accumulator.grossLoss > 0
      ? Math.min(9.99, accumulator.grossWin / accumulator.grossLoss)
      : accumulator.grossWin > 0
        ? 9.99
        : 0,
    slRate: closed > 0 ? accumulator.slCount / closed : 0,
  };
}

function createWindowModel() {
  return {
    exact: new Map(),
    coarse: new Map(),
    parent: new Map(),
    global: createAccumulator(),
  };
}

function addToMap(map, key, trade) {
  if (!map.has(key)) map.set(key, createAccumulator());
  addObservation(map.get(key), trade);
}

function finalizeWindow(window) {
  const finalizeMap = (map) => new Map(
    [...map.entries()].map(([key, value]) => [key, finalizeAccumulator(value)]),
  );
  return {
    exact: finalizeMap(window.exact),
    coarse: finalizeMap(window.coarse),
    parent: finalizeMap(window.parent),
    global: finalizeAccumulator(window.global),
  };
}

export function isNativePumpCanonicalTrade(trade = {}) {
  return /^pump-\d+(?:-|$)/i.test(String(trade.source ?? ''));
}

export function pumpCanonicalKeysOfTrade(trade = {}) {
  const factors = trade.pumpSignalFactors ?? trade.factors ?? {};
  const type = token(trade.pumpSignalType ?? trade.type ?? trade.signalType, 'TYPE_NO_DATA');
  const side = token(trade.side ?? trade.action, 'SIDE_NO_DATA');
  const timeframe = String(
    trade.pumpSignalTimeframe
      ?? trade.interval
      ?? factors.timeframe
      ?? '15m',
  ).toLowerCase();
  const score = scoreBucket(scoreOf(trade));
  const volume = volumeBucket(
    factors.volRatio
      ?? factors.volume
      ?? factors.volNowX,
  );
  const btcPhase = btcPhaseOf(trade);
  const corr = corrBucketOf(trade.btcCorr);
  const parentKey = [type, side, timeframe].join('|');
  const coarseKey = [parentKey, score, volume].join('|');
  const exactKey = [coarseKey, btcPhase, corr].join('|');
  return {
    type,
    side,
    timeframe,
    score,
    volume,
    btcPhase,
    corr,
    parentKey,
    coarseKey,
    exactKey,
  };
}

export function buildPumpCanonicalModel(
  trades = [],
  cutoffDay,
  { lookbackDays = 5, historyFloorDay = '2026-07-20' } = {},
) {
  const normalizedCutoff = String(cutoffDay ?? new Date().toISOString().slice(0, 10));
  const nativeClosed = trades.filter((trade) => (
    isNativePumpCanonicalTrade(trade)
    && trade.status === 'CLOSED'
    && dateOf(trade) >= historyFloorDay
    && dateOf(trade) < normalizedCutoff
  ));
  const historyDays = [...new Set(nativeClosed.map(dateOf))]
    .filter((day) => /^\d{4}-\d{2}-\d{2}$/.test(day))
    .sort()
    .slice(-Math.max(1, Number(lookbackDays) || 14));
  const selectedDays = new Set(historyDays);
  const windows = Object.fromEntries(WINDOW_CONFIG.map((config) => [
    config.name,
    createWindowModel(),
  ]));

  for (const trade of nativeClosed) {
    const day = dateOf(trade);
    const dayIndex = historyDays.indexOf(day);
    if (!selectedDays.has(day) || dayIndex < 0) continue;
    const age = historyDays.length - dayIndex;
    const keys = pumpCanonicalKeysOfTrade(trade);
    for (const config of WINDOW_CONFIG) {
      if (age > config.days) continue;
      const window = windows[config.name];
      addToMap(window.exact, keys.exactKey, trade);
      addToMap(window.coarse, keys.coarseKey, trade);
      addToMap(window.parent, keys.parentKey, trade);
      addObservation(window.global, trade);
    }
  }

  return {
    version: PUMP_CANONICAL_TIER_VERSION,
    cutoffDay: normalizedCutoff,
    historyDays,
    historyFloorDay,
    windows: Object.fromEntries(
      Object.entries(windows).map(([name, window]) => [name, finalizeWindow(window)]),
    ),
  };
}

function windowEvidence(window, keys) {
  const exact = window?.exact?.get(keys.exactKey) ?? {};
  const coarse = window?.coarse?.get(keys.coarseKey) ?? {};
  const parent = window?.parent?.get(keys.parentKey) ?? {};
  const global = window?.global ?? {};
  const parentReliability = finite(parent.closed, 0) / (finite(parent.closed, 0) + 30);
  const parentMean = parentReliability * finite(parent.meanRoe, 0)
    + (1 - parentReliability) * finite(global.meanRoe, 0);
  const coarseReliability = finite(coarse.closed, 0) / (finite(coarse.closed, 0) + 20);
  const coarseMean = coarseReliability * finite(coarse.meanRoe, 0)
    + (1 - coarseReliability) * parentMean;
  const exactReliability = finite(exact.closed, 0) / (finite(exact.closed, 0) + 12);
  const posteriorMeanRoe = exactReliability * finite(exact.meanRoe, 0)
    + (1 - exactReliability) * coarseMean;
  const selected = finite(exact.closed, 0) >= 8
    ? exact
    : finite(coarse.closed, 0) >= 12
      ? coarse
      : parent;
  return {
    exactClosed: finite(exact.closed, 0),
    exactDays: finite(exact.days, 0),
    exactPositiveDays: finite(exact.positiveDays, 0),
    exactNegativeDays: finite(exact.negativeDays, 0),
    exactMeanRoe: finite(exact.meanRoe, 0),
    exactStandardError: Math.max(0.25, Math.min(6, finite(exact.standardError, 4))),
    exactProfitFactor: finite(exact.profitFactor, 0),
    exactSlRate: finite(exact.slRate, 0),
    coarseClosed: finite(coarse.closed, 0),
    parentClosed: finite(parent.closed, 0),
    supportClosed: Math.max(
      finite(exact.closed, 0),
      finite(coarse.closed, 0),
      finite(parent.closed, 0),
    ),
    days: finite(selected.days, 0),
    positiveDays: finite(selected.positiveDays, 0),
    negativeDays: finite(selected.negativeDays, 0),
    posteriorMeanRoe,
    standardError: Math.max(0.25, Math.min(6, finite(selected.standardError, 4))),
    profitFactor: finite(selected.profitFactor, 0),
    slRate: finite(selected.slRate, 0),
  };
}

export function evaluatePumpCanonicalTier(trade = {}, model = null, { snapshot = false } = {}) {
  if (!isNativePumpCanonicalTrade(trade)) return null;
  const keys = pumpCanonicalKeysOfTrade(trade);
  const evidence = WINDOW_CONFIG.map((config) => ({
    name: config.name,
    weight: config.weight,
    ...windowEvidence(model?.windows?.[config.name], keys),
  }));
  const available = evidence.filter((row) => row.supportClosed > 0);
  const totalWeight = available.reduce((sum, row) => sum + row.weight, 0);
  const expectedNetRoe = totalWeight > 0
    ? available.reduce((sum, row) => sum + row.posteriorMeanRoe * row.weight, 0) / totalWeight
    : 0;
  const weightedStandardError = totalWeight > 0
    ? available.reduce((sum, row) => sum + row.standardError * row.weight, 0) / totalWeight
    : 4;
  const conservativeEdge = expectedNetRoe - 0.75 * weightedStandardError;
  const negativeUpperEdge = expectedNetRoe + 0.75 * weightedStandardError;
  const longWindow = evidence.find((row) => row.name === '14d') ?? {};
  const seven = evidence.find((row) => row.name === '7d') ?? {};
  const one = evidence.find((row) => row.name === '1d') ?? {};
  const positiveWindows = evidence.filter((row) => (
    row.supportClosed >= 8 && row.posteriorMeanRoe > 0.25
  )).length;
  const negativeWindows = evidence.filter((row) => (
    row.supportClosed >= 8 && row.posteriorMeanRoe < -0.25
  )).length;
  const recentConflict = one.supportClosed >= 8
    && one.posteriorMeanRoe < -0.5
    && seven.posteriorMeanRoe > 0.25;
  const supportClosed = Math.max(...evidence.map((row) => row.supportClosed), 0);
  const exactClosed = Math.max(...evidence.map((row) => row.exactClosed), 0);
  const days = Math.max(longWindow.days ?? 0, seven.days ?? 0);
  const profitFactor = finite(longWindow.profitFactor, seven.profitFactor ?? 0);
  const slRate = finite(longWindow.slRate, seven.slRate ?? 0);
  const positiveDayRatio = days > 0 ? (longWindow.positiveDays ?? 0) / days : 0;
  const negativeDayRatio = days > 0 ? (longWindow.negativeDays ?? 0) / days : 0;
  const exactDays = longWindow.exactDays ?? 0;
  const exactPositiveDayRatio = exactDays > 0
    ? (longWindow.exactPositiveDays ?? 0) / exactDays
    : 0;
  const exactNegativeDayRatio = exactDays > 0
    ? (longWindow.exactNegativeDays ?? 0) / exactDays
    : 0;
  const exactPositiveWindows = evidence.filter((row) => (
    row.exactClosed >= 5 && row.exactMeanRoe > 0.25
  )).length;
  const exactNegativeWindows = evidence.filter((row) => (
    row.exactClosed >= 5 && row.exactMeanRoe < -0.5
  )).length;
  const exactRecentConflict = one.exactClosed >= 5
    && one.exactMeanRoe < -0.5
    && seven.exactMeanRoe > 0.25;
  const exactConservativeEdge = longWindow.exactMeanRoe
    - 0.75 * longWindow.exactStandardError;
  const exactNegativeUpperEdge = longWindow.exactMeanRoe
    + 0.75 * longWindow.exactStandardError;

  let candidateTier = 'WATCH';
  let candidateCode = 'PUMP_V2_CANDIDATE_WATCH';
  let reason = 'Chưa đủ bằng chứng prior-only ổn định để nâng hoặc block.';
  if (
    exactClosed >= 30
    && exactDays >= 4
    && longWindow.exactMeanRoe >= 1
    && exactConservativeEdge > 0
    && longWindow.exactProfitFactor >= 1.2
    && longWindow.exactSlRate < 0.45
    && exactPositiveWindows >= 2
    && exactPositiveDayRatio >= 0.6
    && !exactRecentConflict
  ) {
    candidateTier = 'A';
    candidateCode = 'PUMP_V2_CANDIDATE_A';
    reason = 'Edge prior-only dương, đủ mẫu/ngày và biên bảo thủ vẫn dương.';
  } else if (
    exactClosed >= 15
    && exactDays >= 3
    && longWindow.exactMeanRoe >= 0.25
    && longWindow.exactProfitFactor >= 1.05
    && exactPositiveWindows >= 2
    && exactPositiveDayRatio >= 0.55
    && !exactRecentConflict
  ) {
    candidateTier = 'B';
    candidateCode = 'PUMP_V2_CANDIDATE_B';
    reason = 'Có edge prior-only nhưng chưa đủ độ chắc chắn để lên A.';
  } else if (
    exactClosed >= 20
    && exactDays >= 3
    && longWindow.exactMeanRoe <= -1
    && exactNegativeUpperEdge < -0.1
    && longWindow.exactProfitFactor < 0.75
    && exactNegativeWindows >= 2
    && (exactNegativeDayRatio >= 0.6 || longWindow.exactSlRate >= 0.55)
  ) {
    candidateTier = 'BLOCK';
    candidateCode = 'PUMP_V2_CANDIDATE_BLOCK';
    reason = 'Edge prior-only âm trên nhiều cửa sổ/ngày và tail loss không đạt.';
  }

  const runtimeTier = PUMP_CANONICAL_RUNTIME_VALIDATED ? candidateTier : 'WATCH';
  const runtimeCode = PUMP_CANONICAL_RUNTIME_VALIDATED
    ? candidateCode
    : 'PUMP_V2_COLLECT_UNVALIDATED';
  const runtimeReason = PUMP_CANONICAL_RUNTIME_VALIDATED
    ? reason
    : 'Walk-forward chưa đạt: chỉ thu thập/đánh nhãn, không chọn, không chặn và không đổi size.';

  return {
    tier: runtimeTier,
    label: PUMP_CANONICAL_RUNTIME_VALIDATED
      ? (runtimeTier === 'A'
      ? 'PUMP V2 · TIER A'
      : runtimeTier === 'B'
        ? 'PUMP V2 · TIER B'
        : runtimeTier === 'BLOCK'
          ? 'PUMP V2 · BLOCK'
          : 'PUMP V2 · WATCH')
      : 'PUMP V2 · COLLECT',
    code: runtimeCode,
    reason: runtimeReason,
    candidateTier,
    candidateCode,
    candidateReason: reason,
    version: PUMP_CANONICAL_TIER_VERSION,
    basis: snapshot ? 'SNAPSHOT' : 'BACKTEST',
    modelCutoffDay: model?.cutoffDay ?? null,
    historyDays: model?.historyDays ?? [],
    exactKey: keys.exactKey,
    coarseKey: keys.coarseKey,
    parentKey: keys.parentKey,
    expectedNetRoe: +expectedNetRoe.toFixed(3),
    conservativeEdge: +conservativeEdge.toFixed(3),
    negativeUpperEdge: +negativeUpperEdge.toFixed(3),
    profitFactor: +profitFactor.toFixed(3),
    slRate: +slRate.toFixed(4),
    supportClosed,
    exactClosed,
    days,
    positiveWindows,
    negativeWindows,
    recentConflict,
    positiveDayRatio: +positiveDayRatio.toFixed(3),
    negativeDayRatio: +negativeDayRatio.toFixed(3),
    exactMeanRoe: +Number(longWindow.exactMeanRoe ?? 0).toFixed(3),
    exactConservativeEdge: +exactConservativeEdge.toFixed(3),
    exactProfitFactor: +Number(longWindow.exactProfitFactor ?? 0).toFixed(3),
    exactSlRate: +Number(longWindow.exactSlRate ?? 0).toFixed(4),
    exactDays,
    exactPositiveWindows,
    exactNegativeWindows,
    exactPositiveDayRatio: +exactPositiveDayRatio.toFixed(3),
    exactNegativeDayRatio: +exactNegativeDayRatio.toFixed(3),
    exactRecentConflict,
    validated: PUMP_CANONICAL_RUNTIME_VALIDATED,
    observationOnly: true,
    affectsEntry: false,
    affectsMargin: false,
    affectsSl: false,
    affectsTp: false,
    runtimeAllow: true,
    marginUsdt: null,
  };
}

export function decoratePumpCanonicalTier(trade = {}, model = null) {
  if (!isNativePumpCanonicalTrade(trade)) return trade;
  if (
    TIER_ORDER.includes(String(trade.pumpCanonicalTier ?? '').toUpperCase())
    && trade.pumpCanonicalVersion === PUMP_CANONICAL_TIER_VERSION
  ) {
    return { ...trade, pumpCanonicalDerived: false };
  }
  const rule = evaluatePumpCanonicalTier(trade, model);
  return {
    ...trade,
    pumpCanonicalTier: rule.tier,
    pumpCanonicalLabel: rule.label,
    pumpCanonicalCode: rule.code,
    pumpCanonicalReason: rule.reason,
    pumpCanonicalCandidateTier: rule.candidateTier,
    pumpCanonicalCandidateCode: rule.candidateCode,
    pumpCanonicalCandidateReason: rule.candidateReason,
    pumpCanonicalVersion: rule.version,
    pumpCanonicalBasis: rule.basis,
    pumpCanonicalModelCutoffDay: rule.modelCutoffDay,
    pumpCanonicalHistoryDays: rule.historyDays,
    pumpCanonicalExactKey: rule.exactKey,
    pumpCanonicalCoarseKey: rule.coarseKey,
    pumpCanonicalParentKey: rule.parentKey,
    pumpCanonicalExpectedNetRoe: rule.expectedNetRoe,
    pumpCanonicalConservativeEdge: rule.conservativeEdge,
    pumpCanonicalProfitFactor: rule.profitFactor,
    pumpCanonicalSlRate: rule.slRate,
    pumpCanonicalSupportClosed: rule.supportClosed,
    pumpCanonicalExactClosed: rule.exactClosed,
    pumpCanonicalDays: rule.days,
    pumpCanonicalPositiveWindows: rule.positiveWindows,
    pumpCanonicalNegativeWindows: rule.negativeWindows,
    pumpCanonicalRecentConflict: rule.recentConflict,
    pumpCanonicalRuntimeAllow: rule.runtimeAllow,
    pumpCanonicalMarginUsdt: rule.marginUsdt,
    pumpCanonicalValidated: rule.validated,
    pumpCanonicalObservationOnly: true,
    pumpCanonicalAffectsEntry: false,
    pumpCanonicalAffectsMargin: false,
    pumpCanonicalAffectsSl: false,
    pumpCanonicalAffectsTp: false,
    pumpCanonicalDerived: true,
  };
}

export function pumpCanonicalTierStats(trades = [], model = null, { candidate = false } = {}) {
  const buckets = Object.fromEntries(TIER_ORDER.map((tier) => [tier, {
    tier,
    total: 0,
    active: 0,
    open: 0,
    pending: 0,
    closed: 0,
    wins: 0,
    losses: 0,
    realizedPnl: 0,
    unrealizedPnl: 0,
    roeSum: 0,
    grossWin: 0,
    grossLoss: 0,
  }]));
  for (const raw of trades) {
    if (!isNativePumpCanonicalTrade(raw)) continue;
    const trade = decoratePumpCanonicalTier(raw, model);
    const selectedTier = candidate
      ? trade.pumpCanonicalCandidateTier
      : trade.pumpCanonicalTier;
    const tier = TIER_ORDER.includes(selectedTier)
      ? selectedTier
      : 'WATCH';
    const row = buckets[tier];
    row.total += 1;
    if (trade.status !== 'CLOSED') {
      row.active += 1;
      if (trade.status === 'PENDING') row.pending += 1;
      else row.open += 1;
      row.unrealizedPnl += finite(trade.pnl, 0);
      continue;
    }
    const result = netResultOf(trade);
    row.closed += 1;
    row.realizedPnl += result.netPnl;
    row.roeSum += result.rawNetRoe;
    if (result.rawNetRoe > 0) {
      row.wins += 1;
      row.grossWin += Math.min(20, result.rawNetRoe);
    } else if (result.rawNetRoe < 0) {
      row.losses += 1;
      row.grossLoss += Math.abs(Math.max(-20, result.rawNetRoe));
    }
  }
  return TIER_ORDER.map((tier) => {
    const row = buckets[tier];
    return {
      ...row,
      wr: row.closed > 0 ? +(row.wins / row.closed * 100).toFixed(1) : null,
      avgRoe: row.closed > 0 ? +(row.roeSum / row.closed).toFixed(2) : null,
      profitFactor: row.grossLoss > 0
        ? +(row.grossWin / row.grossLoss).toFixed(2)
        : row.grossWin > 0
          ? 9.99
          : 0,
      realizedPnl: +row.realizedPnl.toFixed(4),
      unrealizedPnl: +row.unrealizedPnl.toFixed(4),
      pnl: +(row.realizedPnl + row.unrealizedPnl).toFixed(4),
    };
  });
}

export function mergePumpCanonicalTierStats(...groups) {
  const numericKeys = [
    'total',
    'active',
    'open',
    'pending',
    'closed',
    'wins',
    'losses',
    'realizedPnl',
    'unrealizedPnl',
    'roeSum',
    'grossWin',
    'grossLoss',
  ];
  return TIER_ORDER.map((tier) => {
    const rows = groups.flat().filter((row) => row?.tier === tier);
    const merged = Object.fromEntries(numericKeys.map((key) => [
      key,
      rows.reduce((sum, row) => sum + finite(row?.[key], 0), 0),
    ]));
    return {
      tier,
      ...merged,
      wr: merged.closed > 0 ? +(merged.wins / merged.closed * 100).toFixed(1) : null,
      avgRoe: merged.closed > 0 ? +(merged.roeSum / merged.closed).toFixed(2) : null,
      profitFactor: merged.grossLoss > 0
        ? +(merged.grossWin / merged.grossLoss).toFixed(2)
        : merged.grossWin > 0
          ? 9.99
          : 0,
      realizedPnl: +merged.realizedPnl.toFixed(4),
      unrealizedPnl: +merged.unrealizedPnl.toFixed(4),
      pnl: +(merged.realizedPnl + merged.unrealizedPnl).toFixed(4),
    };
  });
}
