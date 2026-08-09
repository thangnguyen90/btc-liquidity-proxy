import assert from "node:assert/strict";
import {
  buildRecommendedBacktestConfidenceSnapshot,
  decorateRecommendedBacktestConfidenceSnapshots,
} from "../src/recommendedBacktestConfidence.js";
import { paperBacktestConfidenceStats } from "../src/recommendedSignals.js";

const candidateAt = Date.parse("2026-07-29T12:00:00.000Z");

function row({
  id,
  day,
  pnl = 1,
  roe = pnl > 0 ? 2 : -2,
  sourcePage = "edge",
  side = "SHORT",
  scoreBucket = "SCORE_60_69",
  twoLayer = "GOOD",
  marketFit = "WATCH",
  closedAt = `${day}T11:00:00.000Z`,
}) {
  return {
    id,
    activeDateUtc: day,
    sourcePage,
    side,
    scoreBucket,
    recommendedTwoLayerTier: twoLayer,
    recommendedMarketFitTier: marketFit,
    status: "CLOSED",
    pnl,
    roe,
    openedAt: `${day}T10:00:00.000Z`,
    closedAt,
  };
}

function candidate(overrides = {}) {
  return {
    id: "candidate",
    activeDateUtc: "2026-07-29",
    sourcePage: "edge",
    side: "SHORT",
    scoreBucket: "SCORE_60_69",
    recommendedTwoLayerTier: "GOOD",
    recommendedMarketFitTier: "WATCH",
    status: "OPEN",
    openedAt: new Date(candidateAt).toISOString(),
    ...overrides,
  };
}

const historyGood = ["2026-07-26", "2026-07-27", "2026-07-28"].flatMap(
  (day, dayIndex) =>
    Array.from({ length: 3 }, (_, index) =>
      row({ id: `history-good-${dayIndex}-${index}`, day }),
    ),
);
const intradayPrime = Array.from({ length: 5 }, (_, index) =>
  row({
    id: `prime-${index}`,
    day: "2026-07-29",
    closedAt: `2026-07-29T11:0${index}:00.000Z`,
  }),
);
const futureLosses = Array.from({ length: 20 }, (_, index) =>
  row({
    id: `future-${index}`,
    day: "2026-07-29",
    pnl: -10,
    roe: -20,
    closedAt: `2026-07-29T13:${String(index).padStart(2, "0")}:00.000Z`,
  }),
);

const prime = buildRecommendedBacktestConfidenceSnapshot(
  candidate(),
  [...historyGood, ...intradayPrime, ...futureLosses],
  candidateAt,
);
assert.equal(prime.recommendedBacktestConfidenceClass, "PRIME");
assert.equal(prime.recommendedBacktestConfidenceHistorySamples, 9);
assert.equal(prime.recommendedBacktestConfidenceIntradayCohortSamples, 5);
assert.equal(prime.recommendedBacktestConfidenceObservationOnly, true);
assert.equal(prime.recommendedBacktestConfidenceAffectsOrders, false);
assert.equal(prime.recommendedBacktestReliabilityClass, "LOW");
assert.equal(prime.recommendedBacktestReliabilityObservationOnly, true);
assert.equal(prime.recommendedBacktestReliabilityAffectsOrders, false);

const mediumHistory = ["2026-07-26", "2026-07-27", "2026-07-28"].flatMap(
  (day, dayIndex) =>
    Array.from({ length: 4 }, (_, index) =>
      row({ id: `history-medium-${dayIndex}-${index}`, day }),
    ),
);
const medium = buildRecommendedBacktestConfidenceSnapshot(
  candidate({ id: "medium-reliability" }),
  [...mediumHistory, ...intradayPrime],
  candidateAt,
);
assert.equal(medium.recommendedBacktestReliabilityClass, "MEDIUM");

