import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { CoinHorizonDiscordNotifier } from '../src/coinHorizonDiscord.js';
import {
  WEEK_LONG_POST_PUMP_EMA99_SLOPE_LABEL,
  WEEK_LONG_POST_PUMP_EMA99_SLOPE_VERSION,
  buildWeekLongPostPumpEma99SlopePayload,
  collectWeekLongPostPumpEma99SlopeEvent,
  detectWeekLongPostPumpEma99SlopeReject,
  scanWeekLongPostPumpEma99Slope,
} from '../src/weekLongPostPumpEma99Slope.js';

const M15 = 15 * 60_000;
const H1 = 60 * 60_000;
const now = Date.UTC(2026, 8, 19, 11, 1, 0);

function linear(count, from, to) {
  return Array.from({ length: count }, (_, index) => (
    from + (to - from) * (index / Math.max(1, count - 1))
  ));
}

function barsFromCloses(closes, intervalMs, lastCloseTime, quoteVolume = 100_000) {
  const firstOpenTime = lastCloseTime - closes.length * intervalMs + 1;
  return closes.map((close, index) => {
    const open = index ? closes[index - 1] : close;
    const openTime = firstOpenTime + index * intervalMs;
    const wick = Math.max(open, close) * 0.002;
    return {
      openTime,
      open,
      high: Math.max(open, close) + wick,
      low: Math.min(open, close) - wick,
      close,
      volume: quoteVolume / close,
      quoteVolume,
      closeTime: openTime + intervalMs - 1,
    };
  });
}

const hourlyCloses = [
  ...linear(40, 0.50, 0.52),
  0.76,
  ...linear(127, 0.75, 0.60),
];
const lastClosed1h = Date.UTC(2026, 8, 19, 9, 59, 59, 999);
const klines1h = barsFromCloses(hourlyCloses, H1, lastClosed1h, 300_000);
klines1h[40] = {
  ...klines1h[40],
  open: 0.52,
  high: 0.80,
  low: 0.515,
  close: 0.76,
  quoteVolume: 8_000_000,
};

const trendCloses = linear(298, 0.76, 0.60);
const lastClosed15m = Date.UTC(2026, 8, 19, 10, 59, 59, 999);
const klines15m = barsFromCloses(
  [...trendCloses, 0.6175, 0.5998],
  M15,
  lastClosed15m,
  100_000,
);
const spikeIndex = klines15m.length - 2;
klines15m[spikeIndex] = {
  ...klines15m[spikeIndex],
  open: 0.60,
  high: 0.642,
  low: 0.5995,
  close: 0.6175,
  quoteVolume: 1_200_000,
};
klines15m[spikeIndex + 1] = {
  ...klines15m[spikeIndex + 1],
  open: 0.6173,
  high: 0.6293,
  low: 0.5989,
  close: 0.5998,
  quoteVolume: 750_000,
};

const event = detectWeekLongPostPumpEma99SlopeReject({
  symbol: 'BTWUSDT', klines15m, klines1h, now,
});
assert.ok(event, 'BTW-like closed 15m rejection must pass');
assert.equal(event.version, WEEK_LONG_POST_PUMP_EMA99_SLOPE_VERSION);
assert.equal(event.label, WEEK_LONG_POST_PUMP_EMA99_SLOPE_LABEL);
assert.equal(event.side, 'SHORT');
assert.equal(event.observeOnly, true);
assert.equal(event.binanceEligible, false);
assert.ok(event.frame1h.peakAgeHours >= 72);
assert.ok(event.frame1h.pumpPct >= 35);
assert.ok(event.frame1h.recentDeclineR2 >= 0.60);
assert.ok(event.frame15m.ema99SlopeR2 >= 0.92);
assert.ok(event.frame15m.ema99DailySlopePct <= -1.5);
assert.ok(event.frame15m.volumeRatio >= 3);
assert.ok(event.frame15m.peakToConfirmDropPct >= 5);
assert.equal(event.invalidationPrice, 0.642);

