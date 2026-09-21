#!/usr/bin/env node

import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  PUMP_FLUSH_RECLAIM_VERSION,
  PumpFlushReclaimDiscordNotifier,
  detectPumpFlushReclaim,
  pumpFlushReclaimPayload,
  scanPumpFlushReclaim,
} from '../src/pumpFlushReclaim.js';

const FIVE_MINUTES = 5 * 60_000;
const FIFTEEN_MINUTES = 15 * 60_000;
const NOW = Date.UTC(2026, 8, 16, 12, 0, 0);

function bar(openTime, interval, open, high, low, close, quoteVolume = 1_000_000,
  takerBuyRatio = 0.5) {
  return {
    openTime,
    open,
    high,
    low,
    close,
    volume: quoteVolume / close,
    closeTime: openTime + interval - 1,
    quoteVolume,
    takerBuyQuoteVolume: quoteVolume * takerBuyRatio,
  };
}

function longFixture() {
  const bars15m = [];
  const start15 = NOW - 47 * FIFTEEN_MINUTES;
  let previous = 100;
  for (let index = 0; index < 40; index += 1) {
    bars15m.push(bar(start15 + index * FIFTEEN_MINUTES, FIFTEEN_MINUTES,
      previous, 100.4, 99.6, 100, 1_000_000));
    previous = 100;
  }
  const custom15 = [
    [100, 105, 99.8, 104, 2_000_000, 0.62],
    [104, 111, 103.5, 110, 2_200_000, 0.64],
    [110, 114, 107, 108, 2_500_000, 0.48],
    [108, 109, 102, 107, 3_000_000, 0.58],
    [107, 108.2, 106.4, 108, 1_500_000, 0.60],
    [108, 109, 107.5, 108.7, 1_400_000, 0.58],
    [108.7, 109.4, 108.2, 109, 1_300_000, 0.57],
  ];
  custom15.forEach((values, offset) => bars15m.push(bar(
    start15 + (40 + offset) * FIFTEEN_MINUTES,
    FIFTEEN_MINUTES,
    ...values,
  )));

  const bars5m = [];
  const start5 = NOW - 50 * FIVE_MINUTES;
  const closes = [
    ...Array(30).fill(100),
    101, 102, 104, 106, 108, 110, 112, 108,
    105, 106, 107, 107.4, 107.7, 107.9, 108.1, 108.3, 108.5, 108.7, 108.8, 109,
  ];
  closes.forEach((close, index) => {
    const open = index ? closes[index - 1] : close;
    const pivot = index === 38;
    const confirming = index >= 39;
    bars5m.push(bar(
      start5 + index * FIVE_MINUTES,
      FIVE_MINUTES,
      pivot ? 108 : open,
      pivot ? 109 : Math.max(open, close) + 0.25,
      pivot ? 102 : Math.min(open, close) - 0.2,
      close,
      pivot ? 3_000_000 : confirming ? 1_500_000 : 1_000_000,
      pivot || confirming ? 0.60 : 0.5,
    ));
  });
  return { bars15m, bars5m };
}

function shortFixture() {
  const bars15m = [];
  const start15 = NOW - 47 * FIFTEEN_MINUTES;
  for (let index = 0; index < 40; index += 1) {
    bars15m.push(bar(start15 + index * FIFTEEN_MINUTES, FIFTEEN_MINUTES,
      100, 100.4, 99.6, 100, 1_000_000));
  }
  const custom15 = [
    [100, 100.2, 95, 96, 2_000_000, 0.38],
    [96, 96.5, 89, 90, 2_200_000, 0.36],
    [90, 93, 86, 92, 2_500_000, 0.52],
    [92, 98, 91, 93, 3_000_000, 0.42],
    [93, 93.5, 91.5, 92, 1_500_000, 0.40],
    [92, 92.4, 90.5, 91.3, 1_400_000, 0.41],
    [91.3, 91.6, 90.5, 91, 1_300_000, 0.42],
  ];
  custom15.forEach((values, offset) => bars15m.push(bar(
    start15 + (40 + offset) * FIFTEEN_MINUTES,
    FIFTEEN_MINUTES,
    ...values,
  )));

  const bars5m = [];
  const start5 = NOW - 50 * FIVE_MINUTES;
  const closes = [
    ...Array(30).fill(100),
    99, 98, 96, 94, 92, 90, 88, 92,
    95, 94, 93, 92.7, 92.4, 92.1, 91.9, 91.7, 91.5, 91.3, 91.2, 91,
  ];
  closes.forEach((close, index) => {
    const open = index ? closes[index - 1] : close;
    const pivot = index === 38;
    const confirming = index >= 39;
    bars5m.push(bar(
      start5 + index * FIVE_MINUTES,
      FIVE_MINUTES,
      pivot ? 92 : open,
      pivot ? 98 : Math.max(open, close) + 0.2,
      pivot ? 91 : Math.min(open, close) - 0.25,
      close,
      pivot ? 3_000_000 : confirming ? 1_500_000 : 1_000_000,
      pivot || confirming ? 0.40 : 0.5,
    ));
  });
  return { bars15m, bars5m };
}

