import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  COIN_LEVEL_OBSERVE_WATCH_DISCORD_VERSION,
  CoinLevelObserveWatchDiscordNotifier,
  coinLevelObserveWatchDiscordPayload,
} from '../src/coinLevelObserveWatchDiscord.js';

const longWatch = {
  symbol: 'PRESSUSDT', side: 'LONG', watchOnly: true, binanceEligible: false,
  reason: 'PRE_BREAKOUT_5M_BUY_PRESSURE', observedAt: 1_500,
  priceAtWatch: 1.01, breakoutLevel: 1.015, breakoutGapPct: 0.5,
  ema13: 1.005, ema25: 1, volumeRatio: 1.8, takerBuyPct: 58,
  rangeAtr: 1.1, ema13DistanceAtr: 0.4, trendScore: 10,
  entryZone: { low: 1.015, high: 1.0165225 }, invalidationPrice: 0.995,
  entryCondition: 'Chờ nến 5m đóng vượt mốc rồi retest giữ vùng; không mua đuổi cây bơm.',
};
const shortWatch = {
  symbol: 'PUMPUSDT', side: 'SHORT', watchOnly: true, binanceEligible: false,
  reason: 'EARLY_SHORT_SCORE_POST_PUMP_FADE', setupMode: 'POST_PUMP_FADE', observedAt: 1_600,
  priceAtWatch: 1.08, peakPrice: 1.1, pumpPct: 10, pullbackPct: 1.82,
  ema13: 1.085, ema25: 1.09, volumeRatio: 2.1, takerSellPct: 57, trendScore: 18,
  earlyScore: 82, rangeAtr: 1.2,
  entryZone: { low: 1.0833725, high: 1.0866275 }, invalidationPrice: 1.10275,
  entryCondition: 'Chỉ xem xét SHORT nếu giá hồi về EMA13 rồi nến 5m đóng reject; không đuổi ở giá đang rơi.',
};

const longPayload = coinLevelObserveWatchDiscordPayload(longWatch);
assert.equal(longPayload.embeds[0].color, 0x20e6a8);
assert.match(longPayload.embeds[0].title, /LONG SỚM.*PRESSUSDT/);
assert.match(longPayload.embeds[0].description, /OBSERVE ONLY/);
assert.match(longPayload.embeds[0].description, /Không đặt lệnh Binance/);
assert.match(longPayload.embeds[0].fields[0].value, /mốc cần phá/);
assert.match(longPayload.embeds[0].fields[1].value, /taker mua/);
assert.match(longPayload.embeds[0].footer.text, new RegExp(COIN_LEVEL_OBSERVE_WATCH_DISCORD_VERSION));

const shortPayload = coinLevelObserveWatchDiscordPayload(shortWatch);
assert.equal(shortPayload.embeds[0].color, 0xff5f7f);
assert.match(shortPayload.embeds[0].title, /SHORT SỚM.*PUMPUSDT/);
assert.match(shortPayload.embeds[0].fields[0].value, /Nhịp tăng trước/);
assert.match(shortPayload.embeds[0].fields[1].value, /taker bán/);
assert.match(shortPayload.embeds[0].fields[2].name, /VÙNG HỒI CHỜ REJECT/);
assert.match(shortPayload.embeds[0].fields[4].value, /82\/100/);
const breakdownPayload = coinLevelObserveWatchDiscordPayload({
  ...shortWatch, symbol: 'BREAKUSDT', setupMode: 'BREAKDOWN_PRESSURE',
  reason: 'EARLY_SHORT_SCORE_BREAKDOWN_PRESSURE', breakdownLevel: 1.075, breakdownGapPct: -0.2,
});
assert.match(breakdownPayload.embeds[0].fields[0].value, /BREAKDOWN PRESSURE/);
assert.match(breakdownPayload.embeds[0].fields[0].value, /Đáy 15m cần phá/);

const directory = await mkdtemp(join(tmpdir(), 'coin-level-observe-watch-'));
try {
  let now = 1_000;
  const calls = [];
  const notifier = new CoinLevelObserveWatchDiscordNotifier({
    stateFile: join(directory, 'state.json'),
    webhookUrl: () => 'https://discord.invalid/webhook',
    now: () => now,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 204 };
    },
  });
  now = 2_000;
  assert.equal(await notifier.deliverWatches([longWatch, shortWatch]), 2);
  assert.equal(calls.length, 2);
  assert.equal(JSON.parse(calls[0].options.body).allowed_mentions.parse.length, 0);
  assert.equal(await notifier.deliverWatches([longWatch, shortWatch]), 0, 'same closed candle must be deduped');
  assert.equal(calls.length, 2);
  const state = JSON.parse(await readFile(join(directory, 'state.json'), 'utf8'));
  assert.equal(state.version, COIN_LEVEL_OBSERVE_WATCH_DISCORD_VERSION);
  assert.equal(state.events.length, 2);
  assert.ok(state.events.every((event) => event.delivery === 'sent'));

  assert.equal(await notifier.deliver({ ...longWatch, observedAt: 1_700, binanceEligible: true }), false,
    'execution-eligible records must never use the observe-only notifier');
  assert.equal(await notifier.deliver({ ...longWatch, observedAt: 1_800, watchOnly: false }), false,
    'non-watch records must never use the observe-only notifier');

  let oldNow = 100_000;
  const oldCalls = [];
  const old = new CoinLevelObserveWatchDiscordNotifier({
    stateFile: join(directory, 'old.json'), webhookUrl: () => 'configured',
    now: () => oldNow,
    fetchImpl: async (...args) => { oldCalls.push(args); return { ok: true }; },
  });
  oldNow += 1_000;
  assert.equal(await old.deliver({ ...longWatch, observedAt: 99_000 }), false,
    'pre-start watch must not replay after restart');
  assert.equal(oldCalls.length, 0);
} finally {
  await rm(directory, { recursive: true, force: true });
}

const [server, envExample] = await Promise.all([
  readFile(new URL('../src/server.js', import.meta.url), 'utf8'),
  readFile(new URL('../.env.example', import.meta.url), 'utf8'),
]);
assert.match(server, /coinLevelObserveWatchDiscord\.deliverWatches/);
assert.match(server, /\.\.\.snapshot\.earlyLongWatches/);
assert.match(server, /\.\.\.snapshot\.earlyShortWatches/);
assert.match(server, /COIN_LEVEL_OBSERVE_WATCH_DISCORD_WEBHOOK_URL/);
assert.match(server, /for \(const candidate of snapshot\.candidates\)/,
  'Binance executor must remain limited to confirmed candidates');
assert.match(envExample, /COIN_LEVEL_OBSERVE_WATCH_DISCORD_WEBHOOK_URL=/);
console.log('Coin Level observe-watch Discord: LONG/SHORT payload, closed-candle dedupe, no Binance route: OK');
