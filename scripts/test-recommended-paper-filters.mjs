import assert from "node:assert/strict";
import {
  filterRecommendedPaperTrades,
  normalizeRecommendedPaperFilters,
  recommendedPaperFilterOptions,
} from "../src/recommendedSignals.js";

const trades = [
  {
    id: "prime-short",
    recommendedSourceLayer: "GOOD",
    recommendedCloneLayer: "GOOD",
    recommendedTwoLayerTier: "GOOD",
    recommendedMarketFitLabel: "M4 GOOD",
    recommendedDaySelectionAtEntry: {
      key: "STRONG_SHORT_DAY_SHORT_CORE",
      label: "SHORT CORE · DAY SHORT",
    },
    recommendedBacktestConfidenceClass: "PRIME",
    recommendedBacktestReliabilityClass: "HIGH",
    recommendedMarketPointFitClass: "STRONG",
    recommendedMarketDispersionClass: "HOLD_LONG_LEAD",
    recommendedMarketDispersionSegment: "DISP_HOLD_LONG_LEAD",
  },
  {
    id: "watch-short",
    recommendedSourceLayer: "GOOD",
    recommendedCloneLayer: "WATCH",
    recommendedTwoLayerTier: "WATCH",
    recommendedMarketFitLabel: "M4 WATCH",
    recommendedDaySelectionAtEntry: {
      key: "STRONG_SHORT_DAY_LONG_REVERSAL",
      label: "SHORT REVERSAL · DAY LONG",
    },
    recommendedBacktestConfidenceClass: "WATCH",
    recommendedBacktestReliabilityClass: "MEDIUM",
    recommendedMarketPointFitClass: "TRANSITION",
    recommendedMarketDispersionClass: "ENTER",
    recommendedMarketDispersionSegment: "DISP_REENTER_OTHER",
  },
  {
    id: "risk-long",
    recommendedSourceLayer: "RISK",
    recommendedCloneLayer: "GOOD",
    recommendedTwoLayerTier: "RISK",
    recommendedMarketFitLabel: "M4 NO DATA",
    recommendedMarketFitSampleStatus: "NO_DATA",
    recommendedDaySelectionAtEntry: {
      key: "STRONG_LONG_DIRECTIONAL_RISK",
      label: "LONG DIRECTIONAL RISK",
    },
    recommendedBacktestConfidenceClass: "RISK",
    recommendedBacktestReliabilityClass: "LOW",
    recommendedMarketPointFitClass: "HEADWIND",
    recommendedMarketDispersionClass: "HOLD_SHORT_LEAD",
    recommendedMarketDispersionSegment: "DISP_HOLD_SHORT_LEAD",
  },
];

assert.deepEqual(
  normalizeRecommendedPaperFilters({
    sourceLayer: "all",
    twoLayer: " good ",
    marketFit: "no data",
  }),
  {
    sourceLayer: "",
    cloneLayer: "",
    twoLayer: "GOOD",
    marketFit: "NO_DATA",
    daySelection: "",
    backtestConfidence: "",
    backtestReliability: "",
    marketPointFit: "",
    marketDispersion: "",
  },
);

assert.deepEqual(
  filterRecommendedPaperTrades(trades, {
    sourceLayer: "GOOD",
    cloneLayer: "GOOD",
    backtestConfidence: "PRIME",
    backtestReliability: "HIGH",
    marketPointFit: "STRONG",
    marketDispersion: "DISP_HOLD_LONG_LEAD",
  }).map((trade) => trade.id),
  ["prime-short"],
  "all active filters must be combined with AND",
);

assert.deepEqual(
  filterRecommendedPaperTrades(trades, { marketFit: "NO_DATA" }).map(
    (trade) => trade.id,
  ),
  ["risk-long"],
  "M4 NO DATA must remain distinct from M4 WATCH",
);

const options = recommendedPaperFilterOptions(trades);
assert.equal(
  options.sourceLayer.find((option) => option.value === "GOOD")?.count,
  2,
);
assert.equal(
  options.daySelection.find(
    (option) => option.value === "STRONG_SHORT_DAY_SHORT_CORE",
  )?.label,
  "SHORT CORE · DAY SHORT",
);
assert.deepEqual(
  options.backtestConfidence.map((option) => option.value),
  ["PRIME", "WATCH", "RISK"],
);
assert.deepEqual(
  options.backtestReliability.map((option) => option.value),
  ["HIGH", "MEDIUM", "LOW"],
);
assert.deepEqual(
  options.marketPointFit.map((option) => option.value),
  ["STRONG", "TRANSITION", "HEADWIND"],
);
assert.deepEqual(
  options.marketDispersion.map((option) => option.value),
  ["DISP_REENTER_OTHER", "DISP_HOLD_LONG_LEAD", "DISP_HOLD_SHORT_LEAD"],
);

console.log("recommended paper filter tests: OK");