const longRows = longFixture();
const longEvents = detectPumpFlushReclaim({
  symbol: 'SKYAIUSDT', klines15m: longRows.bars15m, klines5m: longRows.bars5m, now: NOW,
});
assert.equal(longEvents.length, 1);
const long = longEvents[0];
assert.equal(long.version, PUMP_FLUSH_RECLAIM_VERSION);
assert.equal(long.label, 'PUMP_FLUSH_RECLAIM_15M_LONG_READY');
assert.equal(long.side, 'LONG');
assert.equal(long.observeOnly, true);
assert.equal(long.binanceEligible, false);
assert.ok(long.impulsePct >= 8);
assert.ok(long.retracePct >= 45 && long.retracePct <= 95);
assert.ok(long.confirmationVolumeRatio >= 1.2);
assert.ok(long.distanceFromReclaimPct <= 3.5);
const longPayload = pumpFlushReclaimPayload(long);
assert.equal(longPayload.embeds[0].color, 0x10b981);
assert.match(longPayload.embeds[0].description, /OBSERVE ONLY/);
assert.match(longPayload.embeds[0].fields.find((field) => field.name.includes('KHUNG GIỜ'))?.value ?? '', /Bơm:.*Xả\/giảm/s);
assert.ok(long.impulseExtremeOpenAt < long.impulseEndAt);
assert.ok(long.impulseEndAt < long.reversalEndAt);

const shortRows = shortFixture();
const shortEvents = detectPumpFlushReclaim({
  symbol: 'INVERSEUSDT', klines15m: shortRows.bars15m, klines5m: shortRows.bars5m, now: NOW,
});
assert.equal(shortEvents.length, 1);
const short = shortEvents[0];
assert.equal(short.label, 'DUMP_SQUEEZE_REJECT_15M_SHORT_READY');
assert.equal(short.side, 'SHORT');
const shortPayload = pumpFlushReclaimPayload(short);
assert.equal(shortPayload.embeds[0].color, 0xef4444);
assert.match(shortPayload.embeds[0].fields.find((field) => field.name.includes('KHUNG GIỜ'))?.value ?? '', /Sập:.*Bật hồi/s);

const forming = structuredClone(longRows);
forming.bars5m.push(bar(NOW, FIVE_MINUTES, 109, 120, 108, 119, 10_000_000, 0.9));
assert.equal(detectPumpFlushReclaim({
  symbol: 'SKYAIUSDT', klines15m: forming.bars15m, klines5m: forming.bars5m, now: NOW,
})[0].signalPrice, long.signalPrice, 'forming 5m candle is ignored');

const stale = detectPumpFlushReclaim({
  symbol: 'SKYAIUSDT', klines15m: longRows.bars15m, klines5m: longRows.bars5m,
  now: NOW + 11 * 60_000,
});
assert.deepEqual(stale, [], 'stale confirmation is fail-closed');

