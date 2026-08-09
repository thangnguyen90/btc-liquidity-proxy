import assert from "node:assert/strict";
import {
  RECOMMENDED_DAY_REGIME_VERSION,
  buildRecommendedDayRegimeSnapshot,
  classifyRecommendedDaySelection,
  decorateRecommendedDayRegimeSnapshots,
  recommendedDayRegimeVoteSnapshot,
} from "../src/recommendedDayRegime.js";

function btcHealth(direction, at) {
  if (direction === "SHORT") {
    return {
      at,
      btcTrendDir: "down",
      emaTrend1h: "below",
      pct6h: -1.2,
      obvTrend: "falling",
      btcTrendDir4h: "down",
      pct24h: -2.1,
      marketRegime: "SIDEWAY_DOWN",
    };
  }
  if (direction === "LONG") {
    return {
      at,
      btcTrendDir: "up",
      emaTrend1h: "above",
      pct6h: 1.2,
      obvTrend: "rising",
      btcTrendDir4h: "up",
      pct24h: 2.1,
      marketRegime: "SIDEWAY_UP",
    };
  }
  return {
    at,
    btcTrendDir: "up",
    emaTrend1h: "below",
    pct6h: 0.3,
    obvTrend: "falling",
    btcTrendDir4h: "up",
    pct24h: -0.2,
    marketRegime: "SIDEWAY_UP",
  };
}

function trade({ id, at, side = "SHORT", strength = "STRONG", direction }) {
  return {
    id,
    side,
    recommendationStrengthAtEntry: strength,
    recommendationStrength: strength,
    openedAt: at,
    createdAt: at,
    btcHealth: btcHealth(direction, at),
  };
}

const prior = [
  trade({ id: "prior-1", at: "2026-07-29T00:00:00.000Z", direction: "SHORT" }),
  trade({ id: "prior-2", at: "2026-07-29T00:15:00.000Z", direction: "SHORT" }),
];
const currentShort = trade({
  id: "short-now",
  at: "2026-07-29T00:30:00.000Z",
  direction: "SHORT",
});
const currentBefore = JSON.stringify(currentShort);
const shortVote = recommendedDayRegimeVoteSnapshot(currentShort);
assert.equal(shortVote.rawScore, -7);
assert.equal(shortVote.availableVotes, 7);

const shortRegime = buildRecommendedDayRegimeSnapshot(
  currentShort,
  prior,
  Date.parse(currentShort.openedAt),
);
assert.equal(shortRegime.version, RECOMMENDED_DAY_REGIME_VERSION);
assert.equal(shortRegime.label, "DAY_SHORT");
assert.equal(shortRegime.direction, "SHORT");
assert.equal(shortRegime.sampleCount, 3);
assert.equal(shortRegime.smoothedScore, -7);
assert.equal(shortRegime.observationOnly, true);
assert.equal(shortRegime.affectsOrders, false);
assert.equal(JSON.stringify(currentShort), currentBefore, "classifier must not mutate source trade");

const shortSelection = classifyRecommendedDaySelection(currentShort, shortRegime);
assert.equal(shortSelection.key, "STRONG_SHORT_DAY_SHORT_CORE");
assert.equal(shortSelection.tier, "GOOD");
assert.equal(shortSelection.affectsOrders, false);

const longInShort = classifyRecommendedDaySelection(
  { ...currentShort, side: "LONG" },
  shortRegime,
);
assert.equal(longInShort.key, "STRONG_LONG_DIRECTIONAL_RISK");
assert.equal(longInShort.tier, "RISK");

const mixedTrade = trade({
  id: "long-mixed",
  at: "2026-07-29T01:00:00.000Z",
  side: "LONG",
  direction: "MIXED",
});
const mixedRegime = buildRecommendedDayRegimeSnapshot(
  mixedTrade,
  [],
  Date.parse(mixedTrade.openedAt),
);
assert.equal(mixedRegime.label, "DAY_MIXED");
const mixedSelection = classifyRecommendedDaySelection(mixedTrade, mixedRegime);
assert.equal(mixedSelection.key, "STRONG_LONG_DAY_MIXED_EDGE");
assert.equal(mixedSelection.tier, "GOOD");

const missingTrade = {
  id: "missing",
  side: "SHORT",
  recommendationStrengthAtEntry: "STRONG",
  openedAt: "2026-07-29T01:15:00.000Z",
  btcHealth: { btcTrendDir: "down", at: "2026-07-29T01:15:00.000Z" },
};
const missingRegime = buildRecommendedDayRegimeSnapshot(missingTrade, []);
assert.equal(missingRegime.label, "DAY_NO_DATA");
assert.equal(
  classifyRecommendedDaySelection(missingTrade, missingRegime).key,
  "REC_DAY_NO_DATA",
);

const historical = [...prior, currentShort];
const historicalBefore = JSON.stringify(historical);
const decorated = decorateRecommendedDayRegimeSnapshots(historical);
assert.equal(decorated.length, historical.length);
assert.equal(decorated[2].recommendedDayRegimeAtEntry.label, "DAY_SHORT");
assert.equal(
  decorated[2].recommendedDaySelectionAtEntry.key,
  "STRONG_SHORT_DAY_SHORT_CORE",
);
assert.equal(JSON.stringify(historical), historicalBefore, "history decoration must be read-only");
assert.doesNotThrow(() => JSON.stringify(decorated));

console.log("recommended day regime tests: OK");