const highHistory = ["2026-07-26", "2026-07-27", "2026-07-28"].flatMap(
  (day, dayIndex) =>
    Array.from({ length: 8 }, (_, index) =>
      row({ id: `history-high-${dayIndex}-${index}`, day }),
    ),
);
const intradayHigh = Array.from({ length: 10 }, (_, index) =>
  row({
    id: `high-${index}`,
    day: "2026-07-29",
    closedAt: `2026-07-29T11:${String(index).padStart(2, "0")}:00.000Z`,
  }),
);
const high = buildRecommendedBacktestConfidenceSnapshot(
  candidate({ id: "high-reliability" }),
  [...highHistory, ...intradayHigh],
  candidateAt,
);
assert.equal(high.recommendedBacktestReliabilityClass, "HIGH");

const broadSide = Array.from({ length: 15 }, (_, index) =>
  row({
    id: `side-${index}`,
    day: "2026-07-29",
    sourcePage: "ema",
    scoreBucket: "SCORE_90_PLUS",
    closedAt: `2026-07-29T10:${String(index).padStart(2, "0")}:00.000Z`,
  }),
);
const good = buildRecommendedBacktestConfidenceSnapshot(
  candidate({ id: "good-candidate" }),
  [...historyGood, ...broadSide],
  candidateAt,
);
assert.equal(good.recommendedBacktestConfidenceClass, "GOOD");
assert.equal(good.recommendedBacktestConfidenceIntradayCohortSamples, 0);
assert.equal(good.recommendedBacktestConfidenceIntradaySideSamples, 15);

const watch = buildRecommendedBacktestConfidenceSnapshot(
  candidate({ id: "watch-candidate" }),
  historyGood,
  candidateAt,
);
assert.equal(watch.recommendedBacktestConfidenceClass, "WATCH");

const historyRisk = historyGood.map((trade, index) => ({
  ...trade,
  id: `risk-${index}`,
  pnl: -1,
  roe: -2,
}));
const risk = buildRecommendedBacktestConfidenceSnapshot(
  candidate({ id: "risk-candidate" }),
  historyRisk,
  candidateAt,
);
assert.equal(risk.recommendedBacktestConfidenceClass, "RISK");

const noData = buildRecommendedBacktestConfidenceSnapshot(
  candidate({ id: "no-data-candidate" }),
  historyGood.slice(0, 2),
  candidateAt,
);
assert.equal(noData.recommendedBacktestConfidenceClass, "NO_DATA");

const decorated = decorateRecommendedBacktestConfidenceSnapshots([
  ...historyGood,
  ...intradayPrime,
  candidate(),
  ...futureLosses,
]);
const decoratedCandidate = decorated.find((trade) => trade.id === "candidate");
assert.equal(decoratedCandidate.recommendedBacktestConfidenceClass, "PRIME");
assert.equal(
  decoratedCandidate.recommendedBacktestConfidenceIntradayCohortSamples,
  5,
  "future closed rows must not leak into the entry snapshot",
);
assert.equal(
  decoratedCandidate.recommendedBacktestReliabilityClass,
  "LOW",
  "reliability must use the same causal pre-entry sample counts",
);

const confidenceStats = paperBacktestConfidenceStats([
  {
    ...candidate(),
    ...prime,
    id: "active-prime",
    status: "OPEN",
    pnl: 2.5,
  },
  {
    ...candidate(),
    ...prime,
    id: "closed-prime",
    status: "CLOSED",
    pnl: 1.5,
    roe: 6,
  },
  {
    ...candidate(),
    ...risk,
    id: "closed-risk",
    status: "CLOSED",
    pnl: -1,
    roe: -4,
  },
]);
const primeStats = confidenceStats.groups.find((group) => group.key === "BT_PRIME");
const lowReliabilityStats = confidenceStats.reliabilityGroups.find(
  (group) => group.key === "CONF_LOW",
);
assert.equal(primeStats.open, 1);
assert.equal(primeStats.closed, 1);
assert.equal(primeStats.activePnl, 2.5);
assert.equal(primeStats.closedPnl, 1.5);
assert.equal(lowReliabilityStats.total, 3);
assert.equal(confidenceStats.observationOnly, true);
assert.equal(confidenceStats.affectsOrders, false);

console.log("recommended backtest confidence tests: OK");