const shallowPullback = structuredClone(longRows);
Object.assign(shallowPullback.bars15m[43], {
  open: 108, high: 109, low: 107.05, close: 107.45,
});
Object.assign(shallowPullback.bars15m[44], {
  open: 107.45, high: 108.2, low: 107.1, close: 108,
});
Object.assign(shallowPullback.bars15m[45], {
  open: 108, high: 109, low: 107.5, close: 108.7,
});
Object.assign(shallowPullback.bars15m[46], {
  open: 108.7, high: 109.4, low: 108.2, close: 109,
});
assert.deepEqual(detectPumpFlushReclaim({
  symbol: 'BRLIKEUSDT', klines15m: shallowPullback.bars15m,
  klines5m: shallowPullback.bars5m, now: NOW,
}), [], 'about 50% pullback is not deep flush');

const alreadyDoubled = structuredClone(longRows);
for (let index = 0; index < 20; index += 1) {
  Object.assign(alreadyDoubled.bars15m[index], {
    open: 50, high: 50.4, low: 49.6, close: 50,
  });
}
assert.deepEqual(detectPumpFlushReclaim({
  symbol: 'DOUBLEDUSDT', klines15m: alreadyDoubled.bars15m,
  klines5m: alreadyDoubled.bars5m, now: NOW,
}), [], 'late pump already over 60% above context low is blocked');

const recoveredNearTop = structuredClone(longRows);
const lateCloses = [111.5, 111.7, 111.9, 112];
lateCloses.forEach((close, offset) => {
  const index = recoveredNearTop.bars5m.length - lateCloses.length + offset;
  const row = recoveredNearTop.bars5m[index];
  row.open = offset ? lateCloses[offset - 1] : row.open;
  row.close = close;
  row.high = Math.max(row.open, row.close) + 0.2;
  row.low = Math.min(row.open, row.close) - 0.2;
});
assert.deepEqual(detectPumpFlushReclaim({
  symbol: 'NEARTOPUSDT', klines15m: recoveredNearTop.bars15m,
  klines5m: recoveredNearTop.bars5m, now: NOW,
}), [], 'reclaim already within 2% of pump high is blocked');

const weakAbsorption = structuredClone(longRows);
Object.assign(weakAbsorption.bars15m[43], {
  open: 108, high: 109, low: 102, close: 103.4,
});
assert.deepEqual(detectPumpFlushReclaim({
  symbol: 'WEAKCLOSEUSDT', klines15m: weakAbsorption.bars15m,
  klines5m: weakAbsorption.bars5m, now: NOW,
}), [], 'weak reversal close cannot pass on wick alone');

const directory = await mkdtemp(join(tmpdir(), 'pump-flush-reclaim-'));
try {
  let calls = 0;
  const notifier = new PumpFlushReclaimDiscordNotifier({
    stateFile: join(directory, 'state.json'),
    webhookUrl: () => 'https://discord.com/api/webhooks/123456789/token_ABC-123',
    now: () => NOW,
    fetchImpl: async () => {
      calls += 1;
      return { ok: true, status: 204 };
    },
  });
  assert.equal((await notifier.notify(long)).sent, 1);
  assert.equal((await notifier.notify(long)).reason, 'deduped');
  assert.equal((await notifier.notify(short)).sent, 1, 'opposite label has independent dedupe');
  assert.equal(calls, 2);

  const cache = {
    getIfCached(symbol, interval) {
      if (symbol !== 'SKYAIUSDT') return null;
      return interval === '15m' ? longRows.bars15m : longRows.bars5m;
    },
  };
  const delivered = [];
  const result = await scanPumpFlushReclaim(['SKYAIUSDT', 'EMPTYUSDT'], cache,
    async (event) => {
      delivered.push(event);
      return { sent: 1 };
    }, {
      now: NOW,
      signalPrices: new Map([['SKYAIUSDT', 109.1]]),
    });
  assert.equal(result.processed, 1);
  assert.equal(result.detected, 1);
  assert.equal(result.sent, 1);
  assert.equal(delivered[0].signalPrice, 109.1);
  assert.equal(delivered[0].signalPriceSource, 'BINANCE_MARKET_SNAPSHOT');
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log('Pump/flush/reclaim PASS: bidirectional deep-base gates, shallow/extended/near-top/weak-close rejection, closed candles, stale guard, Discord dedupe and scan.');
