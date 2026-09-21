import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { CoinHorizonDiscordNotifier } from '../src/coinHorizonDiscord.js';
import {
  HTF_DEEP_DUMP_BASE_15M_DISCORD_VERSION,
  buildHtfDeepDumpBase15mDiscordPayload,
  collectHtfDeepDumpBase15mDiscordEvent,
  normalizeHtfDeepDumpDiscordWebhookUrl,
} from '../src/htfDeepDumpBaseReclaimDiscord.js';
import {
  HTF_DEEP_DUMP_BASE_RECLAIM_VERSION,
  HTF_DEEP_DUMP_EARLY_WATCH,
  HTF_DEEP_DUMP_RETEST_LONG_READY,
  HTF_DEEP_PUMP_EARLY_SHORT_WATCH,
  HTF_DEEP_PUMP_RETEST_SHORT_READY,
} from '../src/htfDeepDumpBaseReclaim.js';

const now = Date.UTC(2026, 8, 12, 8, 0, 0);

function signal(stage = HTF_DEEP_DUMP_EARLY_WATCH, side = 'LONG', patch = {}) {
  const ready = [HTF_DEEP_DUMP_RETEST_LONG_READY, HTF_DEEP_PUMP_RETEST_SHORT_READY]
    .includes(stage);
  const long = side === 'LONG';
  return {
    version: HTF_DEEP_DUMP_BASE_RECLAIM_VERSION,
    symbol: 'ALLOUSDT',
    side,
    stage,
    tier: stage,
    action: ready ? side : 'WATCH',
    interval: '15m',
    htfInterval: '4h',
    shockTier: 'EXTREME',
    observeOnly: !ready,
    executionEligible: ready,
    binanceEligible: ready,
    executionEnabled: false,
    closed: true,
    candleCloseAt: now - 20_000,
    price: 0.22835,
    ema13: 0.2269,
    breakoutQuoteVolumeRatio: 8.2,
    shockPct: 18.4,
    pumpPct: 18.4,
    breakPriorLowPct: 11.2,
    breakPriorHighPct: 11.2,
    trueRangeRatio: 8.5,
    quoteVolumeRatio: 12.3,
    lowerWickShare: 0.54,
    upperWickShare: 0.54,
    baseBars: 7,
    baseStructure: 'SIDEWAYS_HIGHER_LOW',
    baseLow: 0.21035,
    baseHigh: 0.245,
    baseNeckline: 0.22628,
    baseRangeShockFraction: 0.42,
    baseMedianVolumeRatio: 0.31,
    eventLow: 0.205,
    eventHigh: 0.26,
    retestBarsAfterEarly: ready ? 2 : null,
    retestSupportLow: 0.2259,
    retestSupportHigh: 0.2271,
    dedupeKey: `${long ? 'HTF_DEEP_DUMP_BASE_RECLAIM' : 'HTF_DEEP_PUMP_BASE_REJECT'}|ALLOUSDT|1789142400000|${stage}`,
    ...patch,
  };
}

function row(event = signal()) {
  return {
    symbol: 'ALLOUSDT',
    dataFreshness: { fresh: true, stale: false },
    features: {
      htfDeepDumpBaseReclaim: {
        version: HTF_DEEP_DUMP_BASE_RECLAIM_VERSION,
        observeOnly: true,
        executionEnabled: false,
        events: [event],
        primary: event,
      },
    },
  };
}

assert.equal(
  HTF_DEEP_DUMP_BASE_15M_DISCORD_VERSION,
  'HTF_DEEP_DUMP_BASE_15M_LONG_SHORT_BINANCE_V4_SHORT_LARGE_REBOUND_20260914',
);

const validUrl = 'https://discord.com/api/webhooks/123456789/token_ABC-123';
assert.ok(normalizeHtfDeepDumpDiscordWebhookUrl(validUrl));
assert.ok(normalizeHtfDeepDumpDiscordWebhookUrl(validUrl.replace('discord.com', 'discordapp.com')));
for (const invalid of [
  'http://discord.com/api/webhooks/123/token',
  'https://discord.com.evil.example/api/webhooks/123/token',
  'https://discord.com/channels/123/token',
  'https://user:pass@discord.com/api/webhooks/123/token',
]) assert.equal(normalizeHtfDeepDumpDiscordWebhookUrl(invalid), '');

const watch = collectHtfDeepDumpBase15mDiscordEvent(row(), now);
assert.equal(watch.stage, HTF_DEEP_DUMP_EARLY_WATCH);
assert.equal(watch.side, 'LONG');
assert.equal(watch.version, HTF_DEEP_DUMP_BASE_15M_DISCORD_VERSION);
assert.equal(watch.detectorVersion, HTF_DEEP_DUMP_BASE_RECLAIM_VERSION);

const watchPayload = buildHtfDeepDumpBase15mDiscordPayload(watch);
assert.deepEqual(watchPayload.allowed_mentions, { parse: [] });
assert.equal(watchPayload.embeds[0].color, 0xf59e0b);
assert.match(watchPayload.embeds[0].description, /OBSERVE ONLY/);
assert.match(JSON.stringify(watchPayload), /EARLY_WATCH/);
assert.ok(watchPayload.embeds[0].fields.every((field) => field.value.length <= 1024));

