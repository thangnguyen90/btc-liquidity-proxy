import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  PUMP_BASE_SUPPORT_DISCORD_VERSION,
  PumpBaseSupportDiscordNotifier,
  pumpBaseSupportDiscordPayload,
} from '../src/pumpBaseSupportDiscord.js';
import { PUMP_SUPPORT_VERSION } from '../public/pump-support-model.js';

const dir = await mkdtemp(join(tmpdir(), 'pump-support-discord-'));
const webhook = () => 'https://discord.com/api/webhooks/123/token';
let now = Date.UTC(2026, 8, 27, 12, 0, 0);
const support = confirmedAt => ({
  version: PUMP_SUPPORT_VERSION,
  status: 'WAIT_LIVE',
  type: 'FOOT',
  watchOnly: true,
  binanceEligible: false,
  confirmedAt,
  bounceAt: confirmedAt - 300000,
  expiresAt: confirmedAt + 900000,
  entry: 100,
  entryLow: 99.8,
  entryHigh: 100.3,
  zoneLow: 99.4,
  zoneHigh: 99.7,
  stop: 99,
  target: 103,
  atr: 1,
  rr: 2.65,
  pullbackVolumeRatio: 0.55,
  confirmationVolumeRatio: 1.4,
});
const snapshot = confirmedAt => ({
  interval: '15m',
  generatedAt: now - 100,
  records: [{
    id: `ABCUSDT:15m:${confirmedAt - 100000}`,
    symbol: 'ABCUSDT',
    interval: '15m',
    pumpAt: confirmedAt - 900000,
    retestAt: confirmedAt - 300000,
    support: support(confirmedAt),
  }],
});
const quote = price => () => ({ markPrice: price, eventAt: now - 10 });

try {
  const historicalCalls = [];
  const historical = new PumpBaseSupportDiscordNotifier({
    stateFile: join(dir, 'historical.json'), webhookUrl: webhook, now: () => now,
    fetchImpl: async (...args) => { historicalCalls.push(args); return { ok: true, status: 204 }; },
  });
  now += 1000;
  await historical.process({ snapshots: [snapshot(historical.startedAt - 1)], getQuote: quote(100) });
  assert.equal(historicalCalls.length, 0, 'must not replay pre-start confirmations');
  assert.equal(historical.snapshot().counts.SENT ?? 0, 0);

  const calls = [];
  const stateFile = join(dir, 'delivery.json');
  const notifier = new PumpBaseSupportDiscordNotifier({
    stateFile, webhookUrl: webhook, baseUrl: () => 'https://liquidity.example.test', now: () => now,
    fetchImpl: async (url, options) => {
      calls.push({ url, body: JSON.parse(options.body) });
      return { ok: true, status: 204 };
    },
  });
  now += 1000;
  const confirmedAt = notifier.startedAt + 500;
  const first = await notifier.process({ snapshots: [snapshot(confirmedAt)], getQuote: quote(100) });
  assert.equal(first.sent, 1);
  assert.equal(calls.length, 1);
  assert.match(calls[0].body.embeds[0].title, /HỖ TRỢ LONG ĐÃ PASS · ABCUSDT · 15m/);
  assert.match(calls[0].body.embeds[0].description, /không tự đặt Binance/i);
  assert.equal(calls[0].body.allowed_mentions.parse.length, 0);
  assert.match(calls[0].body.embeds[0].fields.at(-1).value, /liquidity\.example\.test\/pump-base-recovery/);
  assert.equal(notifier.candidateSymbols([snapshot(confirmedAt)]).join(','), 'ABCUSDT');
  const second = await notifier.process({ snapshots: [snapshot(confirmedAt)], getQuote: quote(100) });
  assert.equal(second.sent, 0);
  assert.equal(calls.length, 1, 'same setup must be delivered only once');

  const restarted = new PumpBaseSupportDiscordNotifier({
    stateFile, webhookUrl: webhook, now: () => now + 1000,
    fetchImpl: async () => { throw new Error('must not resend after restart'); },
  });
  await restarted.process({ snapshots: [snapshot(confirmedAt)], getQuote: quote(100) });
  assert.equal(restarted.snapshot().counts.SENT, 1);

  const invalidFile = join(dir, 'invalidated.json');
  const invalidated = new PumpBaseSupportDiscordNotifier({
    stateFile: invalidFile, webhookUrl: webhook, now: () => now,
    fetchImpl: async () => { throw new Error('invalidated support must not send'); },
  });
  now += 1000;
  const invalidConfirmedAt = invalidated.startedAt + 500;
  await invalidated.process({ snapshots: [snapshot(invalidConfirmedAt)], getQuote: quote(100.6) });
  invalidated.onMark({ symbol: 'ABCUSDT', markPrice: 98.9, eventTime: now });
  await invalidated.process({ snapshots: [snapshot(invalidConfirmedAt)], getQuote: quote(100) });
  assert.equal(invalidated.snapshot().counts.INVALIDATED, 1, 'intrabar MARK break must remain latched');

  const interruptedFile = join(dir, 'interrupted.json');
  await writeFile(interruptedFile, JSON.stringify({
    version: PUMP_BASE_SUPPORT_DISCORD_VERSION,
    retryAfter: 0,
    records: [{
      id: 'ABCUSDT:15m:1', symbol: 'ABCUSDT', interval: '15m', status: 'SENDING', reason: 'POSTING',
      snapshotAt: now, support: support(now - 1000),
    }],
  }));
  const interrupted = new PumpBaseSupportDiscordNotifier({
    stateFile: interruptedFile, webhookUrl: webhook, now: () => now,
    fetchImpl: async () => { throw new Error('uncertain POST must not be duplicated'); },
  });
  await interrupted.process({ snapshots: [], getQuote: quote(100) });
  assert.equal(interrupted.snapshot().counts.DELIVERY_UNKNOWN, 1);
  const stored = JSON.parse(await readFile(interruptedFile, 'utf8'));
  assert.equal(stored.records[0].reason, 'INTERRUPTED_SEND');

  const payload = pumpBaseSupportDiscordPayload({
    symbol: 'ABCUSDT', interval: '15m', support: support(now - 1000),
    livePrice: 100, liveAt: now, liveEvaluation: { rr: 2, distancePct: 0.3 },
  });
  assert.equal(payload.embeds[0].footer.text.includes('OBSERVE ONLY'), true);
  console.log('Pump-base support Discord: baseline, fresh MARK pass, one-shot delivery, restart dedupe and invalidation passed');
} finally {
  await rm(dir, { recursive: true, force: true });
}
