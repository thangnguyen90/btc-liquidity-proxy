import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  LIQUID_FLOW_V2_FLAGPOLE_SHORT_KILL_DISCORD_LABELS,
  LIQUID_FLOW_V2_FLAGPOLE_SHORT_KILL_DISCORD_VERSION,
  buildLiquidFlowV2FlagpoleShortKillDiscordPayload,
  liquidFlowV2FlagpoleShortKillDiscordDedupeKey,
} from '../src/liquidFlowV2FlagpoleShortKillDiscord.js';

const classification = {
  labelKey: 'POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY',
  confidence: 92,
  signalCandleClosedAt: 24_000_000,
  flagpoleShortKillReadyAt: 24_000_000,
};
const row = {
  symbol: 'FLAGUSDT',
  classification,
  features: {
    markPrice: 1.165,
    shortLiquidationUsd: 50_000,
    prior5mShortLiquidationUsd: 18_000,
    shortLiquidationBurst: 2.8,
    openInterestDeltaPct: -0.2,
    flagpoleShortKill5m: {
      readyAt: 24_000_000,
      priorPumpPct: 12,
      pullbackPct: 7,
      barsAfterPriorPeak: 33,
      flagpoleBodyPct: 7.94,
      flagpoleRangeAtr: 4.8,
      flagpoleVolumeX: 5,
      flagpoleTakerDeltaPct: 60,
      confirmationLowerWickShare: 0.625,
      confirmationClosePosition: 0.875,
      confirmationClose: 1.165,
    },
  },
};

assert.equal(LIQUID_FLOW_V2_FLAGPOLE_SHORT_KILL_DISCORD_VERSION,
  'LIQUID_FLOW_V2_FLAGPOLE_SHORT_KILL_DISCORD_V1_20260818');
assert.equal(LIQUID_FLOW_V2_FLAGPOLE_SHORT_KILL_DISCORD_LABELS.has(classification.labelKey), true);
assert.equal(
  liquidFlowV2FlagpoleShortKillDiscordDedupeKey(row, classification),
  'FLAGUSDT|POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY|24000000',
);
const payload = buildLiquidFlowV2FlagpoleShortKillDiscordPayload(row, classification, 25_000_000);
assert.equal(payload.embeds.length, 1);
assert.equal(payload.embeds[0].color, 0x14b8a6);
assert.match(payload.embeds[0].description, /không phải pump đầu/i);
assert.match(payload.embeds[0].description, /Binance/);
assert.match(payload.embeds[0].description, /Coinglass/);
assert.match(payload.embeds[0].fields.find((field) => field.name.includes('Force BUY')).value, /50,000/);
assert.match(payload.embeds[0].fields.find((field) => field.name.includes('Paper plan')).value, /TP \+10% ROE/);
assert.match(payload.embeds[0].fields.find((field) => field.name.includes('Binance')).value, /KHÔNG đặt lệnh thật/);
assert.equal(buildLiquidFlowV2FlagpoleShortKillDiscordPayload({ classification: { labelKey: 'WAIT' } }), null);

const serverSource = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
assert.match(serverSource, /LIQ_FLOW_V2_FLAGPOLE_SHORT_KILL_WEBHOOK_URL/);
assert.equal((serverSource.match(/notifyLiquidFlowV2FlagpoleShortKillDiscord\(/g) ?? []).length, 3);
assert.doesNotMatch(serverSource.match(/const LIQUID_FLOW_V2_AUTO_REAL_LABELS[\s\S]*?\]\);/)?.[0] ?? '',
  /POST_PUMP_FLAGPOLE_SHORT_KILL_LONG_READY/);

console.log('Liquid Flow V2 flagpole short-kill Discord tests passed.');
