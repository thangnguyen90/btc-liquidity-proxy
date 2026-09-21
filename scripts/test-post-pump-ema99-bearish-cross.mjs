import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  POST_DUMP_EMA99_BULLISH_CROSS_LABEL,
  POST_PUMP_EMA99_BEARISH_CROSS_LABEL,
  POST_PUMP_EMA99_BEARISH_CROSS_VERSION,
  PostPumpEma99BearishCrossDiscordNotifier,
  detectPostDumpEma99BullishCross,
  detectPostDumpEma99BullishCross5m,
  detectPostPumpEma99BearishCross,
  detectPostPumpEma99BearishCross5m,
  postPumpEma99BearishCrossPayload,
  scanPostPumpEma99BearishCross,
} from '../src/postPumpEma99BearishCross.js';

const M5 = 5 * 60_000;
const M15 = 15 * 60_000;
const H1 = 60 * 60_000;

function barsFromCloses(closes, intervalMs, lastCloseTime) {
  const firstOpenTime = lastCloseTime - closes.length * intervalMs + 1;
  return closes.map((close, index) => {
    const open = index ? closes[index - 1] : close;
    const openTime = firstOpenTime + index * intervalMs;
    const wick = Math.max(open, close) * 0.006;
    return {
      openTime,
      open,
      high: Math.max(open, close) + wick,
      low: Math.min(open, close) - wick,
      close,
      volume: 1_000 + index,
      quoteVolume: (1_000 + index) * close,
      closeTime: openTime + intervalMs - 1,
    };
  });
}

function linear(count, from, to) {
  return Array.from({ length: count }, (_, index) => (
    from + (to - from) * (index / Math.max(1, count - 1))
  ));
}

function findExactFiveMinuteTrigger() {
  const closes = [
    ...Array(105).fill(100),
    ...linear(22, 102, 220),
    ...linear(90, 216, 118),
  ];
  const start = Date.UTC(2026, 8, 10, 0, 0, 0);
  const full = barsFromCloses(closes, M5, start + closes.length * M5 - 1);
  for (let length = 110; length <= full.length; length += 1) {
    const rows = full.slice(0, length);
    const now = rows.at(-1).closeTime + 1_000;
    const trigger = detectPostPumpEma99BearishCross5m({ klines5m: rows, now });
    if (trigger) return { rows, now, trigger };
  }
  throw new Error('Synthetic 5m EMA99 cross was not detected');
}

function findExactFiveMinuteLongTrigger() {
  const closes = [
    ...Array(105).fill(220),
    ...linear(22, 218, 78),
    ...linear(90, 82, 184),
  ];
  const start = Date.UTC(2026, 8, 10, 0, 0, 0);
  const full = barsFromCloses(closes, M5, start + closes.length * M5 - 1);
  for (let length = 110; length <= full.length; length += 1) {
    const rows = full.slice(0, length);
    const now = rows.at(-1).closeTime + 1_000;
    const trigger = detectPostDumpEma99BullishCross5m({ klines5m: rows, now });
    if (trigger) return { rows, now, trigger };
  }
  throw new Error('Synthetic 5m bullish EMA99 cross was not detected');
}

const fiveMinute = findExactFiveMinuteTrigger();
const signalAt = fiveMinute.trigger.signalAt;
const lastClosed1h = Math.floor((signalAt + 1) / H1) * H1 - 1;
const closes1h = [
  ...linear(55, 100, 105),
  ...linear(15, 108, 230),
  ...linear(50, 222, 132),
];
const klines1h = barsFromCloses(closes1h, H1, lastClosed1h);
const lastClosed15m = Math.floor((signalAt + 1) / M15) * M15 - 1;
const closes15m = linear(220, 224, 126).map((value, index) => (
  value + Math.sin(index / 7) * Math.max(0.15, 2.5 - index / 110)
));
const klines15m = barsFromCloses(closes15m, M15, lastClosed15m);

const event = detectPostPumpEma99BearishCross({
  symbol: 'BRUSDT',
  klines5m: fiveMinute.rows,
  klines15m,
  klines1h,
  now: fiveMinute.now,
});
assert.ok(event, 'multi-timeframe event must pass');
assert.equal(event.version, POST_PUMP_EMA99_BEARISH_CROSS_VERSION);
assert.equal(event.label, POST_PUMP_EMA99_BEARISH_CROSS_LABEL);
assert.equal(event.side, 'SHORT');
assert.equal(event.observeOnly, true);
assert.equal(event.binanceEligible, false);
assert.ok(event.frame1h.pumpPct >= 40);
assert.ok(event.frame15m.lowerHighSteps >= 2);
assert.ok(event.expectedEntry.low > event.confirmationClose);
assert.ok(event.expectedEntry.high >= event.expectedEntry.low);
assert.ok(event.expectedEntry.midpoint >= event.expectedEntry.low);
assert.ok(event.expectedEntry.reboundToLowPct > 0);
assert.equal(detectPostPumpEma99BearishCross({
  symbol: 'BRUSDT',
  klines5m: fiveMinute.rows,
  klines15m: barsFromCloses(linear(220, 110, 180), M15, lastClosed15m),
  klines1h,
  now: fiveMinute.now,
}), null, '15m rising structure must fail closed');
assert.equal(detectPostPumpEma99BearishCross({
  symbol: 'BRUSDT',
  klines5m: fiveMinute.rows,
  klines15m,
  klines1h: barsFromCloses(linear(120, 100, 120), H1, lastClosed1h),
  now: fiveMinute.now,
}), null, '1h without a large prior pump must fail closed');
assert.equal(detectPostPumpEma99BearishCross({
  symbol: 'BRUSDT',
  klines5m: fiveMinute.rows,
  klines15m,
  klines1h,
  now: event.signalAt + 11 * 60_000,
}), null, 'stale 5m transition must fail closed');

