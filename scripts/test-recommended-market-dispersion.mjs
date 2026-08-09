import assert from "node:assert/strict";
import {
  RECOMMENDED_MARKET_DISPERSION_VERSION,
  buildRecommendedMarketDispersionSnapshot,
  decorateRecommendedMarketDispersionSnapshots,
} from "../src/recommendedMarketDispersion.js";

function trade({
  sourcePage = "liquid",
  side = "SHORT",
  rawLabel = "MARKET_DISPERSION",
  label = "MARKET_DISPERSION",
  long = 60,
  short = 35,
} = {}) {
  return {
    sourcePage,
    side,
    marketDirectionAtSignal: {
      rawLabel,
      label,
      scores: { long, short },
    },
  };
}

const liquidShortCounterLead =
  buildRecommendedMarketDispersionSnapshot(trade());
assert.equal(
  liquidShortCounterLead.recommendedMarketDispersionClass,
  "HOLD_LONG_LEAD",
);
assert.equal(
  liquidShortCounterLead.recommendedMarketDispersionTier,
  "GOOD",
);
assert.equal(
  liquidShortCounterLead.recommendedMarketDispersionScoreGap,
  25,
);
assert.equal(
  liquidShortCounterLead.recommendedMarketDispersionObservationOnly,
  true,
);
assert.equal(
  liquidShortCounterLead.recommendedMarketDispersionAffectsOrders,
  false,
);

const liquidShortSameLead = buildRecommendedMarketDispersionSnapshot(
  trade({ long: 25, short: 60 }),
);
assert.equal(
  liquidShortSameLead.recommendedMarketDispersionClass,
  "HOLD_SHORT_LEAD",
);
assert.equal(
  liquidShortSameLead.recommendedMarketDispersionTier,
  "RISK",
);

const liquidLongBalanced = buildRecommendedMarketDispersionSnapshot(
  trade({ side: "LONG", long: 48, short: 44 }),
);
assert.equal(
  liquidLongBalanced.recommendedMarketDispersionClass,
  "HOLD_BALANCED",
);
assert.equal(
  liquidLongBalanced.recommendedMarketDispersionTier,
  "GOOD",
);

const entering = buildRecommendedMarketDispersionSnapshot(
  trade({ label: "MARKET_TRANSITION" }),
);
assert.equal(entering.recommendedMarketDispersionClass, "ENTER");
assert.equal(entering.recommendedMarketDispersionTier, "WATCH");

const exiting = buildRecommendedMarketDispersionSnapshot(
  trade({ rawLabel: "MARKET_TRANSITION" }),
);
assert.equal(
  exiting.recommendedMarketDispersionClass,
  "EXIT_PENDING",
);

const outside = buildRecommendedMarketDispersionSnapshot(
  trade({
    rawLabel: "MARKET_TRANSITION",
    label: "MARKET_TRANSITION",
  }),
);
assert.equal(outside.recommendedMarketDispersionClass, "OUTSIDE");

const noData = buildRecommendedMarketDispersionSnapshot({ side: "SHORT" });
assert.equal(noData.recommendedMarketDispersionClass, "NO_DATA");
assert.equal(
  noData.recommendedMarketDispersionVersion,
  RECOMMENDED_MARKET_DISPERSION_VERSION,
);

const stored = decorateRecommendedMarketDispersionSnapshots([
  {
    ...trade(),
    recommendedMarketDispersionClass: "ENTER",
    recommendedMarketDispersionSegment: "DISP_REENTER_OTHER",
    recommendedMarketDispersionVersion: RECOMMENDED_MARKET_DISPERSION_VERSION,
  },
])[0];
assert.equal(stored.recommendedMarketDispersionClass, "ENTER");
assert.equal(
  stored.recommendedMarketDispersionVersion,
  RECOMMENDED_MARKET_DISPERSION_VERSION,
);

console.log("recommended market dispersion tests passed");
