export const RECOMMENDED_BACKTEST_CONFIDENCE_VERSION =
  "recommended-backtest-confidence-shadow-v1";
export const RECOMMENDED_BACKTEST_RELIABILITY_VERSION =
  "recommended-backtest-reliability-shadow-v1";

const HISTORY_DAYS = 3;
const HISTORY_MIN_SAMPLES = 8;
const HISTORY_MIN_WR = 58;
const HISTORY_MIN_PF = 1;
const HISTORY_MIN_POSITIVE_DAY_RATE = 0.5;
const PRIME_MIN_SAMPLES = 5;
const PRIME_MIN_WR = 55;
const PRIME_MIN_PF = 0.8;
const GOOD_MIN_SAMPLES = 15;
const GOOD_MIN_WR = 50;
const GOOD_MIN_PF = 0.8;
const RELIABILITY_HIGH_HISTORY_SAMPLES = 24;
const RELIABILITY_HIGH_HISTORY_DAYS = 3;
const RELIABILITY_HIGH_COHORT_SAMPLES = 10;
const RELIABILITY_HIGH_SIDE_SAMPLES = 30;
const RELIABILITY_MEDIUM_HISTORY_SAMPLES = 12;
const RELIABILITY_MEDIUM_HISTORY_DAYS = 2;
const RELIABILITY_MEDIUM_COHORT_SAMPLES = 5;
const RELIABILITY_MEDIUM_SIDE_SAMPLES = 15;

function number(value, fallback = null) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePart(value) {
  return (
    String(value ?? "-")
      .trim()
      .replace(/\s+/g, "_")
      .replace(/[|]/g, "_")
      .toUpperCase()
      .slice(0, 96) || "-"
  );
}

function openedAtOf(trade) {
  return (
    Date.parse(trade?.clonedAt ?? trade?.openedAt ?? trade?.createdAt ?? "") ||
    0
  );
}

function closedAtOf(trade) {
  return Date.parse(trade?.closedAt ?? "") || 0;
}

function dayOf(trade) {
  const explicit = String(trade?.activeDateUtc ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(explicit)) return explicit;
  const openedAt = openedAtOf(trade);
  return openedAt ? new Date(openedAt).toISOString().slice(0, 10) : "";
}

function previousUtcDay(day, offset) {
  const parsed = Date.parse(`${day}T00:00:00.000Z`);
  if (!Number.isFinite(parsed)) return "";
  return new Date(parsed - offset * 86_400_000).toISOString().slice(0, 10);
}

function sideOf(trade) {
  const value = normalizePart(trade?.side ?? trade?.action);
  if (value.includes("SHORT")) return "SHORT";
  if (value.includes("LONG")) return "LONG";
  return value;
}

function scoreBucketOf(trade) {
  const stored = normalizePart(trade?.scoreBucket);
  if (stored && stored !== "-") return stored;
  const score = number(trade?.score ?? trade?.signalScore ?? trade?.qualityScore);
  if (score == null) return "SCORE_NO_DATA";
  if (score >= 90) return "SCORE_90_PLUS";
  if (score >= 80) return "SCORE_80_89";
  if (score >= 70) return "SCORE_70_79";
  if (score >= 60) return "SCORE_60_69";
  return "SCORE_LT_60";
}

function twoLayerTierOf(trade) {
  const value = normalizePart(trade?.recommendedTwoLayerTier);
  return ["GOOD", "WATCH", "RISK"].includes(value) ? value : "WATCH";
}

function marketFitTierOf(trade) {
  const value = normalizePart(trade?.recommendedMarketFitTier);
  return ["GOOD", "WATCH", "RISK"].includes(value) ? value : "WATCH";
}

export function recommendedBacktestHistoryKey(trade = {}) {
  return [
    normalizePart(trade?.sourcePage),
    sideOf(trade),
    twoLayerTierOf(trade),
    marketFitTierOf(trade),
  ].join("|");
}

function intradayCohortKey(trade = {}) {
  return [
    normalizePart(trade?.sourcePage),
    sideOf(trade),
    scoreBucketOf(trade),
  ].join("|");
}

function intradaySideKey(trade = {}) {
  return sideOf(trade);
}

function emptyStats() {
  return {
    closed: 0,
    wins: 0,
    losses: 0,
    breakeven: 0,
    pnl: 0,
    roeTotal: 0,
    grossProfit: 0,
    grossLoss: 0,
  };
}

function addClosed(stats, trade) {
  const pnl = number(trade?.pnl ?? trade?.netPnl, 0) ?? 0;
  const roe = number(trade?.roe ?? trade?.roePct, 0) ?? 0;
  stats.closed += 1;
  stats.pnl += pnl;
  stats.roeTotal += roe;
  if (pnl > 0) {
    stats.wins += 1;
    stats.grossProfit += pnl;
  } else if (pnl < 0) {
    stats.losses += 1;
    stats.grossLoss += Math.abs(pnl);
  } else {
    stats.breakeven += 1;
  }
  return stats;
}

