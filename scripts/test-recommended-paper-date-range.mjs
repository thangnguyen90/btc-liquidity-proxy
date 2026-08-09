import assert from "node:assert/strict";
import {
  recommendedPaperDateRange,
  tradeInRecommendedDateRange,
} from "../src/recommendedSignals.js";

assert.deepEqual(
  recommendedPaperDateRange("2026-07-27", "2026-07-29"),
  { fromDay: "2026-07-27", toDay: "2026-07-29" },
);
assert.deepEqual(
  recommendedPaperDateRange("2026-07-29", "2026-07-27"),
  { fromDay: "2026-07-27", toDay: "2026-07-29" },
  "reversed inputs must be normalized",
);
assert.deepEqual(
  recommendedPaperDateRange("", "2026-07-28"),
  { fromDay: "2026-07-28", toDay: "2026-07-28" },
);
assert.equal(recommendedPaperDateRange("not-a-date", ""), null);

const range = recommendedPaperDateRange("2026-07-27", "2026-07-29");
assert.equal(
  tradeInRecommendedDateRange({ activeDateUtc: "2026-07-27" }, range),
  true,
);
assert.equal(
  tradeInRecommendedDateRange({ activeDateUtc: "2026-07-29" }, range),
  true,
);
assert.equal(
  tradeInRecommendedDateRange({ activeDateUtc: "2026-07-26" }, range),
  false,
);
assert.equal(
  tradeInRecommendedDateRange({ activeDateUtc: "2026-07-30" }, range),
  false,
);

console.log("recommended paper date range tests: OK");

