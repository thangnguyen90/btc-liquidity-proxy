import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  LIQUID_FLOW_V2_EMA_FAN_DISCORD_LABELS,
  LIQUID_FLOW_V2_EMA_FAN_DISCORD_VERSION,
  buildLiquidFlowV2EmaFanDiscordPayload,
  liquidFlowV2EmaFanDiscordDedupeKey,
} from '../src/liquidFlowV2EmaFanDiscord.js';

assert.equal(LIQUID_FLOW_V2_EMA_FAN_DISCORD_VERSION, 'LIQUID_FLOW_V2_EMA_FAN_DISCORD_V2_ENTRY_ROUTING_20260814');
assert.deepEqual(
  [...LIQUID_FLOW_V2_EMA_FAN_DISCORD_LABELS],
  ['EMA_FAN_LONG_READY', 'EMA_FAN_LONG_IMPULSE_RUNNER', 'EMA_FAN_SHORT_READY'],
);

const row = {
  symbol: 'FANDOWNUSDT',
  features: {
    liquidityRank: 17,
    universeTier: 'EMA_FAN_SHORT_TOP_150',
    change24hPct: -8.2,
    change1hPct: -2.1,
    markPrice: 0.99,
    emaFanShort5m: {
      readyAt: 15_000_000,
      ema13: 1,
      ema25: 1.01,
      ema99: 1.02,
      gap1325Pct: 0.99,
      gap2599Pct: 0.98,
      priorMedianSpreadPct: 0.7,
      compressedBars: 10,
      volumeX: 3.2,
      rsi14: 31,
      distanceFromEma13Pct: 1.01,
    },
  },
};
const short = {
  labelKey: 'EMA_FAN_SHORT_READY',
  confidence: 88,
  signalCandleClosedAt: 15_000_000,
  reason: 'short ready',
};
assert.equal(liquidFlowV2EmaFanDiscordDedupeKey(row, short), 'FANDOWNUSDT|EMA_FAN_SHORT_READY|15000000');
const shortPayload = buildLiquidFlowV2EmaFanDiscordPayload(row, short, 16_000_000);
assert.match(shortPayload.embeds[0].title, /FANDOWNUSDT SHORT READY/);
assert.match(shortPayload.embeds[0].footer.text, /SHORT PAPER ONLY/);

const long = { labelKey: 'EMA_FAN_LONG_READY', confidence: 84, signalCandleClosedAt: 16_000_000 };
const longPayload = buildLiquidFlowV2EmaFanDiscordPayload({
  ...row,
  symbol: 'FANUPUSDT',
  features: { ...row.features, moverRank: 12, emaFanLong5m: row.features.emaFanShort5m },
}, long, 16_000_000);
assert.match(longPayload.embeds[0].title, /FANUPUSDT LONG READY/);
assert.match(longPayload.embeds[0].footer.text, /LONG LIMIT-FILL ROUTE/);
assert.match(longPayload.embeds[0].fields.find((field) => field.name === 'Entry route').value, /Paper LIMIT/);

const impulse = {
  labelKey: 'EMA_FAN_LONG_IMPULSE_RUNNER',
  confidence: 92,
  signalCandleClosedAt: 17_000_000,
};
const impulsePayload = buildLiquidFlowV2EmaFanDiscordPayload({
  ...row,
  symbol: 'AKEUSDT',
  features: { ...row.features, moverRank: 81, emaFanLong5m: row.features.emaFanShort5m },
}, impulse, 17_000_000);
assert.match(impulsePayload.embeds[0].title, /AKEUSDT LONG READY/);
assert.match(
  impulsePayload.embeds[0].fields.find((field) => field.name === 'Entry route').value,
  /Binance MARKET \$5/,
);
assert.match(impulsePayload.embeds[0].footer.text, /LONG IMPULSE MARKET/);
assert.equal(buildLiquidFlowV2EmaFanDiscordPayload(row, { labelKey: 'WAIT' }), null);

const serverSource = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
assert.match(serverSource, /LIQ_FLOW_V2_EMA_FAN_WEBHOOK_URL/);
assert.equal((serverSource.match(/notifyLiquidFlowV2EmaFanDiscord\(/g) ?? []).length, 3);
assert.match(serverSource, /transitions\.readyLabelKeys/);

console.log('Liquid Flow V2 EMA FAN Discord tests passed.');
