import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  CoinLevelLifecycleDiscordNotifier,
  buildCoinLevelRejectApproachDiscordPayload,
  detectCoinLevelRejectApproachEvents,
} from '../src/coinLevelLifecycleDiscord.js';

function zone(side, lifecycle, low, high, distancePct) {
  return {
    range: '48h',
    side,
    lifecycle,
    bandLow: low,
    bandHigh: high,
    distancePct,
    strength: 80,
    effectiveAttractionScore: lifecycle === 'REJECTED' ? 0 : 75,
  };
}

const base = {
  symbol: 'PROMUSDT',
  generatedAt: '2026-09-01T06:30:00.000Z',
  market: { markPrice: 5.44 },
  trend: { bias: 'BEARISH' },
  recommendation: { confirmation: { breakdown: 'CONFIRMED_15M', breakout: 'WAITING' } },
  coinglass: {
    available: true,
    stale: false,
    combined: { liquidityBias: 'LOWER_FIRST' },
    frames: [{
      range: '48h',
      above: [zone('ABOVE', 'REJECTED', 5.63, 5.74, 4.3)],
      below: [zone('BELOW', 'APPROACHING', 5.33, 5.42, -1.7)],
    }],
  },
};

const shortEvents = detectCoinLevelRejectApproachEvents(base);
assert.equal(shortEvents.length, 1);
assert.equal(shortEvents[0].side, 'SHORT');
assert.equal(shortEvents[0].eventType, 'UPPER_REJECTED_LOWER_APPROACHING');
assert.equal(shortEvents[0].confirmation, 'CONFIRMED_15M');
const shortPayload = buildCoinLevelRejectApproachDiscordPayload(shortEvents[0]);
assert.match(shortPayload.embeds[0].title, /PROMUSDT.*SHORT WATCH/);
assert.match(shortPayload.embeds[0].description, /OBSERVE ONLY/);
assert.match(shortPayload.embeds[0].fields.at(-1).value, /CoinGlass.*Binance/);

const longAnalysis = structuredClone(base);
longAnalysis.coinglass.combined.liquidityBias = 'UPPER_FIRST';
longAnalysis.coinglass.frames[0].above = [zone('ABOVE', 'APPROACHING', 5.55, 5.6, 2.5)];
longAnalysis.coinglass.frames[0].below = [zone('BELOW', 'REJECTED', 5.2, 5.3, -3.5)];
const longEvents = detectCoinLevelRejectApproachEvents(longAnalysis);
assert.equal(longEvents.length, 1);
assert.equal(longEvents[0].side, 'LONG');
assert.equal(longEvents[0].eventType, 'LOWER_REJECTED_UPPER_APPROACHING');

const freshShort = structuredClone(base);
freshShort.coinglass.frames[0].below[0].lifecycle = 'FRESH';
const freshShortEvents = detectCoinLevelRejectApproachEvents(freshShort);
assert.equal(freshShortEvents.length, 1);
assert.equal(freshShortEvents[0].side, 'SHORT');
assert.equal(freshShortEvents[0].eventType, 'UPPER_REJECTED_LOWER_FRESH');
assert.equal(freshShortEvents[0].targetLifecycle, 'FRESH');
assert.match(buildCoinLevelRejectApproachDiscordPayload(freshShortEvents[0]).embeds[0].title, /REJECTED → FRESH.*SHORT WATCH/);

const freshLong = structuredClone(longAnalysis);
freshLong.coinglass.frames[0].above[0].lifecycle = 'FRESH';
const freshLongEvents = detectCoinLevelRejectApproachEvents(freshLong);
assert.equal(freshLongEvents.length, 1);
assert.equal(freshLongEvents[0].side, 'LONG');
assert.equal(freshLongEvents[0].eventType, 'LOWER_REJECTED_UPPER_FRESH');
assert.equal(freshLongEvents[0].targetLifecycle, 'FRESH');
assert.match(buildCoinLevelRejectApproachDiscordPayload(freshLongEvents[0]).embeds[0].description, /target tham khảo/);

const noTarget = structuredClone(base);
noTarget.coinglass.frames[0].below[0].lifecycle = 'SWEPT';
const rejectedOnlyEvents = detectCoinLevelRejectApproachEvents(noTarget);
assert.equal(rejectedOnlyEvents.length, 1);
assert.equal(rejectedOnlyEvents[0].eventType, 'ABOVE_REJECTED_ONE_SIDED');
assert.equal(rejectedOnlyEvents[0].side, 'SHORT');
assert.match(buildCoinLevelRejectApproachDiscordPayload(rejectedOnlyEvents[0]).embeds[0].description, /CẢNH BÁO MỘT PHÍA/);
assert.match(buildCoinLevelRejectApproachDiscordPayload(rejectedOnlyEvents[0]).embeds[0].fields[3].value, /đủ điều kiện gửi cảnh báo/);

const approachingOnly = structuredClone(base);
approachingOnly.coinglass.frames[0].above = [];
const approachingOnlyEvents = detectCoinLevelRejectApproachEvents(approachingOnly);
assert.equal(approachingOnlyEvents.length, 1);
assert.equal(approachingOnlyEvents[0].eventType, 'BELOW_APPROACHING_ONE_SIDED');
assert.equal(approachingOnlyEvents[0].side, 'SHORT');
assert.match(buildCoinLevelRejectApproachDiscordPayload(approachingOnlyEvents[0]).embeds[0].title, /APPROACHING MỘT PHÍA/);

const rejectedLowerOnly = structuredClone(longAnalysis);
rejectedLowerOnly.coinglass.frames[0].above = [];
const rejectedLowerOnlyEvents = detectCoinLevelRejectApproachEvents(rejectedLowerOnly);
assert.equal(rejectedLowerOnlyEvents.length, 1);
assert.equal(rejectedLowerOnlyEvents[0].eventType, 'BELOW_REJECTED_ONE_SIDED');
assert.equal(rejectedLowerOnlyEvents[0].side, 'LONG');