function mergeStats(target, source) {
  for (const key of [
    "closed",
    "wins",
    "losses",
    "breakeven",
    "pnl",
    "roeTotal",
    "grossProfit",
    "grossLoss",
  ]) {
    target[key] += source?.[key] ?? 0;
  }
  return target;
}

function metricsOf(stats = emptyStats()) {
  const decisive = stats.wins + stats.losses;
  const pf = stats.grossLoss > 0
    ? stats.grossProfit / stats.grossLoss
    : stats.grossProfit > 0
      ? 99.99
      : null;
  return {
    closed: stats.closed,
    wins: stats.wins,
    losses: stats.losses,
    breakeven: stats.breakeven,
    pnl: stats.pnl,
    wr: decisive ? (stats.wins / decisive) * 100 : null,
    pf,
    avgRoe: stats.closed ? stats.roeTotal / stats.closed : null,
  };
}

function qualifies(metrics, { minSamples, minWr, minPf, requirePositiveRoe = false }) {
  return Boolean(
    metrics.closed >= minSamples &&
      metrics.wr != null &&
      metrics.wr >= minWr &&
      metrics.pf != null &&
      metrics.pf >= minPf &&
      (!requirePositiveRoe || (metrics.avgRoe != null && metrics.avgRoe > 0)),
  );
}

function formatMetric(value, digits = 1, suffix = "") {
  return value == null ? "-" : `${Number(value).toFixed(digits)}${suffix}`;
}

function reliabilitySnapshot({
  historySamples = 0,
  historyDays = 0,
  cohortSamples = 0,
  sideSamples = 0,
} = {}) {
  const high =
    historySamples >= RELIABILITY_HIGH_HISTORY_SAMPLES &&
    historyDays >= RELIABILITY_HIGH_HISTORY_DAYS &&
    (cohortSamples >= RELIABILITY_HIGH_COHORT_SAMPLES ||
      sideSamples >= RELIABILITY_HIGH_SIDE_SAMPLES);
  const medium =
    historySamples >= RELIABILITY_MEDIUM_HISTORY_SAMPLES &&
    historyDays >= RELIABILITY_MEDIUM_HISTORY_DAYS &&
    (cohortSamples >= RELIABILITY_MEDIUM_COHORT_SAMPLES ||
      sideSamples >= RELIABILITY_MEDIUM_SIDE_SAMPLES);
  const classification = high ? "HIGH" : medium ? "MEDIUM" : "LOW";
  const tier = classification === "HIGH"
    ? "GOOD"
    : classification === "MEDIUM"
      ? "WATCH"
      : "RISK";
  return {
    recommendedBacktestReliabilityClass: classification,
    recommendedBacktestReliabilityTier: tier,
    recommendedBacktestReliabilityLabel: `CONF ${classification}`,
    recommendedBacktestReliabilityReason:
      `Độ dày bằng chứng: history ${historySamples}/${historyDays} ngày; ` +
      `cohort ${cohortSamples}; side ${sideSamples} · không đo hướng lời/lỗ · OBSERVE ONLY`,
    recommendedBacktestReliabilityVersion:
      RECOMMENDED_BACKTEST_RELIABILITY_VERSION,
    recommendedBacktestReliabilityObservationOnly: true,
    recommendedBacktestReliabilityAffectsOrders: false,
  };
}

function reliabilitySnapshotFromTrade(trade = {}) {
  return reliabilitySnapshot({
    historySamples:
      number(trade?.recommendedBacktestConfidenceHistorySamples, 0) ?? 0,
    historyDays:
      number(trade?.recommendedBacktestConfidenceHistoryObservedDays, 0) ?? 0,
    cohortSamples:
      number(trade?.recommendedBacktestConfidenceIntradayCohortSamples, 0) ?? 0,
    sideSamples:
      number(trade?.recommendedBacktestConfidenceIntradaySideSamples, 0) ?? 0,
  });
}

