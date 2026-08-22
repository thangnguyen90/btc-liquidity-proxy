import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  LIQUID_FLOW_V2_FADING_WAVE_LIVE_PUMP_DISCORD_LABELS,
  LIQUID_FLOW_V2_FADING_WAVE_LIVE_PUMP_DISCORD_VERSION,
  buildLiquidFlowV2FadingWaveLivePumpDiscordPayload,
  liquidFlowV2FadingWaveLivePumpDiscordDedupeKey,
} from '../src/liquidFlowV2FadingWaveLivePumpDiscord.js';

const classification = {
  labelKey: 'FADING_WAVE_LIVE_PUMP_SHORT_READY',
  confidence: 91,
  signalCandleClosedAt: 30_000_000,
  signalLiveCandleOpenAt: 30_000_000,
};
const row = {
  symbol: 'DOLOUSDT',
  classification,
  features: {
    markPrice: 0.02355,
    fadingWaveLivePump5m: {
      liveCandleOpenAt: 30_000_000,
      ema99Slope12Pct: -0.62,
      downReturn12Pct: -4.8,
      belowEma99Bars: 11,
      barsSinceWavePeak: 33,
      waveDrawdownPct: 14.6,
      livePumpHighPct: 10.2,
      liveMarkPumpPct: 6.1,
      liveRangeAtr: 6.8,
      liveVolumeX: 8.2,
      liveTakerDeltaPct: 44,
      liveGivebackPct: 2.1,
      liveUpperWickShare: 0.31,
    },
  },
};

assert.equal(LIQUID_FLOW_V2_FADING_WAVE_LIVE_PUMP_DISCORD_VERSION,
  'LIQUID_FLOW_V2_FADING_WAVE_LIVE_PUMP_DISCORD_V1_20260818');
assert.equal(LIQUID_FLOW_V2_FADING_WAVE_LIVE_PUMP_DISCORD_LABELS.has(classification.labelKey), true);
assert.equal(
  liquidFlowV2FadingWaveLivePumpDiscordDedupeKey(row, classification),
  'DOLOUSDT|FADING_WAVE_LIVE_PUMP_SHORT_READY|30000000',
);
const payload = buildLiquidFlowV2FadingWaveLivePumpDiscordPayload(row, classification, 30_120_000);
assert.equal(payload.embeds.length, 1);
assert.equal(payload.embeds[0].color, 0xef4444);
assert.match(payload.embeds[0].description, /SHORT READY ngay trong nến 5m/i);
assert.match(payload.embeds[0].description, /Binance/);
assert.match(payload.embeds[0].description, /Coinglass/);
assert.match(payload.embeds[0].fields.find((field) => field.name.includes('Nến pump')).value, /10\.20%/);
assert.match(payload.embeds[0].fields.find((field) => field.name.includes('Binance')).value,
  /MARKET SHORT.*\$1.*5x/);
assert.match(payload.embeds[0].fields.find((field) => field.name.includes('Protection')).value,
  /TP \+10% ROE.*SL -20% ROE.*4 giờ/);
assert.equal(buildLiquidFlowV2FadingWaveLivePumpDiscordPayload({
  classification: { labelKey: 'WAIT' },
}), null);

const serverSource = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
assert.match(serverSource, /LIQ_FLOW_V2_FADING_WAVE_LIVE_PUMP_WEBHOOK_URL/);
assert.equal((serverSource.match(/notifyLiquidFlowV2FadingWaveLivePumpDiscord\(/g) ?? []).length, 3);
assert.match(serverSource.match(/const LIQUID_FLOW_V2_AUTO_REAL_LABELS[\s\S]*?\]\);/)?.[0] ?? '',
  /FADING_WAVE_LIVE_PUMP_SHORT_READY/);

console.log('Liquid Flow V2 fading-wave live-pump Discord tests passed.');