const approachingUpperOnly = structuredClone(longAnalysis);
approachingUpperOnly.coinglass.frames[0].below = [];
const approachingUpperOnlyEvents = detectCoinLevelRejectApproachEvents(approachingUpperOnly);
assert.equal(approachingUpperOnlyEvents.length, 1);
assert.equal(approachingUpperOnlyEvents[0].eventType, 'ABOVE_APPROACHING_ONE_SIDED');
assert.equal(approachingUpperOnlyEvents[0].side, 'LONG');

const driftingBand = structuredClone(base);
driftingBand.coinglass.frames[0].above[0].bandLow = 5.631;
driftingBand.coinglass.frames[0].above[0].bandHigh = 5.741;
assert.equal(
  detectCoinLevelRejectApproachEvents(driftingBand)[0].dedupeKey,
  shortEvents[0].dedupeKey,
);
const stale = structuredClone(base);
stale.coinglass.stale = true;
assert.equal(detectCoinLevelRejectApproachEvents(stale).length, 0);
const staleBinance = structuredClone(base);
staleBinance.freshness = { binance: 'STALE_LAST_GOOD', stale: true };
assert.equal(detectCoinLevelRejectApproachEvents(staleBinance).length, 0);

const secondRejection = structuredClone(base);
secondRejection.coinglass.frames = [];
secondRejection.recommendation.secondRejectionShort = {
  ready: true,
  state: 'READY',
  entryPrice: 5.44,
  takeProfitPrice: 5.2,
  takeProfit2Price: 5.05,
  invalidationPrice: 5.6,
  rewardPct: 4.41,
  riskPct: 2.94,
  rewardRiskRatio: 1.5,
  firstReject: { openTime: Date.UTC(2026, 8, 1, 5, 0), high: 5.56, close: 5.42 },
  secondReject: { openTime: Date.UTC(2026, 8, 1, 6, 0), high: 5.55, close: 5.38, upperWickRangeRatio: 0.42, takerBuyPct: 44 },
  targetZone: zone('BELOW', 'APPROACHING', 5.16, 5.2, -4.4),
};
const secondEvents = detectCoinLevelRejectApproachEvents(secondRejection);
assert.equal(secondEvents.length, 1);
assert.equal(secondEvents[0].eventType, 'COIN_LEVEL_SECOND_REJECTION_ALIGNED_SHORT');
const secondPayload = buildCoinLevelRejectApproachDiscordPayload(secondEvents[0]);
assert.match(secondPayload.embeds[0].title, /REJECT LẦN 2.*SHORT READY/);
assert.match(secondPayload.embeds[0].fields[0].value, /TP1.*TP2.*Vô hiệu/s);

const secondRejectionLong = structuredClone(base);
secondRejectionLong.trend.bias = 'BULLISH';
secondRejectionLong.coinglass.combined.liquidityBias = 'UPPER_FIRST';
secondRejectionLong.coinglass.frames = [];
secondRejectionLong.recommendation.secondRejectionLong = {
  ready: true,
  state: 'READY',
  entryPrice: 5.44,
  takeProfitPrice: 5.7,
  takeProfit2Price: 5.84,
  invalidationPrice: 5.28,
  rewardPct: 4.78,
  riskPct: 2.94,
  rewardRiskRatio: 1.63,
  firstReject: { openTime: Date.UTC(2026, 8, 1, 5, 0), low: 5.31, close: 5.42 },
  secondReject: { openTime: Date.UTC(2026, 8, 1, 6, 0), low: 5.32, close: 5.48, lowerWickRangeRatio: 0.45, takerBuyPct: 56 },
  confirmationCandle: { barsAfterSecondReject: 1, takerBuyPct: 56 },
  targetZone: zone('ABOVE', 'APPROACHING', 5.7, 5.75, 4.8),
};
const secondLongEvents = detectCoinLevelRejectApproachEvents(secondRejectionLong);
assert.equal(secondLongEvents.length, 1);
assert.equal(secondLongEvents[0].eventType, 'COIN_LEVEL_SECOND_REJECTION_ALIGNED_LONG');
const secondLongPayload = buildCoinLevelRejectApproachDiscordPayload(secondLongEvents[0]);
assert.match(secondLongPayload.embeds[0].title, /REJECT ĐÁY LẦN 2.*LONG READY/);
assert.match(secondLongPayload.embeds[0].description, /ALIGNED_LONG/);
assert.match(secondLongPayload.embeds[0].fields[2].value, /Râu dưới/);
assert.match(secondLongPayload.embeds[0].fields[3].name, /TARGET TRÊN/);

const temporaryDir = await mkdtemp(join(tmpdir(), 'coin-level-discord-'));
let postCount = 0;
try {
  const notifier = new CoinLevelLifecycleDiscordNotifier({
    stateFile: join(temporaryDir, 'state.json'),
    webhookUrl: () => 'https://discord.test/webhook',
    now: () => Date.UTC(2026, 8, 1, 6, 30, 0),
    fetchImpl: async () => {
      postCount += 1;
      return { ok: true, status: 204, json: async () => ({}) };
    },
  });
  const first = await notifier.notify(base);
  const duplicate = await notifier.notify(base);
  assert.equal(first.sent, 1);
  assert.equal(duplicate.sent, 0);
  assert.equal(duplicate.reason, 'deduped');
  assert.equal(postCount, 1);
} finally {
  await rm(temporaryDir, { recursive: true, force: true });
}

console.log('coin level lifecycle Discord tests passed');