function snapshotFromStats(trade, historyStats, historyDays, cohortStats, sideStats) {
  const history = metricsOf(historyStats);
  const cohort = metricsOf(cohortStats);
  const intradaySide = metricsOf(sideStats);
  const observedDays = historyDays.length;
  const positiveDays = historyDays.filter((stats) => stats.pnl > 0).length;
  const positiveDayRate = observedDays ? positiveDays / observedDays : null;
  const historyReady = history.closed >= HISTORY_MIN_SAMPLES;
  const historyPass = historyReady && qualifies(history, {
    minSamples: HISTORY_MIN_SAMPLES,
    minWr: HISTORY_MIN_WR,
    minPf: HISTORY_MIN_PF,
    requirePositiveRoe: true,
  }) && positiveDayRate >= HISTORY_MIN_POSITIVE_DAY_RATE;
  const primePass = qualifies(cohort, {
    minSamples: PRIME_MIN_SAMPLES,
    minWr: PRIME_MIN_WR,
    minPf: PRIME_MIN_PF,
  });
  const goodPass = qualifies(intradaySide, {
    minSamples: GOOD_MIN_SAMPLES,
    minWr: GOOD_MIN_WR,
    minPf: GOOD_MIN_PF,
  });

  let classification = "NO_DATA";
  let tier = "WATCH";
  if (historyReady && !historyPass) {
    classification = "RISK";
    tier = "RISK";
  } else if (historyPass && primePass) {
    classification = "PRIME";
    tier = "GOOD";
  } else if (historyPass && goodPass) {
    classification = "GOOD";
    tier = "GOOD";
  } else if (historyPass) {
    classification = "WATCH";
  }

  const historyText =
    `3D ${history.closed} đóng · WR ${formatMetric(history.wr, 1, "%")}` +
    ` · PF ${formatMetric(history.pf, 2)} · AvgROE ${formatMetric(history.avgRoe, 1, "%")}` +
    ` · ngày dương ${positiveDays}/${observedDays}`;
  const intradayText =
    `trong ngày cohort ${cohort.closed} · WR ${formatMetric(cohort.wr, 1, "%")}` +
    ` · PF ${formatMetric(cohort.pf, 2)}; side ${intradaySide.closed}` +
    ` · WR ${formatMetric(intradaySide.wr, 1, "%")} · PF ${formatMetric(intradaySide.pf, 2)}`;
  const reliability = reliabilitySnapshot({
    historySamples: history.closed,
    historyDays: observedDays,
    cohortSamples: cohort.closed,
    sideSamples: intradaySide.closed,
  });

  return {
    recommendedBacktestConfidenceClass: classification,
    recommendedBacktestConfidenceTier: tier,
    recommendedBacktestConfidenceLabel: `BT ${classification.replaceAll("_", " ")}`,
    recommendedBacktestConfidenceReason:
      `${historyText}; ${intradayText} · snapshot trước entry · OBSERVE ONLY`,
    recommendedBacktestConfidenceHistoryKey:
      recommendedBacktestHistoryKey(trade),
    recommendedBacktestConfidenceHistorySamples: history.closed,
    recommendedBacktestConfidenceHistoryWr: history.wr,
    recommendedBacktestConfidenceHistoryPf: history.pf,
    recommendedBacktestConfidenceHistoryAvgRoe: history.avgRoe,
    recommendedBacktestConfidenceHistoryPositiveDays: positiveDays,
    recommendedBacktestConfidenceHistoryObservedDays: observedDays,
    recommendedBacktestConfidenceIntradayCohortSamples: cohort.closed,
    recommendedBacktestConfidenceIntradayCohortWr: cohort.wr,
    recommendedBacktestConfidenceIntradayCohortPf: cohort.pf,
    recommendedBacktestConfidenceIntradaySideSamples: intradaySide.closed,
    recommendedBacktestConfidenceIntradaySideWr: intradaySide.wr,
    recommendedBacktestConfidenceIntradaySidePf: intradaySide.pf,
    recommendedBacktestConfidenceVersion:
      RECOMMENDED_BACKTEST_CONFIDENCE_VERSION,
    recommendedBacktestConfidenceObservationOnly: true,
    recommendedBacktestConfidenceAffectsOrders: false,
    ...reliability,
  };
}

function statsForTrade(trade, dailyHistory, dailyCohort, dailySide) {
  const day = dayOf(trade);
  const historyKey = recommendedBacktestHistoryKey(trade);
  const historyStats = emptyStats();
  const historyDays = [];
  for (let offset = 1; offset <= HISTORY_DAYS; offset += 1) {
    const priorDay = previousUtcDay(day, offset);
    const dayStats = dailyHistory.get(`${priorDay}|${historyKey}`);
    if (!dayStats?.closed) continue;
    historyDays.push(dayStats);
    mergeStats(historyStats, dayStats);
  }
  const cohortStats =
    dailyCohort.get(`${day}|${intradayCohortKey(trade)}`) ?? emptyStats();
  const sideStats =
    dailySide.get(`${day}|${intradaySideKey(trade)}`) ?? emptyStats();
  return snapshotFromStats(
    trade,
    historyStats,
    historyDays,
    cohortStats,
    sideStats,
  );
}