const ready = collectHtfDeepDumpBase15mDiscordEvent(row(signal(HTF_DEEP_DUMP_RETEST_LONG_READY)), now);
const readyPayload = buildHtfDeepDumpBase15mDiscordPayload(ready);
assert.equal(readyPayload.embeds[0].color, 0x10b981);
assert.match(JSON.stringify(readyPayload), /RETEST_LONG_READY/);
assert.doesNotMatch(readyPayload.embeds[0].description, /OBSERVE ONLY/);
assert.match(readyPayload.embeds[0].description, /margin 5 USDT ×5/);

const fastReady = collectHtfDeepDumpBase15mDiscordEvent(row(signal(
  HTF_DEEP_DUMP_RETEST_LONG_READY,
  'LONG',
  {
    htfInterval: '1h',
    confirmationInterval: '5m',
    fastConfirmation: true,
    retestBarsAfterEarly: null,
    retestBars5mAfterEarly: 2,
  },
)), now);
const fastPayload = buildHtfDeepDumpBase15mDiscordPayload(fastReady);
assert.match(fastPayload.embeds[0].title, /1h DEEP DUMP BASE · 5M FAST RETEST LONG READY/);
assert.match(JSON.stringify(fastPayload), /Xác nhận 5m sớm/);
assert.match(JSON.stringify(fastPayload), /2 nến 5m/);

const shortReady = collectHtfDeepDumpBase15mDiscordEvent(row(
  signal(HTF_DEEP_PUMP_RETEST_SHORT_READY, 'SHORT', {
    shortReboundLow: 0.22,
    shortReboundHigh: 0.228,
    shortReboundPct: 3.64,
    shortReboundAtrMultiple: 1.8,
    shortFadePct: 2.1,
    shortFadeAtrMultiple: 1.1,
  }),
), now);
const shortPayload = buildHtfDeepDumpBase15mDiscordPayload(shortReady);
assert.equal(shortReady.side, 'SHORT');
assert.equal(shortPayload.embeds[0].color, 0xef4444);
assert.match(JSON.stringify(shortPayload), /RETEST_SHORT_READY/);
assert.match(JSON.stringify(shortPayload), /DEEP PUMP TOP/);
assert.match(JSON.stringify(shortPayload), /Nhịp hồi lớn/);
assert.match(JSON.stringify(shortPayload), /3.64%/);
assert.equal(collectHtfDeepDumpBase15mDiscordEvent(row(
  signal(HTF_DEEP_PUMP_RETEST_SHORT_READY, 'SHORT'),
), now), null, 'SHORT READY without measured rebound/fade must fail closed');

const shortWatch = collectHtfDeepDumpBase15mDiscordEvent(row(
  signal(HTF_DEEP_PUMP_EARLY_SHORT_WATCH, 'SHORT'),
), now);
assert.equal(shortWatch.observeOnly, true);
assert.match(buildHtfDeepDumpBase15mDiscordPayload(shortWatch).embeds[0].description, /OBSERVE ONLY/);

for (const patch of [
  { dataFreshness: { fresh: false, stale: true } },
  { features: { htfDeepDumpBaseReclaim: { events: [{ ...signal(), candleCloseAt: now - 17 * 60_000 }] } } },
  { features: { htfDeepDumpBaseReclaim: { events: [{ ...signal(), candleCloseAt: now + 1 }] } } },
  { features: { htfDeepDumpBaseReclaim: { events: [{ ...signal(), closed: false }] } } },
  { features: { htfDeepDumpBaseReclaim: { events: [{ ...signal(), executionEnabled: true }] } } },
]) assert.equal(collectHtfDeepDumpBase15mDiscordEvent({ ...row(), ...patch }, now), null);

const tempDir = await mkdtemp(join(tmpdir(), 'htf-deep-dump-discord-'));
const stateFile = join(tempDir, 'state.json');
const posts = [];
const notifierOptions = {
  stateFile,
  webhookUrl: () => validUrl,
  now: () => now,
  fetchImpl: async (url, options) => {
    posts.push({ url, payload: JSON.parse(options.body) });
    return { ok: true, status: 204 };
  },
  eventBuilder: collectHtfDeepDumpBase15mDiscordEvent,
  payloadBuilder: buildHtfDeepDumpBase15mDiscordPayload,
};

const notifier = new CoinHorizonDiscordNotifier(notifierOptions);
const duplicateResults = await Promise.all([notifier.notify(row()), notifier.notify(row())]);
assert.deepEqual(duplicateResults.map((result) => result.sent), [1, 0]);
assert.equal(posts.length, 1, 'concurrent duplicate emits exactly once');

const restarted = new CoinHorizonDiscordNotifier(notifierOptions);
assert.equal((await restarted.notify(row())).reason, 'deduped');
assert.equal(posts.length, 1, 'durable state dedupes after process restart');

const readyNotifier = new CoinHorizonDiscordNotifier(notifierOptions);
assert.equal((await readyNotifier.notify(row(signal(HTF_DEEP_DUMP_RETEST_LONG_READY)))).sent, 1);
assert.equal(posts.length, 2, 'READY is independent from WATCH for the same shock episode');

const state = JSON.parse(await readFile(stateFile, 'utf8'));
assert.equal(Object.keys(state.symbols).length, 2);
assert.equal(state.version, HTF_DEEP_DUMP_BASE_15M_DISCORD_VERSION);

console.log('HTF deep-dump Discord: freshness, webhook validation, payload, durable dedupe and WATCH->READY passed.');
