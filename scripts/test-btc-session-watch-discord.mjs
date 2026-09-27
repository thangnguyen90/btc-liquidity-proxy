import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  BtcSessionWatchDiscordNotifier,
  BTC_SESSION_WATCH_DISCORD_VERSION,
  btcSessionWatchDiscordPayload,
} from '../src/btcSessionWatchDiscord.js';

const WEBHOOK = 'https://discord.com/api/webhooks/123/token';

function row(overrides = {}) {
  return {
    symbol: 'TESTUSDT',
    side: 'LONG',
    window: 'OTHER',
    confirmationAt: 1_780_000_000_000,
    retestAt: 1_780_000_300_000,
    rank: 3,
    status: 'TRONG VÙNG · CÙNG BTC',
    contextClass: 'context-long-ready',
    live: true,
    stale: false,
    broken: false,
    dual: false,
    observeOnly: true,
    executionEligible: false,
    binanceEligible: false,
    price: 1.01,
    low: 1,
    high: 1.02,
    middle: 1.01,
    level: 0.99,
    entryScore: 82.5,
    distance: 0,
    targetPlan: { targets: [{ label: 'T1', price: 1.04 }] },
    ...overrides,
  };
}

const payload = btcSessionWatchDiscordPayload(row(), {
  health: { btcTrendDir: 'UP', btcTrendDir4h: 'UP' },
  marketRegime: { state: 'RISK_ON', reasons: ['breadth tốt'] },
}, 1_780_000_400_000);
assert.equal(payload.embeds[0].color, 0x22c55e);
assert.match(payload.embeds[0].title, /LONG ĐẠT ĐIỂM CHÚ Ý/);
assert.match(payload.embeds[0].description, /OBSERVE ONLY/);
assert.match(payload.embeds[0].description, /không chặn LONG\/Discord/);
assert.doesNotMatch(JSON.stringify(payload), /đặt lệnh Binance[^\s]/i);

const shortPayload = btcSessionWatchDiscordPayload(row({
  symbol: 'SHORTUSDT', side: 'SHORT', contextClass: 'context-short-ready',
}), {}, 1_780_000_400_000);
assert.equal(shortPayload.embeds[0].color, 0xf43f5e);
assert.match(shortPayload.embeds[0].title, /SHORT ĐẠT ĐIỂM CHÚ Ý/);

const dir = await mkdtemp(join(tmpdir(), 'btc-session-discord-'));
const stateFile = join(dir, 'state.json');
let now = 1_780_000_400_000;
const posts = [];
const fetchImpl = async (_url, options) => {
  posts.push(JSON.parse(options.body));
  return { ok: true, status: 204, json: async () => ({}) };
};

try {
  const notifier = new BtcSessionWatchDiscordNotifier({
    stateFile, webhookUrl: () => WEBHOOK, fetchImpl, now: () => now,
  });

  // First startup only records current colored rows; it must not replay old alerts.
  let result = await notifier.process({ rows: [row()] });
  assert.equal(result.baseline, true);
  assert.equal(result.sent, 0);
  assert.equal(posts.length, 0);

  // A later transition out and back into the exact colored state sends once.
  now += 30_000;
  result = await notifier.process({ rows: [row({ rank: 2, status: 'CHỜ GIÁ VỀ VÙNG · KHÔNG ĐUỔI', contextClass: '' })] });
  assert.equal(result.sent, 0);
  now += 30_000;
  result = await notifier.process({ rows: [row()] });
  assert.equal(result.sent, 1);
  assert.equal(posts.length, 1);
  result = await notifier.process({ rows: [row()] });
  assert.equal(result.sent, 0);
  assert.equal(posts.length, 1);

  // A brand-new setup already ready after baseline is a new event and sends.
  now += 30_000;
  result = await notifier.process({ rows: [row(), row({ symbol: 'NEWUSDT', confirmationAt: 1_780_001_000_000, retestAt: 1_780_001_300_000 })] });
  assert.equal(result.sent, 1);
  assert.equal(posts.length, 2);

  // Similar-looking rows do not send unless every fail-closed ready condition matches.
  const rejected = [
    row({ symbol: 'STALEUSDT', stale: true }),
    row({ symbol: 'DUALUSDT', dual: true }),
    row({ symbol: 'WAITUSDT', rank: 2, status: 'CHỜ GIÁ VỀ VÙNG · KHÔNG ĐUỔI', contextClass: '' }),
    row({ symbol: 'RETAINUSDT', retainedOnly: true }),
  ];
  result = await notifier.process({ rows: rejected });
  assert.equal(result.sent, 0);

  // Persisted state prevents a restart from resending the same setup.
  const restarted = new BtcSessionWatchDiscordNotifier({
    stateFile, webhookUrl: WEBHOOK, fetchImpl, now: () => now,
  });
  result = await restarted.process({ rows: [row(), row({ symbol: 'NEWUSDT', confirmationAt: 1_780_001_000_000, retestAt: 1_780_001_300_000 })] });
  assert.equal(result.baseline, false);
  assert.equal(result.sent, 0);
  assert.equal(posts.length, 2);

  const saved = JSON.parse(await readFile(stateFile, 'utf8'));
  assert.equal(saved.version, BTC_SESSION_WATCH_DISCORD_VERSION);
  assert.ok(Object.values(saved.records).some((record) => record.notified === true));
} finally {
  await rm(dir, { recursive: true, force: true });
}

const invalid = new BtcSessionWatchDiscordNotifier({
  stateFile: join(tmpdir(), 'unused-btc-session-state.json'),
  webhookUrl: 'http://discord.com/api/webhooks/123/token',
  fetchImpl: async () => { throw new Error('must not post'); },
});
assert.equal(invalid.configured(), false);
assert.equal((await invalid.process({ rows: [row()] })).configured, false);

console.log('btc session watch Discord tests passed');