const payload = buildWeekLongPostPumpEma99SlopePayload(event);
const payloadText = JSON.stringify(payload);
assert.match(payloadText, /OBSERVE ONLY/);
assert.match(payloadText, /EMA99 15M/);
assert.match(payloadText, /KHÔNG TỰ ĐẶT LỆNH BINANCE/);
assert.ok(!/api\/webhooks/i.test(payloadText));
assert.equal(collectWeekLongPostPumpEma99SlopeEvent(event, now), event);
assert.equal(collectWeekLongPostPumpEma99SlopeEvent(event, now + 121 * 60_000), null);

assert.equal(detectWeekLongPostPumpEma99SlopeReject({
  symbol: 'BTWUSDT', klines15m, klines1h, now,
  config: { minPeakAgeHours: 140 },
}), null, 'young-vs-configured peak must fail closed');

const flat15m = barsFromCloses(Array(300).fill(0.60), M15, lastClosed15m, 100_000);
flat15m[flat15m.length - 2] = { ...klines15m[spikeIndex] };
flat15m[flat15m.length - 1] = { ...klines15m[spikeIndex + 1] };
assert.equal(detectWeekLongPostPumpEma99SlopeReject({
  symbol: 'FLATUSDT', klines15m: flat15m, klines1h, now,
}), null, 'flat EMA99 must not be described as a straight downward slope');

const liveConfirmation = klines15m.map((bar) => ({ ...bar }));
liveConfirmation.at(-1).closeTime = now + 10 * 60_000;
assert.equal(detectWeekLongPostPumpEma99SlopeReject({
  symbol: 'LIVEUSDT', klines15m: liveConfirmation, klines1h, now,
}), null, 'live confirmation candle must be ignored');

const cache = new Map([
  ['BTWUSDT|15m', klines15m],
  ['BTWUSDT|1h', klines1h],
]);
const scannerEvents = [];
const scan = await scanWeekLongPostPumpEma99Slope(
  ['BTWUSDT', 'MISSINGUSDT'],
  { getIfCached: (symbol, interval, limit) => cache.get(`${symbol}|${interval}`)?.slice(-limit) },
  async (row) => {
    scannerEvents.push(row);
    return { sent: 1 };
  },
  { now, signalPrices: new Map([['BTWUSDT', 0.598]]) },
);
assert.equal(scan.processed, 1);
assert.equal(scan.detected, 1);
assert.equal(scan.sent, 1);
assert.equal(scannerEvents[0].markPrice, 0.598);

const candidateWarmCache = new Map([['BTWUSDT|15m', klines15m]]);
const candidateWarmScan = await scanWeekLongPostPumpEma99Slope(
  ['BTWUSDT'],
  { getIfCached: (symbol, interval, limit) => candidateWarmCache.get(`${symbol}|${interval}`)?.slice(-limit) },
  async () => ({ sent: 1 }),
  {
    now,
    ensureOneHour: async (symbol) => {
      assert.equal(symbol, 'BTWUSDT');
      candidateWarmCache.set('BTWUSDT|1h', klines1h);
    },
  },
);
assert.equal(candidateWarmScan.candidates, 1);
assert.equal(candidateWarmScan.warmed, 1);
assert.equal(candidateWarmScan.detected, 1);

const temporary = await mkdtemp(join(tmpdir(), 'week-long-ema99-test-'));
try {
  let requests = 0;
  const notifier = new CoinHorizonDiscordNotifier({
    stateFile: join(temporary, 'state.json'),
    webhookUrl: () => 'https://discordapp.com/api/webhooks/123/test',
    now: () => now,
    eventBuilder: collectWeekLongPostPumpEma99SlopeEvent,
    payloadBuilder: buildWeekLongPostPumpEma99SlopePayload,
    fetchImpl: async (_url, request) => {
      requests += 1;
      assert.match(request.body, /SHORT WATCH/);
      return { ok: true, status: 204 };
    },
  });
  assert.equal((await notifier.notify(event)).sent, 1);
  assert.equal((await notifier.notify(event)).reason, 'deduped');
  assert.equal(requests, 1);
} finally {
  await rm(temporary, { recursive: true, force: true });
}

console.log(JSON.stringify({
  ok: true,
  version: event.version,
  label: event.label,
  score: event.score,
  hourly: event.frame1h,
  fifteen: event.frame15m,
}));
