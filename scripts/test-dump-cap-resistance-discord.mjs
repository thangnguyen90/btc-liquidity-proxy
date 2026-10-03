import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  DumpCapResistanceDiscordNotifier,
  dumpCapResistanceDiscordPayload,
} from '../src/dumpCapResistanceDiscord.js';
import { DUMP_RESISTANCE_VERSION } from '../public/dump-resistance-model.js';

const dir = await mkdtemp(join(tmpdir(), 'dump-resistance-discord-'));
let now = Date.UTC(2026, 8, 27, 13, 0, 0);
const webhook = () => 'https://discord.com/api/webhooks/123/token';
const resistance = confirmedAt => ({
  version: DUMP_RESISTANCE_VERSION,
  status: 'WAIT_LIVE',
  type: 'CAP',
  confirmedAt,
  rejectionAt: confirmedAt - 300000,
  expiresAt: confirmedAt + 900000,
  entry: 100,
  entryLow: 99.7,
  entryHigh: 100.2,
  zoneLow: 100.3,
  zoneHigh: 100.6,
  stop: 101,
  target: 97,
  atr: 1,
  rr: 2.65,
  pullbackVolumeRatio: 0.5,
  confirmationVolumeRatio: 1.5,
});
const snapshot = confirmedAt => ({
  interval: '15m', generatedAt: now - 100,
  records: [{
    id: `XYZUSDT:15m:${confirmedAt - 100000}`,
    symbol: 'XYZUSDT', interval: '15m', dumpAt: confirmedAt - 900000,
    retestAt: confirmedAt - 300000, resistance: resistance(confirmedAt),
  }],
});
const quote = price => () => ({ markPrice: price, eventAt: now - 10 });

try {
  const calls = [];
  const notifier = new DumpCapResistanceDiscordNotifier({
    stateFile: join(dir, 'state.json'), webhookUrl: webhook,
    baseUrl: () => 'https://liquidity.example.test', now: () => now,
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
  assert.match(calls[0].body.embeds[0].title, /KHÁNG CỰ SHORT ĐÃ PASS · XYZUSDT · 15m/);
  assert.match(calls[0].body.embeds[0].description, /không tự đặt Binance/i);
  assert.equal(calls[0].body.allowed_mentions.parse.length, 0);
  assert.equal((await notifier.process({ snapshots: [snapshot(confirmedAt)], getQuote: quote(100) })).sent, 0);
  assert.equal(calls.length, 1, 'same setup must send once');

  const historicalCalls = [];
  const historical = new DumpCapResistanceDiscordNotifier({
    stateFile: join(dir, 'historical.json'), webhookUrl: webhook, now: () => now,
    fetchImpl: async (...args) => { historicalCalls.push(args); return { ok: true, status: 204 }; },
  });
  now += 1000;
  await historical.process({ snapshots: [snapshot(historical.startedAt - 1)], getQuote: quote(100) });
  assert.equal(historicalCalls.length, 0, 'must not replay pre-start confirmation');

  const invalidated = new DumpCapResistanceDiscordNotifier({
    stateFile: join(dir, 'invalid.json'), webhookUrl: webhook, now: () => now,
    fetchImpl: async () => { throw new Error('invalidated plan must not send'); },
  });
  now += 1000;
  const invalidConfirmedAt = invalidated.startedAt + 500;
  await invalidated.process({ snapshots: [snapshot(invalidConfirmedAt)], getQuote: quote(99.5) });
  invalidated.onMark({ symbol: 'XYZUSDT', markPrice: 101.1, eventTime: now });
  await invalidated.process({ snapshots: [snapshot(invalidConfirmedAt)], getQuote: quote(100) });
  assert.equal(invalidated.snapshot().counts.INVALIDATED, 1);

  const payload = dumpCapResistanceDiscordPayload({
    symbol: 'XYZUSDT', interval: '15m', resistance: resistance(now - 1000),
    livePrice: 100, liveAt: now, liveEvaluation: { rr: 2, distancePct: 0.3 },
  });
  assert(payload.embeds[0].footer.text.includes('OBSERVE ONLY'));
  console.log('Dump-cap resistance Discord: fresh live pass, dedupe, startup baseline and invalidation passed');
} finally {
  await rm(dir, { recursive: true, force: true });
}
