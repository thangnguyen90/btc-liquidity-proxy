import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  MEGA_PUMP_STAIRCASE_VERSION,
  MegaPumpStaircaseDiscordNotifier,
  detectMegaPumpStaircase,
  megaPumpStaircasePayload,
  scanMegaPumpStaircase,
} from '../src/megaPumpStaircase.js';

const HOUR_MS = 60 * 60_000;
const BASE_AT = Date.UTC(2026, 8, 13, 0, 0, 0);

function buildBars(closes, {
  startAt = BASE_AT - closes.length * HOUR_MS,
  baseQuoteVolume = 1_000_000,
  finalQuoteVolume = 3_000_000,
  finalShape = null,
} = {}) {
  return closes.map((close, index) => {
    const previousClose = index ? closes[index - 1] : close;
    const open = finalShape && index === closes.length - 1
      ? (finalShape.open ?? previousClose)
      : previousClose;
    const high = finalShape && index === closes.length - 1
      ? (finalShape.high ?? Math.max(open, close) * 1.01)
      : Math.max(open, close) * 1.01;
    const low = finalShape && index === closes.length - 1
      ? (finalShape.low ?? Math.min(open, close) * 0.99)
      : Math.min(open, close) * 0.99;
    return {
      openTime: startAt + index * HOUR_MS,
      open,
      high,
      low,
      close,
      volume: 10_000,
      closeTime: startAt + (index + 1) * HOUR_MS - 1,
      quoteVolume: index === closes.length - 1 ? finalQuoteVolume : baseQuoteVolume,
    };
  });
}

function evaluate(closes, options = {}) {
  const bars = buildBars(closes, options);
  const now = bars.at(-1).closeTime + 60_000;
  return { bars, now, event: detectMegaPumpStaircase(bars, { symbol: 'TESTUSDT', now }) };
}

{
  const closes = [...Array(26).fill(100), 100, 105, 115, 125];
  const { event } = evaluate(closes);
  assert.equal(event?.stage, 'MEGA_PUMP_EARLY');
  assert.equal(event?.observeOnly, true);
  assert.equal(event?.interval, '1h');
}

{
  const closes = [...Array(26).fill(100), 100, 120, 145, 175];
  const { event } = evaluate(closes);
  assert.equal(event?.stage, 'MEGA_PUMP_ACCELERATING');
}

{
  const closes = [...Array(26).fill(100), 100, 145, 200, 260];
  const { event } = evaluate(closes, { finalQuoteVolume: 4_000_000 });
  assert.equal(event?.stage, 'PARABOLIC_DANGER');
}

let lskEvent;
{
  const closes = [
    ...Array(23).fill(0.2),
    0.23863,
    0.29225,
    0.32583,
    0.39317,
    0.52267,
    0.74288,
    1.16296,
  ];
  const { event } = evaluate(closes, {
    baseQuoteVolume: 60_000_000,
    finalQuoteVolume: 527_000_000,
    finalShape: { open: 0.74335, high: 2.3705, low: 0.7 },
  });
  lskEvent = event;
  assert.equal(event?.stage, 'PARABOLIC_EXHAUSTION');
  assert.ok(event.ret3hPct > 190);
  assert.ok(event.volumeRatio > 8);
  assert.ok(event.upperWickPct > 70);
  assert.ok(event.score >= 80);
  assert.equal(event.signalPrice, event.price);
  assert.equal(event.signalPriceSource, 'CLOSED_1H_FALLBACK');
  const payload = megaPumpStaircasePayload(event);
  assert.equal(payload.embeds[0].color, 0xa855f7);
  assert.match(payload.embeds[0].description, /OBSERVE ONLY/);
  assert.match(payload.embeds[0].fields[0].name, /🟪 GIÁ LÚC PHÁT TÍN HIỆU/);
  assert.match(payload.embeds[0].fields[0].value, /close nến 1h fallback/i);
}

