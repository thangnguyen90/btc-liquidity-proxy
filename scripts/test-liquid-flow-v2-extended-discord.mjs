import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  LIQUID_FLOW_V2_EXTENDED_DISCORD_VERSION,
  buildLiquidFlowV2ExtendedDiscordPayload,
  liquidFlowV2ExtendedDiscordDedupeKey,
} from '../src/liquidFlowV2ExtendedDiscord.js';

assert.equal(LIQUID_FLOW_V2_EXTENDED_DISCORD_VERSION, 'LIQUID_FLOW_V2_PANIC_DISCORD_V2_PRIMARY_RECLAIM_20260812');
const row = {
  symbol: 'GENIUSUSDT',
  classification: {
    labelKey: 'EXTENDED_EMA99_PANIC_RECLAIM_LONG',
    confidence: 82,
    reason: 'Rank 47 panic reclaim.',
  },
  features: {
    candleClosedAt: 12_000_000,
    moverRank: 47,
    universeTier: 'EXTENDED_21_60',
    markPrice: 0.369,
    ema99: 0.3685,
    ema99LongTouchDistancePct: -0.4,
    ema99DistancePct: 0.14,
    pullbackFromRecentHighPct: 5.4,
    reboundFromApproachLowPct: 0.8,
    volumeX: 1.8,
    takerDeltaPct: -8,
    change24hPct: 4.44,
    change1hPct: -1.2,
    htfBullTier: 'B_ONE',
  },
};
assert.equal(
  liquidFlowV2ExtendedDiscordDedupeKey(row),
  'GENIUSUSDT|EXTENDED_EMA99_PANIC_RECLAIM_LONG|12000000',
);
const payload = buildLiquidFlowV2ExtendedDiscordPayload(row, 12_000_001);
assert.match(payload.embeds[0].title, /GENIUSUSDT LONG/);
assert.match(payload.embeds[0].footer.text, /OBSERVE \+ PAPER ONLY.*no Binance order/);
assert(payload.embeds[0].fields.some((field) => field.name === 'Mover rank' && field.value.includes('#47')));
assert.equal(buildLiquidFlowV2ExtendedDiscordPayload({ classification: { labelKey: 'WAIT' } }), null);

const primaryReadyRow = {
  ...row,
  symbol: 'HOLOUSDT',
  classification: {
    labelKey: 'PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY',
    confidence: 86,
    reason: 'Primary panic reclaim.',
  },
  features: {
    ...row.features,
    candleClosedAt: 12_300_000,
    moverRank: 4,
    universeTier: 'PRIMARY_1_20',
  },
};
assert.equal(
  liquidFlowV2ExtendedDiscordDedupeKey(primaryReadyRow),
  'HOLOUSDT|PRIMARY_EMA99_PANIC_RECLAIM_LONG_READY|12300000',
);
const primaryPayload = buildLiquidFlowV2ExtendedDiscordPayload(primaryReadyRow, 12_300_001);
assert.match(primaryPayload.embeds[0].title, /PRIMARY PANIC.*HOLOUSDT LONG READY/);
assert.equal(
  buildLiquidFlowV2ExtendedDiscordPayload({ classification: { labelKey: 'PRIMARY_EMA99_PANIC_FLUSH_ACTIVE' } }),
  null,
);

const serverSource = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
assert.equal((serverSource.match(/notifyLiquidFlowV2ExtendedDiscord\(/g) ?? []).length, 3);
assert.match(serverSource, /LIQ_FLOW_V2_EXTENDED_PANIC_WEBHOOK_URL/);
assert.match(serverSource, /LIQ_FLOW_V2_PANIC_WEBHOOK_URL/);
assert.match(serverSource, /selectLiquidHeatmapFlowV2ExtendedCandidates/);
assert.match(serverSource, /liquidHeatmapFlowV2ExtendedPrefilter/);

console.log('Liquid Flow V2 extended panic Discord tests passed');
