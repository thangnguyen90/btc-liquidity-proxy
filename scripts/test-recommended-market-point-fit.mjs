import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  RECOMMENDED_MARKET_POINT_FIT_VERSION,
  buildRecommendedMarketPointFitSnapshot,
  decorateRecommendedMarketPointFitSnapshots,
} from "../src/recommendedMarketPointFit.js";

function trade({
  side = "SHORT",
  long = 25,
  short = 65,
  longPrev = 24,
  shortPrev = 60,
  longSlope = 1,
  shortSlope = 5,
  longDrop = 0,
  shortDrop = 0,
  longWave = "LONG_NEUTRAL",
  shortWave = "SHORT_IMPULSE",
} = {}) {
  return {
    id: randomUUID(),
    side,
    marketDirectionAtSignal: {
      scores: { long, short },
      scoreDynamics: {
        longScorePrev: longPrev,
        shortScorePrev: shortPrev,
        longScoreSlope: longSlope,
        shortScoreSlope: shortSlope,
        longScoreDropFromPeak: longDrop,
        shortScoreDropFromPeak: shortDrop,
        longWaveState: longWave,
        shortWaveState: shortWave,
      },
    },
  };
}

const strong = buildRecommendedMarketPointFitSnapshot(trade());
assert.equal(strong.recommendedMarketPointFitClass, "STRONG");
assert.equal(strong.recommendedMarketPointFitTier, "GOOD");
assert.equal(strong.recommendedMarketPointDirectionScore, 65);
assert.equal(strong.recommendedMarketPointScoreEdge, 40);
assert.equal(strong.recommendedMarketPointFitObservationOnly, true);
assert.equal(strong.recommendedMarketPointFitAffectsOrders, false);

const support = buildRecommendedMarketPointFitSnapshot(trade({
  side: "LONG",
  long: 52,
  short: 35,
  longPrev: 48,
  shortPrev: 36,
  longSlope: 4,
  shortSlope: -1,
  longWave: "LONG_BUILDUP",
  shortWave: "SHORT_NEUTRAL",
}));
assert.equal(support.recommendedMarketPointFitClass, "SUPPORT");

const transition = buildRecommendedMarketPointFitSnapshot(trade({
  side: "LONG",
  long: 45,
  short: 40,
  longPrev: 39,
  shortPrev: 42,
  longSlope: 6,
  shortSlope: -2,
  longWave: "LONG_BUILDUP",
  shortWave: "SHORT_NEUTRAL",
}));
assert.equal(transition.recommendedMarketPointFitClass, "TRANSITION");
assert.equal(transition.recommendedMarketPointFitTier, "WATCH");

const exhausted = buildRecommendedMarketPointFitSnapshot(trade({
  short: 64,
  shortPrev: 72,
  shortSlope: -8,
  shortDrop: 12,
  shortWave: "SHORT_FADE",
}));
assert.equal(exhausted.recommendedMarketPointFitClass, "EXHAUSTED");
assert.equal(exhausted.recommendedMarketPointFitTier, "RISK");

const headwind = buildRecommendedMarketPointFitSnapshot(trade({
  side: "LONG",
  long: 24,
  short: 51,
  longPrev: 25,
  shortPrev: 49,
  longSlope: -1,
  shortSlope: 2,
  longWave: "LONG_NEUTRAL",
  shortWave: "SHORT_BUILDUP",
}));
assert.equal(headwind.recommendedMarketPointFitClass, "HEADWIND");

const noData = buildRecommendedMarketPointFitSnapshot({ side: "SHORT" });
assert.equal(noData.recommendedMarketPointFitClass, "NO_DATA");
assert.equal(
  noData.recommendedMarketPointFitVersion,
  RECOMMENDED_MARKET_POINT_FIT_VERSION,
);

const preserved = decorateRecommendedMarketPointFitSnapshots([
  {
    ...trade(),
    recommendedMarketPointFitClass: "SUPPORT",
    recommendedMarketPointFitVersion: "stored-version",
  },
])[0];
assert.equal(preserved.recommendedMarketPointFitClass, "SUPPORT");
assert.equal(preserved.recommendedMarketPointFitVersion, "stored-version");

console.log("recommended market point fit tests passed");