{
  const closes = [...Array(26).fill(100), 100, 120, 145, 175];
  const { bars, now } = evaluate(closes);
  bars.at(-1).open = bars.at(-2).close * 1.2;
  bars.at(-1).low = Math.min(bars.at(-1).low, bars.at(-1).open * 0.99);
  assert.equal(detectMegaPumpStaircase(bars, { symbol: 'GAPUSDT', now }), null);
}

{
  const closes = [...Array(26).fill(100), 100, 120, 145, 175];
  const { bars, now, event } = evaluate(closes);
  const liveOpen = bars.at(-1).close;
  bars.push({
    openTime: bars.at(-1).openTime + HOUR_MS,
    open: liveOpen,
    high: liveOpen * 4,
    low: liveOpen * 0.99,
    close: liveOpen * 3,
    volume: 1_000_000,
    closeTime: bars.at(-1).closeTime + HOUR_MS,
    quoteVolume: 1_000_000_000,
  });
  const closedOnly = detectMegaPumpStaircase(bars, { symbol: 'TESTUSDT', now });
  assert.equal(closedOnly?.stage, event?.stage);
  assert.equal(closedOnly?.price, event?.price);
}

{
  const dir = await mkdtemp(join(tmpdir(), 'mega-pump-staircase-'));
  try {
    let now = lskEvent.observedAt;
    let calls = 0;
    const notifier = new MegaPumpStaircaseDiscordNotifier({
      stateFile: join(dir, 'state.json'),
      webhookUrl: () => 'https://discord.invalid/hook',
      now: () => now,
      fetchImpl: async () => {
        calls += 1;
        return { ok: true, status: 204 };
      },
    });
    const early = {
      ...lskEvent,
      stage: 'MEGA_PUMP_EARLY',
      dedupeKey: `${lskEvent.symbol}|MEGA_PUMP_EARLY`,
      observedAt: now,
    };
    assert.equal((await notifier.notify(early)).sent, 1);
    assert.equal((await notifier.notify(early)).reason, 'deduped');
    const escalated = {
      ...lskEvent,
      stage: 'PARABOLIC_DANGER',
      dedupeKey: `${lskEvent.symbol}|PARABOLIC_DANGER`,
      observedAt: now,
    };
    assert.equal((await notifier.notify(escalated)).sent, 1);
    assert.equal(calls, 2);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

{
  const cache = {
    getIfCached(symbol) {
      return symbol === 'LSKUSDT'
        ? buildBars([
          ...Array(23).fill(0.2), 0.23863, 0.29225, 0.32583, 0.39317, 0.52267, 0.74288, 1.16296,
        ], {
          baseQuoteVolume: 60_000_000,
          finalQuoteVolume: 527_000_000,
          finalShape: { open: 0.74335, high: 2.3705, low: 0.7 },
        })
        : [];
    },
  };
  const rows = cache.getIfCached('LSKUSDT');
  const now = rows.at(-1).closeTime + 60_000;
  const delivered = [];
  const result = await scanMegaPumpStaircase(['LSKUSDT', 'EMPTYUSDT'], cache, async (event) => {
    delivered.push(event);
    return { sent: 1 };
  }, { now, signalPrices: new Map([['LSKUSDT', 1.25]]) });
  assert.equal(result.processed, 1);
  assert.equal(result.detected, 1);
  assert.equal(result.sent, 1);
  assert.equal(delivered[0].version, MEGA_PUMP_STAIRCASE_VERSION);
  assert.equal(delivered[0].signalPrice, 1.25);
  assert.equal(delivered[0].signalPriceSource, 'BINANCE_MARKET_SNAPSHOT');
  assert.ok(Math.abs(delivered[0].signalPriceVsClosePct - (1.25 / delivered[0].price - 1) * 100) < 1e-9);
  const payload = megaPumpStaircasePayload(delivered[0]);
  assert.match(payload.embeds[0].fields[0].value, /`1.25 USDT`/);
  assert.match(payload.embeds[0].fields[0].value, /snapshot Binance lúc phát/i);
}

console.log('mega pump staircase tests passed');
