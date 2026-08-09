import assert from "node:assert/strict";
import {
  RECOMMENDED_SUPPORT_ENTRY_RULES,
  buildRecommendedSupportEntryStatRows,
  decorateRecommendedSupportEntrySnapshots,
} from "../src/recommendedSupportEntry.js";
import { paperSupportEntryStats } from "../src/recommendedSignals.js";

const sample = (
  id,
  sampleKey,
  long,
  short,
  sourcePage,
  side,
  pnl = 0,
  recommendedSourceLayer = "GOOD",
) => ({
  id,
  sourcePage,
  side,
  status: "CLOSED",
  pnl,
  roe: pnl * 10,
  recommendedSourceLayer,
  activeDateUtc: "2026-08-01",
  createdAt: new Date(Number(sampleKey)).toISOString(),
  marketDirectionAtSignal: {
    sampleKey: String(sampleKey),
    evaluatedAt: Number(sampleKey),
    scores: { long, short },
  },
});

const start = Date.parse("2026-08-01T00:00:00Z");
const rows = [
  sample("long-candidate", start, 60, 35, "liquid", "LONG"),
  sample("long-confirmed", start + 5 * 60_000, 62, 34, "liquid", "LONG"),
  sample("short-candidate", start + 10 * 60_000, 34, 61, "edge", "SHORT"),
  sample("edge-short-good", start + 15 * 60_000, 32, 63, "edge", "SHORT", 2),
  sample("liquid-short-bad", start + 15 * 60_000, 32, 63, "liquid", "SHORT", -1),
  sample("long-candidate-2", start + 20 * 60_000, 61, 34, "liquid", "LONG"),
  sample(
    "liquid-short-old-side",
    start + 25 * 60_000,
    63,
    33,
    "liquid",
    "SHORT",
    1,
    "RISK",
  ),
  sample("edge-long-bad", start + 25 * 60_000, 63, 33, "edge", "LONG", -2),
  sample("ema-long-not-proven-bad", start + 25 * 60_000, 63, 33, "ema", "LONG", 2),
];

const decorated = decorateRecommendedSupportEntrySnapshots(rows);
const byId = new Map(decorated.map((trade) => [trade.id, trade]));

assert.equal(RECOMMENDED_SUPPORT_ENTRY_RULES.minScoreGap, 15);
assert.equal(RECOMMENDED_SUPPORT_ENTRY_RULES.confirmationSamples, 2);
assert.equal(RECOMMENDED_SUPPORT_ENTRY_RULES.maxFlipAgeMinutes, 180);
assert.equal(byId.get("edge-short-good").recommendedSupportEntryClass, "GOOD");
assert.equal(
  byId.get("edge-short-good").recommendedSupportEntryCode,
  "EDGE_SHORT_SUPPORT_ALIGNED",
);
assert.equal(
  byId.get("edge-short-good").recommendedSupportEntryCohortLabel,
  "ENTRY FLIP · EDGE SHORT ALIGNED",
);
assert.equal(byId.get("liquid-short-bad").recommendedSupportEntryClass, "BAD");
assert.equal(
  byId.get("liquid-short-old-side").recommendedSupportEntryClass,
  "GOOD",
);
assert.equal(
  byId.get("liquid-short-old-side").recommendedSupportEntryCode,
  "LIQUID_SHORT_POST_FLIP_OLD_SIDE",
);
assert.equal(
  byId.get("liquid-short-old-side").recommendedSupportEntryCohortLabel,
  "ENTRY FLIP · LIQUID SHORT OLD SIDE",
);
assert.equal(
  byId.get("edge-short-good").recommendedSupportEntrySourceQualityKey,
  "EDGE_CONFIRMED",
);
assert.equal(
  byId.get("liquid-short-old-side").recommendedSupportEntrySourceQualityKey,
  "LIQUID_WEAK",
);
assert.equal(
  byId.get("liquid-short-old-side").recommendedSupportEntrySourceQualityTier,
  "RISK",
);
assert.equal(byId.get("edge-long-bad").recommendedSupportEntryClass, "BAD");
assert.equal(
  byId.get("edge-long-bad").recommendedSupportEntryCohortLabel,
  "ENTRY FLIP · EDGE LONG ALIGNED",
);
assert.equal(
  byId.get("ema-long-not-proven-bad").recommendedSupportEntryClass,
  "OTHER",
);

