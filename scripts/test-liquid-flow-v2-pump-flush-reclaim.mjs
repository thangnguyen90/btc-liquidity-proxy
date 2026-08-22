import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  LIQUID_HEATMAP_FLOW_V2_LABELS,
  PUMP_FLUSH_RECLAIM_VERSION,
  buildLiquidHeatmapFlowV2Features,
  buildPumpFlushReclaimSnapshot,
  classifyLiquidHeatmapFlowV2,
  liquidHeatmapFlowV2Stats,
} from '../src/liquidHeatmapFlowV2.js';
import {
  buildLiquidFlowV2PaperPlan,
  liquidFlowV2AutoBinanceProfile,
} from '../src/liquidFlowV2Paper.js';
import { normalizeLiquidLiveCardKey } from '../src/liquidLiveCardWhitelist.js';

const stepMs = 5 * 60_000;
const now = Date.now();
const startAt = now - 60 * stepMs;
const klines = [];
for (let index = 0; index < 50; index += 1) {
  klines.push({
    openTime: startAt + index * stepMs,
    closeTime: startAt + (index + 1) * stepMs - 1,
    open: 1,
    high: 1.002,
    low: 0.998,
    close: 1,
    quoteVolume: 100_000,
    takerBuyQuoteVolume: 50_000,
  });
}

function addBar(open, high, low, close, quoteVolume, takerBuyQuoteVolume) {
  const index = klines.length;
  klines.push({
    openTime: startAt + index * stepMs,
    closeTime: startAt + (index + 1) * stepMs - 1,
    open,
    high,
    low,
    close,
    quoteVolume,
    takerBuyQuoteVolume,
  });
}

// Pump 9%, flush 97.8% back to launch base, hold, then one CLOSED bullish reclaim.
addBar(1, 1.09, 1, 1.06, 800_000, 440_000);
addBar(1.06, 1.06, 1.025, 1.03, 300_000, 150_000);
addBar(1.03, 1.035, 1.005, 1.01, 220_000, 105_000);
addBar(1.01, 1.02, 1.002, 1.015, 150_000, 75_000);
addBar(1.015, 1.04, 1.014, 1.038, 220_000, 121_000);

const detector = buildPumpFlushReclaimSnapshot(klines, now);
assert.equal(PUMP_FLUSH_RECLAIM_VERSION, 'PUMP_FLUSH_RECLAIM_5M_V1_20260816');
assert.equal(detector.stage, 'LONG_READY');
assert.equal(detector.longReady, true);
assert.equal(detector.readyAt, klines.at(-1).closeTime);
assert(detector.pumpPct >= 8);
assert(detector.retracePct >= 55 && detector.retracePct <= 105);
assert(detector.reclaimTakerDeltaPct >= 5);

const beforeClosedReclaim = buildPumpFlushReclaimSnapshot([
  ...klines.slice(0, -1),
  { ...klines.at(-1), closeTime: now + stepMs },
], now);
assert.equal(beforeClosedReclaim.longReady, false, 'An open reclaim candle must never arm paper/Binance.');

const features = buildLiquidHeatmapFlowV2Features({
  market: {
    symbol: 'CASEUSDT',
    markPrice: 1.038,
    change24hPct: 8,
    quoteVolume: 52_000_000,
    liquidityRank: 12,
    postPumpUniverse: true,
    moverSide: 'UP',
    moverRank: 5,
  },
  klines,
  now,
});
const classification = classifyLiquidHeatmapFlowV2(features);
assert.equal(classification.labelKey, 'PUMP_FLUSH_RECLAIM_LONG_READY');
assert.equal(classification.phase, 'READY');
assert.equal(classification.observationOnly, false);
assert.equal(classification.affectsOrders, true);
assert.equal(classification.affectsBinance, true);
assert.equal(classification.signalCandleClosedAt, klines.at(-1).closeTime);

const whitelistKey = 'heatmap-v2:PUMP_FLUSH_RECLAIM_LONG_READY';
assert.equal(
  LIQUID_HEATMAP_FLOW_V2_LABELS.PUMP_FLUSH_RECLAIM_LONG_READY.key,
  'PUMP_FLUSH_RECLAIM_LONG_READY',
);
assert.equal(normalizeLiquidLiveCardKey(whitelistKey), whitelistKey);
const emptyStat = liquidHeatmapFlowV2Stats([], [])
  .find((row) => row.key === 'PUMP_FLUSH_RECLAIM_LONG_READY');
assert.equal(emptyStat.whitelistKey, whitelistKey);
assert.equal(emptyStat.whitelistEligible, false, 'The new checkbox must be default-off before closed AvgROE > 4%.');
const eligibleStat = liquidHeatmapFlowV2Stats([], [{
  status: 'CLOSED',
  labelKey: 'PUMP_FLUSH_RECLAIM_LONG_READY',
  netRoe: 5.25,
}]).find((row) => row.key === 'PUMP_FLUSH_RECLAIM_LONG_READY');
assert.equal(eligibleStat.paperClosed, 1);
assert.equal(eligibleStat.paperAvgRoe, 5.25);
assert.equal(eligibleStat.whitelistEligible, true);

const autoProfile = liquidFlowV2AutoBinanceProfile(classification);
assert.deepEqual(autoProfile, {
  eligible: true,
  cohort: 'PUMP_FLUSH_RECLAIM',
  marginUsdt: 1.5,
  leverage: 5,
  source: 'liquid-flow-v2-pump-flush-reclaim',
});
assert.equal(liquidFlowV2AutoBinanceProfile(classification, {
  pumpFlushBinanceEnabled: false,
}).eligible, false);

const paperPlan = buildLiquidFlowV2PaperPlan({
  symbol: 'CASEUSDT',
  classification,
  features,
});
assert.equal(paperPlan.side, 'LONG');
assert.equal(paperPlan.entryMode, 'IMMEDIATE_MARK');
assert.equal(paperPlan.entryBasis, 'PUMP_FLUSH_RECLAIM_5M_CLOSED_MARK');
assert.equal(paperPlan.entryPrice, 1.038);
assert.equal(paperPlan.leverage, 5);
assert(paperPlan.takeProfit > paperPlan.entryPrice);
assert(paperPlan.stopLoss < paperPlan.entryPrice);

const serverSource = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
assert.match(serverSource, /'PUMP_FLUSH_RECLAIM_LONG_READY'/);
assert.match(serverSource, /LIQ_FLOW_V2_PUMP_FLUSH_BINANCE_ENABLED/);
assert.match(serverSource, /LIQ_FLOW_V2_PUMP_FLUSH_BINANCE_MARGIN_USDT \?\? 1\.5/);
assert.match(serverSource, /profile\.cohort === 'PUMP_FLUSH_RECLAIM'/);
assert.match(serverSource, /notionalUsdt: marginUsdt \* leverage/);
assert.match(serverSource, /klineCache\.needsRefresh\([\s\S]*postPumpSymbols,[\s\S]*'5m',[\s\S]*40,[\s\S]*liquidFlowV2KlineMaxAgeMs\['5m'\]/);
assert.match(serverSource, /pumpFlush\.watchReady === true \|\| pumpFlush\.longReady === true/);

console.log('liquid flow v2 pump-flush-reclaim tests passed');
