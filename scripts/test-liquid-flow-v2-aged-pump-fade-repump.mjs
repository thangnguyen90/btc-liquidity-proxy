import assert from 'node:assert/strict';
import {
  buildLiquidHeatmapFlowV2Features,
  classifyLiquidHeatmapFlowV2,
  liquidHeatmapFlowV2Stats,
} from '../src/liquidHeatmapFlowV2.js';
import {
  LIQUID_FLOW_V2_AGED_PUMP_FADE_REPUMP_VERSION,
  buildAgedPumpFadeRepumpSnapshot,
} from '../src/liquidFlowV2AgedPumpFadeRepump.js';
import {
  LIQUID_FLOW_V2_AGED_PUMP_FADE_REPUMP_DISCORD_VERSION,
  buildLiquidFlowV2AgedPumpFadeRepumpDiscordPayload,
  liquidFlowV2AgedPumpFadeRepumpDiscordDedupeKey,
} from '../src/liquidFlowV2AgedPumpFadeRepumpDiscord.js';
import {
  buildLiquidFlowV2PaperPlan,
  liquidFlowV2AutoBinanceProfile,
} from '../src/liquidFlowV2Paper.js';

const intervalMs = 5 * 60_000;
const bars = Array.from({ length: 180 }, (_, index) => {
  let center;
  if (index < 60) center = 100 + index * 0.08;
  else center = 112 - (index - 61) * (32 / 117);
  let open = center + Math.sin(index * 0.6) * 0.18;
  let close = center + Math.sin((index + 1) * 0.6) * 0.18;
  let high = Math.max(open, close) + 0.35;
  let low = Math.min(open, close) - 0.35;
  let quoteVolume = 1_000;
  let takerBuyQuoteVolume = 510;
  if (index === 60) {
    open = 105;
    high = 130;
    low = 104;
    close = 126;
    quoteVolume = 7_000;
    takerBuyQuoteVolume = 5_000;
  } else if (index === 61) {
    open = 126;
    high = 127;
    low = 111;
    close = 112;
    quoteVolume = 5_000;
    takerBuyQuoteVolume = 1_500;
  } else if (index === 178) {
    open = 80;
    high = 88;
    low = 79.8;
    close = 85.5;
    quoteVolume = 8_000;
    takerBuyQuoteVolume = 5_000;
  } else if (index === 179) {
    open = 85.5;
    high = 85.8;
    low = 81;
    close = 82;
    quoteVolume = 2_500;
    takerBuyQuoteVolume = 900;
  }
  return {
    open,
    high,
    low,
    close,
    quoteVolume,
    takerBuyQuoteVolume,
    openTime: index * intervalMs,
    closeTime: (index + 1) * intervalMs - 1,
  };
});
const now = bars.at(-1).closeTime + 1;

assert.equal(
  LIQUID_FLOW_V2_AGED_PUMP_FADE_REPUMP_VERSION,
  'LIQUID_FLOW_V2_AGED_PUMP_FADE_REPUMP_V1_20260901',
);
const snapshot = buildAgedPumpFadeRepumpSnapshot(bars, now);
assert.equal(snapshot.shortReady, true);
assert.equal(snapshot.stage, 'REPUMP_SHORT_ALERT');
assert(snapshot.priorPumpPct >= 10);
assert(snapshot.barsSincePriorPeak >= 8);
assert(snapshot.waveDrawdownPct >= 10);
assert(snapshot.signalHighOpenPct >= 4.5);
assert(snapshot.signalRangeAtr >= 2.2);
assert(snapshot.signalVolumeX >= 2.5);
assert(snapshot.signalTakerDeltaPct >= 5);
assert(snapshot.signalUpperWickShare >= 0.2);

const firstPumpOnly = bars.map((bar, index) => {
  if (index >= 178) return bar;
  const center = 100 - index * (20 / 177);
  return {
    ...bar,
    open: center + 0.05,
    high: center + 0.25,
    low: center - 0.25,
    close: center - 0.05,
    quoteVolume: 1_000,
    takerBuyQuoteVolume: 510,
  };
});
assert.equal(buildAgedPumpFadeRepumpSnapshot(firstPumpOnly, now).shortReady, false);

const noRejection = bars.map((bar, index) => index === 178
  ? { ...bar, close: 87.9 }
  : bar);
assert.equal(buildAgedPumpFadeRepumpSnapshot(noRejection, now).shortReady, false);

const features = buildLiquidHeatmapFlowV2Features({
  market: {
    markPrice: 82,
    change24hPct: -15,
    quoteVolume: 50_000_000,
    liquidityRank: 42,
    postPumpUniverse: true,
    fadingWaveUniverse: true,
    universeTier: 'POST_PUMP_TOP_150',
  },
  klines: bars,
  now,
});
const classification = classifyLiquidHeatmapFlowV2(features);
const alert = classification.secondaryLabels.find((row) =>
  row.labelKey === 'AGED_PUMP_FADE_REPUMP_SHORT_ALERT');
assert(alert);
assert.equal(alert.phase, 'READY');
assert.equal(alert.observationOnly, true);
assert.equal(alert.affectsOrders, false);
assert.equal(alert.affectsBinance, false);
assert.equal(alert.affectsEntry, false);
assert.equal(alert.affectsSize, false);
assert.equal(alert.affectsSlTp, false);

const row = { symbol: 'PROMUSDT', features, classification };
const statWithoutPaper = liquidHeatmapFlowV2Stats([row], [])
  .find((item) => item.key === 'AGED_PUMP_FADE_REPUMP_SHORT_ALERT');
assert(statWithoutPaper);
assert.equal(statWithoutPaper.whitelistKey, 'heatmap-v2:AGED_PUMP_FADE_REPUMP_SHORT_ALERT');
assert.equal(statWithoutPaper.whitelistEligible, false);
const statWithWinningClosedPaper = liquidHeatmapFlowV2Stats([row], [{
  status: 'CLOSED',
  labelKey: 'AGED_PUMP_FADE_REPUMP_SHORT_ALERT',
  netRoe: 5.1,
}]).find((item) => item.key === 'AGED_PUMP_FADE_REPUMP_SHORT_ALERT');
assert.equal(statWithWinningClosedPaper.whitelistEligible, true);

assert.equal(buildLiquidFlowV2PaperPlan({
  ...row,
  classification: alert,
}, { marginUsdt: 10, leverage: 5 }), null);
assert.deepEqual(
  liquidFlowV2AutoBinanceProfile(alert, {}),
  { eligible: false, cohort: null, marginUsdt: null, leverage: null, source: null },
);

assert.equal(
  LIQUID_FLOW_V2_AGED_PUMP_FADE_REPUMP_DISCORD_VERSION,
  'LIQUID_FLOW_V2_AGED_PUMP_FADE_REPUMP_DISCORD_V1_20260901',
);
const dedupeKey = liquidFlowV2AgedPumpFadeRepumpDiscordDedupeKey(row, alert);
assert.equal(dedupeKey, `PROMUSDT|AGED_PUMP_FADE_REPUMP_SHORT_ALERT|${snapshot.readyAt}`);
const payload = buildLiquidFlowV2AgedPumpFadeRepumpDiscordPayload(row, alert, now);
assert.equal(payload.embeds[0].color, 0xf59e0b);
assert(payload.embeds[0].description.includes('OBSERVE ONLY'));
assert(payload.embeds[0].description.includes('binance.com'));
assert(payload.embeds[0].description.includes('coinglass.com'));
assert(payload.embeds[0].fields.some((field) => field.value.includes('không tạo entry')));

console.log('liquid flow v2 aged pump fade repump tests passed');
