import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  CoinLevelEntryWatchDiscordNotifier,
  COIN_LEVEL_ENTRY_WATCH_DISCORD_VERSION,
  coinLevelEntryWatchDiscordPayload,
} from '../src/coinLevelEntryWatchDiscord.js';

const candidate = {
  symbol: 'TESTUSDT', side: 'LONG', score: 16.25,
  referenceLevel: 1.1, signalClose: 1.12, lastClosed5m: 1.115,
  entryPrice: 1.100825, entryZone: { low: 1.1, high: 1.10165 },
  entryBasis: 'RETEST_LEVEL_0_15_PCT',
  entryScore: 78.4, entryTier: 'GOOD', entryTierLabel: 'ĐỦ TỐT',
  entryScoreComponents: { trend: 18, breakout: 16, retest: 24, flow: 10, targetRoom: 10.4 },
  targetPlan: {
    probabilityCalibrated: false,
    targets: [
      { label: 'T1', price: 1.12, movePct: 1.74, grossRoePctAt5x: 8.7, basis: ['15M_SWING'] },
      { label: 'T2', price: 1.1228415, movePct: 2, grossRoePctAt5x: 10, basis: ['TP_10_ROE_5X'] },
      { label: 'T3', price: 1.15, movePct: 4.47, grossRoePctAt5x: 22.4, basis: ['ATR_4H_SCENARIO'] },
    ],
  },
  confirmationAt: 1_500, retestAt: null, observeOnly: true,
};
const payload = coinLevelEntryWatchDiscordPayload(candidate);
assert.equal(payload.embeds.length, 2);
assert.equal(payload.embeds[0].color, 0xffc857);
assert.match(payload.embeds[0].title, /ENTRY DỰ KIẾN.*TESTUSDT.*LONG/);
assert.match(payload.embeds[0].description, /\*\*TRẠNG THÁI NẾN\*\*/);
assert.match(payload.embeds[0].description, /15m đã xác nhận · chưa có retest 5m/);
assert.match(payload.embeds[0].description, /\*\*GIÁ ENTRY DỰ KIẾN: 1\.100825\*\*/);
assert.match(payload.embeds[0].description, /không xác nhận Binance đã đặt hoặc khớp lệnh/);
const primary = payload.embeds[1];
assert.match(primary.title, /TESTUSDT.*ĐẠT BỘ LỌC ĐIỂM VÀO/);
assert.match(primary.description, /LIMIT 3 USDT tại entry dự kiến/);
assert.match(primary.fields[0].value, /16\.25/);
const candleStatusField = primary.fields.find((field) => field.name === 'TRẠNG THÁI NẾN');
assert.match(candleStatusField.value, /15m đã xác nhận · chưa có retest 5m/);
const entryField = primary.fields.find((field) => field.name === '🟨 ENTRY DỰ KIẾN · LIMIT CHỜ GIÁ');
assert.match(entryField.value, /\*\*GIÁ ENTRY DỰ KIẾN: 1\.100825\*\*/);
assert.match(entryField.value, /1\.1 – 1\.10165/);
const scoreField = primary.fields.find((field) => field.name.startsWith('ENTRY SCORE'));
assert.match(scoreField.value, /78\.4 · ĐỦ TỐT/);
assert.match(scoreField.value, /Trend 18\/25/);
const targetsField = primary.fields.find((field) => field.name.startsWith('T1'));
assert.match(targetsField.value, /T1 1\.12/);
assert.match(targetsField.value, /≈\+8\.7% ROE 5x/);
assert.match(targetsField.value, /chưa hiệu chỉnh xác suất/);
assert.match(primary.footer.text, new RegExp(COIN_LEVEL_ENTRY_WATCH_DISCORD_VERSION));

const retestedPayload = coinLevelEntryWatchDiscordPayload({ ...candidate, retestAt: 1_900 });
assert.match(retestedPayload.embeds[0].description, /retest 5m đã đạt/);
assert.match(
  retestedPayload.embeds[1].fields.find((field) => field.name === 'TRẠNG THÁI NẾN').value,
  /đủ trạng thái nến để xét MARKET theo route/,
);

const directory = await mkdtemp(join(tmpdir(), 'coin-level-entry-watch-'));
try {
  let now = 1_000;
  const calls = [];
  const notifier = new CoinLevelEntryWatchDiscordNotifier({
    stateFile: join(directory, 'state.json'),
    webhookUrl: () => 'https://discord.invalid/webhook',
    now: () => now,
    fetchImpl: async (url, options) => { calls.push({ url, options }); return { ok: true, status: 204 }; },
  });
  now = 2_000;
  assert.equal(await notifier.deliver(candidate), true);
  assert.equal(calls.length, 1);
  assert.equal(JSON.parse(calls[0].options.body).allowed_mentions.parse.length, 0);
  assert.equal(await notifier.deliver({ ...candidate, retestAt: 1_900 }), false, 'same 15m confirmation must not resend after retest');
  assert.equal(calls.length, 1);
  const state = JSON.parse(await readFile(join(directory, 'state.json'), 'utf8'));
  assert.equal(state.version, COIN_LEVEL_ENTRY_WATCH_DISCORD_VERSION);
  assert.equal(state.events[0].delivery, 'sent');

  let secondNow = 10_000;
  let rejectedCalls = 0;
  const rejected = new CoinLevelEntryWatchDiscordNotifier({
    stateFile: join(directory, 'rejected.json'),
    webhookUrl: () => 'https://discord.invalid/webhook',
    now: () => secondNow,
    fetchImpl: async () => { rejectedCalls += 1; return { ok: false, status: 429, json: async () => ({ retry_after: 2 }) }; },
  });
  secondNow = 12_000;
  assert.equal(await rejected.deliver({ ...candidate, confirmationAt: 11_000 }), false);
  assert.equal(rejectedCalls, 1);
  assert.equal(await rejected.deliver({ ...candidate, confirmationAt: 11_000 }), false);
  assert.equal(rejectedCalls, 1, '429 retry window must prevent a notification storm');

  let oldNow = 100_000;
  const oldCalls = [];
  const old = new CoinLevelEntryWatchDiscordNotifier({
    stateFile: join(directory, 'old.json'), webhookUrl: () => 'configured',
    now: () => oldNow, fetchImpl: async (...args) => { oldCalls.push(args); return { ok: true }; },
  });
  oldNow += 1_000;
  assert.equal(await old.deliver({ ...candidate, confirmationAt: 99_000 }), false, 'pre-start confirmation must not replay');
  assert.equal(oldCalls.length, 0);
} finally {
  await rm(directory, { recursive: true, force: true });
}

const server = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
assert.match(server, /startCoinLevelEntryWatchScheduler\(\)/);
assert.match(server, /coinLevelEntryWatchBinanceRunner\.handle\(candidate\)/);
assert.match(server, /COIN_LEVEL_ENTRY_WATCH_DISCORD_WEBHOOK_URL/);
console.log('coin-level entry-watch Discord: OK');