for (const trade of decorated) {
  assert.equal(trade.recommendedSupportEntryObservationOnly, true);
  assert.equal(trade.recommendedSupportEntryAffectsEntry, false);
  assert.equal(trade.recommendedSupportEntryAffectsOrders, false);
  assert.equal(trade.recommendedSupportEntryAffectsMargin, false);
  assert.equal(trade.recommendedSupportEntryAffectsSize, false);
  assert.equal(trade.recommendedSupportEntryAffectsSl, false);
  assert.equal(trade.recommendedSupportEntryAffectsTp, false);
}

const stats = paperSupportEntryStats(decorated);
assert.equal(stats.observationOnly, true);
assert.equal(stats.affectsEntry, false);
assert.equal(stats.affectsOrders, false);
assert.equal(stats.groups.find((group) => group.verdictLabel === "GOOD")?.closed, 2);
assert.equal(stats.groups.find((group) => group.verdictLabel === "BAD")?.closed, 2);
assert.equal(
  stats.groups.find((group) => group.verdictLabel === "BAD")?.negativeDayStreak,
  1,
);
assert.equal(stats.shortSourceGroups.length, 3);
assert.equal(stats.longSourceGroups.length, 1);
assert.equal(stats.sourceQualityGroups.length, 4);
assert.equal(
  stats.sourceQualityGroups.find((group) => group.key === "EDGE_CONFIRMED")
    ?.closed,
  1,
);
assert.equal(
  stats.sourceQualityGroups.find((group) => group.key === "LIQUID_WEAK")
    ?.closed,
  1,
);
assert.equal(
  stats.sourceQualityGroups.find((group) => group.key === "EDGE_WEAK")
    ?.closed,
  0,
);
assert.ok(
  stats.shortSourceGroups.some(
    (group) => group.label === "ENTRY FLIP · EDGE SHORT ALIGNED",
  ),
);

const compactRows = buildRecommendedSupportEntryStatRows(rows, { sourcePage: "ema" });
const compactById = new Map(compactRows.map((trade) => [trade.id, trade]));
assert.equal(compactById.get("edge-short-good").recommendedSupportEntrySource, "EMA");
assert.equal(compactById.get("edge-short-good").marketDirectionAtSignal, undefined);
assert.equal(compactById.get("edge-short-good").recommendedSupportEntryObservationOnly, true);
assert.deepEqual(
  paperSupportEntryStats(compactRows).groups.map((group) => [group.verdictLabel, group.total]),
  paperSupportEntryStats(
    decorateRecommendedSupportEntrySnapshots(rows.map((trade) => ({ ...trade, sourcePage: "ema" }))),
  ).groups.map((group) => [group.verdictLabel, group.total]),
);

const pageRows = [
  sample("page-long-candidate", start, 60, 35, "pump", "LONG"),
  sample("page-long-confirmed", start + 5 * 60_000, 62, 34, "pump", "LONG"),
  sample("page-short-candidate", start + 10 * 60_000, 34, 61, "pump", "SHORT"),
  sample("pump-short-aligned", start + 15 * 60_000, 32, 63, "pump", "SHORT", -1),
  sample("edge-short-aligned", start + 15 * 60_000, 32, 63, "edge", "SHORT", 2),
  sample("edge-long-candidate", start + 20 * 60_000, 61, 34, "edge", "LONG"),
  sample("edge-long-aligned", start + 25 * 60_000, 63, 33, "edge", "LONG", -2),
];
const pageDecorated = decorateRecommendedSupportEntrySnapshots(pageRows);
const pageById = new Map(pageDecorated.map((trade) => [trade.id, trade]));
assert.equal(pageById.get("pump-short-aligned").recommendedSupportEntryClass, "BAD");
assert.equal(
  pageById.get("pump-short-aligned").recommendedSupportEntryCohortLabel,
  "ENTRY FLIP · PUMP SHORT ALIGNED",
);
assert.equal(pageById.get("edge-short-aligned").recommendedSupportEntryClass, "GOOD");
assert.equal(pageById.get("edge-long-aligned").recommendedSupportEntryClass, "BAD");
const pumpOnlyStats = paperSupportEntryStats(
  pageDecorated.filter((trade) => trade.sourcePage === "pump"),
);
assert.equal(pumpOnlyStats.groups.length, 2);
assert.equal(
  pumpOnlyStats.groups.find((group) => group.verdictLabel === "GOOD")?.total,
  0,
);
assert.equal(
  pumpOnlyStats.groups.find((group) => group.verdictLabel === "BAD")?.total,
  1,
);

console.log("recommended support entry tests: OK");
