import assert from "node:assert/strict";
import {
  paperComboStats,
  paperLayerGroupStats,
  paperRuleSizeStats,
  paperSummary,
  recommendedLivePricingStats,
} from "../src/recommendedSignals.js";

const closed = {
  id: "closed-1",
  status: "CLOSED",
  pnl: 2,
  roe: 1,
  sourcePage: "ema",
  recommendationBtcPhase: "BTC_DOWN_MID",
  recommendationCombo: "TEST_COMBO",
  recommendationLabel: "EMA TEST",
  recommendedTradePlanLabel: "TEST $1",
  recommendedSourceLayer: "GOOD",
};
const active = {
  id: "active-1",
  status: "OPEN",
  pnl: -7,
  roe: -3.5,
  markPrice: 93,
  markSource: "recommended-socket",
  markUpdatedAt: Date.parse("2026-07-29T05:00:00.000Z"),
  sourcePage: "ema",
  recommendationBtcPhase: "BTC_DOWN_MID",
  recommendationCombo: "TEST_COMBO",
  recommendationLabel: "EMA TEST",
  recommendedTradePlanLabel: "TEST $1",
  recommendedSourceLayer: "GOOD",
};
const pending = {
  ...active,
  id: "pending-1",
  status: "PENDING",
  pnl: 99,
  markPrice: null,
  markSource: null,
};

const summary = paperSummary([closed, active, pending]);
assert.equal(summary.closedPnl, 2);
assert.equal(summary.activePnl, -7);
assert.equal(summary.pnl, -5);

const combo = paperComboStats([closed, active, pending])[0];
assert.equal(combo.closedPnl, 2);
assert.equal(combo.activePnl, -7);
assert.equal(combo.pnl, -5);
assert.equal(
  combo.verdict,
  "GOOD",
  "live PnL must not change the closed-trade backtest verdict",
);

const rule = paperRuleSizeStats([closed, active, pending])[0];
assert.equal(rule.closedPnl, 2);
assert.equal(rule.activePnl, -7);
assert.equal(rule.pnl, -5);

const layer = paperLayerGroupStats([closed, active, pending], (trade) => ({
  key: trade.recommendedSourceLayer,
  label: `SOURCE ${trade.recommendedSourceLayer}`,
  tier: trade.recommendedSourceLayer,
}))[0];
assert.equal(layer.closedPnl, 2);
assert.equal(layer.activePnl, -7);
assert.equal(layer.pnl, -5);

const pricing = recommendedLivePricingStats([
  active,
  { ...active, id: "active-2", markPrice: null, markSource: null },
]);
assert.equal(pricing.active, 2);
assert.equal(pricing.pricedActive, 1);
assert.equal(pricing.socketPricedActive, 1);
assert.equal(pricing.missingActive, 1);
assert.equal(pricing.persistsTickPnl, false);

console.log("recommended live active PnL tests: OK");
