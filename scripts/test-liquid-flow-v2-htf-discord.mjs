import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  LIQUID_FLOW_V2_HTF_DISCORD_VERSION,
  buildLiquidFlowV2HtfDiscordPayload,
  liquidFlowV2HtfDiscordDedupeKey,
} from '../src/liquidFlowV2HtfDiscord.js';

assert.equal(LIQUID_FLOW_V2_HTF_DISCORD_VERSION, 'LIQUID_FLOW_V2_HTF_DISCORD_MTF_V2_20260811');
const shortRow = {
  symbol: 'BICOUSDT',
  classification: {
    labelKey: 'HTF_BEAR_15M_EMA99_PUMP_REJECT', side: 'SHORT', confidence: 88,
    reason: 'HTF bear pump rejected at EMA99.',
  },
  features: {
    markPrice: 0.04348, change24hPct: -20.26, change1hPct: 5.2, htfBearTier: 'A_BOTH',
    trend1h: { ready: true, bearish: true }, trend4h: { ready: true, bearish: true },
    ema99Retest15m: {
      candleClosedAt: 9_000_000, close: 0.04348, ema99: 0.04632,
      shortTouchDistancePct: 0.4, pumpPct: 6.2, givebackRatio: 0.48,
      volumeX: 2.1, takerDeltaPct: -4,
    },
  },
};
assert.equal(
  liquidFlowV2HtfDiscordDedupeKey(shortRow),
  'BICOUSDT|HTF_BEAR_15M_EMA99_PUMP_REJECT|9000000',
);
const shortPayload = buildLiquidFlowV2HtfDiscordPayload(shortRow, 9_000_001);
assert.match(shortPayload.embeds[0].title, /HTF BEAR.*BICOUSDT SHORT/);
assert.match(shortPayload.embeds[0].footer.text, /PAPER EVAL ONLY.*no Binance order/);
assert(shortPayload.embeds[0].fields.some((field) => field.name === 'Pump / Giveback'));

const longRow = structuredClone(shortRow);
longRow.symbol = 'TESTUSDT';
longRow.classification.labelKey = 'HTF_BULL_15M_EMA99_DUMP_RECLAIM';
longRow.classification.side = 'LONG';
longRow.features.htfBullTier = 'B_ONE';
longRow.features.ema99Retest15m = {
  candleClosedAt: 10_000_000, close: 1.05, ema99: 1.01,
  longTouchDistancePct: -0.35, dumpPct: 5.4, recoveryRatio: 0.52,
  volumeX: 1.9, takerDeltaPct: 3,
};
const longPayload = buildLiquidFlowV2HtfDiscordPayload(longRow, 10_000_001);
assert.match(longPayload.embeds[0].title, /HTF BULL.*TESTUSDT LONG/);
assert(longPayload.embeds[0].fields.some((field) => field.name === 'Dump / Recovery'));
const long5mRow = structuredClone(longRow);
long5mRow.classification.ema99RetestTimeframe = '5m';
long5mRow.classification.ema99RetestCandleClosedAt = 11_000_000;
long5mRow.features.ema99Retest5m = {
  candleClosedAt: 11_000_000, close: 1.05, ema99: 1.01,
  longTouchDistancePct: -12.7, dumpPct: 18.4, recoveryRatio: 0.62,
  volumeX: 2.8, takerDeltaPct: 4,
};
assert.equal(
  liquidFlowV2HtfDiscordDedupeKey(long5mRow),
  'TESTUSDT|HTF_BULL_15M_EMA99_DUMP_RECLAIM|11000000',
);
const long5mPayload = buildLiquidFlowV2HtfDiscordPayload(long5mRow, 11_000_001);
assert(long5mPayload.embeds[0].fields.some((field) => field.name === '5m close / EMA99'));
assert.equal(buildLiquidFlowV2HtfDiscordPayload({ classification: { labelKey: 'WAIT' } }), null);

const serverSource = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
assert.equal((serverSource.match(/notifyLiquidFlowV2HtfDiscord\(/g) ?? []).length, 3);
assert.match(serverSource, /LIQ_FLOW_V2_HTF_WEBHOOK_URL/);
assert.match(serverSource, /readyTransitions\.has\(symbol\)/);

console.log('Liquid Flow V2 HTF Discord tests passed');