const payload = postPumpEma99BearishCrossPayload({ ...event, markPrice: event.signalPrice });
const payloadText = JSON.stringify(payload);
assert.match(payloadText, /VÙNG VÀO SHORT DỰ KIẾN/);
assert.match(payloadText, /OBSERVE ONLY/);
assert.match(payloadText, /5M/);
assert.match(payloadText, /15M/);
assert.match(payloadText, /1H/);

const fiveMinuteLong = findExactFiveMinuteLongTrigger();
const longRowsAtSignal = barsFromCloses(
  fiveMinuteLong.rows.map((bar) => bar.close),
  M5,
  signalAt,
);
const longSignalAt = signalAt;
const longLastClosed1h = Math.floor((longSignalAt + 1) / H1) * H1 - 1;
const longKlines1h = barsFromCloses([
  ...linear(55, 220, 214),
  ...linear(15, 210, 74),
  ...linear(50, 80, 154),
], H1, longLastClosed1h);
const longLastClosed15m = Math.floor((longSignalAt + 1) / M15) * M15 - 1;
const longKlines15m = barsFromCloses(
  linear(220, 76, 160).map((value, index) => (
    value - Math.sin(index / 7) * Math.max(0.15, 2.5 - index / 110)
  )),
  M15,
  longLastClosed15m,
);
const longEvent = detectPostDumpEma99BullishCross({
  symbol: 'DUMPUSDT',
  klines5m: longRowsAtSignal,
  klines15m: longKlines15m,
  klines1h: longKlines1h,
  now: fiveMinute.now,
});
assert.ok(longEvent, 'multi-timeframe LONG event must pass');
assert.equal(longEvent.label, POST_DUMP_EMA99_BULLISH_CROSS_LABEL);
assert.equal(longEvent.side, 'LONG');
assert.equal(longEvent.observeOnly, true);
assert.equal(longEvent.binanceEligible, false);
assert.ok(longEvent.frame1h.dumpPct >= 40);
assert.ok(longEvent.frame15m.higherLowSteps >= 2);
assert.ok(longEvent.expectedEntry.high < longEvent.confirmationClose);
assert.ok(longEvent.expectedEntry.low <= longEvent.expectedEntry.high);
assert.ok(longEvent.expectedEntry.pullbackToHighPct < 0);
const longPayloadText = JSON.stringify(postPumpEma99BearishCrossPayload(longEvent));
assert.match(longPayloadText, /VÙNG VÀO LONG DỰ KIẾN/);
assert.match(longPayloadText, /HẬU SẬP/);
assert.match(longPayloadText, /higher-low/i);
assert.equal(detectPostDumpEma99BullishCross({
  symbol: 'DUMPUSDT',
  klines5m: longRowsAtSignal,
  klines15m: barsFromCloses(linear(220, 180, 100), M15, longLastClosed15m),
  klines1h: longKlines1h,
  now: fiveMinute.now,
}), null, '15m falling structure must reject LONG');

const cacheRows = new Map([
  ['BRUSDT|5m', fiveMinute.rows],
  ['BRUSDT|15m', klines15m],
  ['BRUSDT|1h', klines1h],
  ['DUMPUSDT|5m', longRowsAtSignal],
  ['DUMPUSDT|15m', longKlines15m],
  ['DUMPUSDT|1h', longKlines1h],
]);
const klineCache = {
  getIfCached(symbol, interval, limit) {
    return (cacheRows.get(`${symbol}|${interval}`) ?? []).slice(-limit);
  },
};
const scannerEvents = [];
const scan = await scanPostPumpEma99BearishCross(
  ['BRUSDT', 'DUMPUSDT'],
  klineCache,
  async (row) => {
    scannerEvents.push(row);
    return { sent: 1 };
  },
  {
    now: fiveMinute.now,
    signalPrices: new Map([
      ['BRUSDT', event.signalPrice],
      ['DUMPUSDT', longEvent.signalPrice],
    ]),
  },
);
assert.equal(scan.processed, 2);
assert.equal(scan.shortCandidates, 1);
assert.equal(scan.longCandidates, 1);
assert.equal(scan.detected, 2);
assert.equal(scan.sent, 2);
assert.equal(scannerEvents.length, 2);

const temporary = await mkdtemp(join(tmpdir(), 'post-pump-ema99-test-'));
try {
  let requests = 0;
  const notifier = new PostPumpEma99BearishCrossDiscordNotifier({
    stateFile: join(temporary, 'state.json'),
    webhookUrl: () => 'https://discord.com/api/webhooks/123456789/test_token',
    now: () => event.signalAt + 2_000,
    fetchImpl: async (_url, request) => {
      requests += 1;
      const body = JSON.parse(request.body);
      assert.match(JSON.stringify(body), /VÙNG VÀO (SHORT|LONG) DỰ KIẾN/);
      return { ok: true, status: 204 };
    },
  });
  assert.equal((await notifier.notify(event)).sent, 1);
  assert.equal((await notifier.notify(event)).reason, 'deduped');
  assert.equal((await notifier.notify(longEvent)).sent, 1);
  assert.equal((await notifier.notify(longEvent)).reason, 'deduped');
  assert.equal(requests, 2);
} finally {
  await rm(temporary, { recursive: true, force: true });
}

console.log(JSON.stringify({
  ok: true,
  version: event.version,
  label: event.label,
  score: event.score,
  signalAt: event.signalAt,
  expectedEntry: event.expectedEntry,
  longLabel: longEvent.label,
  longScore: longEvent.score,
  longExpectedEntry: longEvent.expectedEntry,
}));