function addTradeToMaps(trade, dailyHistory, dailyCohort, dailySide) {
  const day = dayOf(trade);
  if (!day) return;
  const add = (map, key) => {
    const stats = map.get(key) ?? emptyStats();
    addClosed(stats, trade);
    map.set(key, stats);
  };
  add(dailyHistory, `${day}|${recommendedBacktestHistoryKey(trade)}`);
  add(dailyCohort, `${day}|${intradayCohortKey(trade)}`);
  add(dailySide, `${day}|${intradaySideKey(trade)}`);
}

export function buildRecommendedBacktestConfidenceSnapshot(
  trade,
  priorTrades = [],
  beforeAt = openedAtOf(trade),
) {
  const cutoff = number(beforeAt, openedAtOf(trade)) ?? 0;
  const dailyHistory = new Map();
  const dailyCohort = new Map();
  const dailySide = new Map();
  for (const prior of priorTrades) {
    const closedAt = closedAtOf(prior);
    if (!closedAt || (cutoff && closedAt > cutoff)) continue;
    addTradeToMaps(prior, dailyHistory, dailyCohort, dailySide);
  }
  return statsForTrade(trade, dailyHistory, dailyCohort, dailySide);
}

export function decorateRecommendedBacktestConfidenceSnapshots(trades = []) {
  const entries = trades
    .map((trade, index) => ({ trade, index, openedAt: openedAtOf(trade) }))
    .sort((left, right) => left.openedAt - right.openedAt || left.index - right.index);
  const closeEvents = trades
    .map((trade) => ({ trade, closedAt: closedAtOf(trade) }))
    .filter((event) => event.closedAt > 0)
    .sort((left, right) => left.closedAt - right.closedAt);
  const dailyHistory = new Map();
  const dailyCohort = new Map();
  const dailySide = new Map();
  const decorated = [...trades];
  let closeIndex = 0;

  for (const entry of entries) {
    while (
      closeIndex < closeEvents.length &&
      closeEvents[closeIndex].closedAt <= entry.openedAt
    ) {
      addTradeToMaps(
        closeEvents[closeIndex].trade,
        dailyHistory,
        dailyCohort,
        dailySide,
      );
      closeIndex += 1;
    }
    const hasSnapshot =
      entry.trade?.recommendedBacktestConfidenceVersion ===
        RECOMMENDED_BACKTEST_CONFIDENCE_VERSION &&
      entry.trade?.recommendedBacktestConfidenceClass &&
      entry.trade?.recommendedBacktestConfidenceLabel;
    const hasReliability =
      entry.trade?.recommendedBacktestReliabilityVersion ===
        RECOMMENDED_BACKTEST_RELIABILITY_VERSION &&
      entry.trade?.recommendedBacktestReliabilityClass &&
      entry.trade?.recommendedBacktestReliabilityLabel;
    if (hasSnapshot && hasReliability) continue;
    if (hasSnapshot) {
      decorated[entry.index] = {
        ...entry.trade,
        ...reliabilitySnapshotFromTrade(entry.trade),
      };
      continue;
    }
    decorated[entry.index] = {
      ...entry.trade,
      ...statsForTrade(entry.trade, dailyHistory, dailyCohort, dailySide),
    };
  }
  return decorated;
}

export const RECOMMENDED_BACKTEST_CONFIDENCE_RULES = Object.freeze({
  historyDays: HISTORY_DAYS,
  historyMinSamples: HISTORY_MIN_SAMPLES,
  historyMinWr: HISTORY_MIN_WR,
  historyMinPf: HISTORY_MIN_PF,
  historyMinPositiveDayRate: HISTORY_MIN_POSITIVE_DAY_RATE,
  primeMinSamples: PRIME_MIN_SAMPLES,
  primeMinWr: PRIME_MIN_WR,
  primeMinPf: PRIME_MIN_PF,
  goodMinSamples: GOOD_MIN_SAMPLES,
  goodMinWr: GOOD_MIN_WR,
  goodMinPf: GOOD_MIN_PF,
  reliability: Object.freeze({
    highHistorySamples: RELIABILITY_HIGH_HISTORY_SAMPLES,
    highHistoryDays: RELIABILITY_HIGH_HISTORY_DAYS,
    highCohortSamples: RELIABILITY_HIGH_COHORT_SAMPLES,
    highSideSamples: RELIABILITY_HIGH_SIDE_SAMPLES,
    mediumHistorySamples: RELIABILITY_MEDIUM_HISTORY_SAMPLES,
    mediumHistoryDays: RELIABILITY_MEDIUM_HISTORY_DAYS,
    mediumCohortSamples: RELIABILITY_MEDIUM_COHORT_SAMPLES,
    mediumSideSamples: RELIABILITY_MEDIUM_SIDE_SAMPLES,
  }),
});
