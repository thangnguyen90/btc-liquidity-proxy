import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  LIQUID_FLOW_V2_KILL_LONG_DISCORD_LABELS,
  LIQUID_FLOW_V2_KILL_LONG_DISCORD_VERSION,
  buildLiquidFlowV2KillLongDiscordPayload,
  liquidFlowV2KillLongDiscordDedupeKey,
} from '../src/liquidFlowV2KillLongDiscord.js';

const classification = {
  labelKey: 'KILL_LONG_EXHAUSTION_RECLAIM_LONG_READY',
  confidence: 91,
  signalCandleClosedAt: 15_000_000,
};
const row = {
  symbol: 'HEMIUSDT',
  classification,
  features: {
    candleClosedAt: 15_000_000,
    markPrice: 0.0058,
    lastClosedCandle: { close: 0.0058 },
    pullbackFromRecentHighPct: 18,
    reboundFromApproachLowPct: 1.2,
    longLiquidationUsd: 80_000,
    prior5mLongLiquidationUsd: 300_000,
    longLiquidationDecayRatio: 0.267,
    openInterestDelta5mPct: -4.5,
    openInterestPriorDeltaPct: -1.2,
    openInterestDeltaPct: -0.05,
    ema13: 0.0057,
    ema25: 0.00572,
    higherLowConfirmed: true,
    volumeX: 2.8,
    takerDeltaPct: 7,
  },
};

assert.equal(LIQUID_FLOW_V2_KILL_LONG_DISCORD_VERSION,
  'LIQUID_FLOW_V2_KILL_LONG_EXHAUSTION_DISCORD_V1_20260815');
assert.equal(LIQUID_FLOW_V2_KILL_LONG_DISCORD_LABELS.has(classification.labelKey), true);
assert.equal(
  liquidFlowV2KillLongDiscordDedupeKey(row, classification),
  'HEMIUSDT|KILL_LONG_EXHAUSTION_RECLAIM_LONG_READY|15000000',
);
const payload = buildLiquidFlowV2KillLongDiscordPayload(row, classification, 16_000_000);
assert.equal(payload.embeds.length, 2);
assert.equal(payload.embeds[0].color, 0x22c55e);
assert.equal(payload.embeds[1].color, 0xf59e0b);
assert.match(payload.embeds[0].description, /LONG READY/);
assert.match(payload.embeds[0].fields.find((field) => field.name.includes('Force SELL')).value, /300,000/);
assert.match(payload.embeds[1].description, /Force SELL/);
assert.equal(buildLiquidFlowV2KillLongDiscordPayload({ classification: { labelKey: 'WAIT' } }), null);

const serverSource = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
assert.match(serverSource, /LIQ_FLOW_V2_KILL_LONG_RECLAIM_WEBHOOK_URL/);
assert.equal((serverSource.match(/notifyLiquidFlowV2KillLongDiscord\(/g) ?? []).length, 3);

console.log('Liquid Flow V2 kill-long exhaustion Discord tests passed.');
