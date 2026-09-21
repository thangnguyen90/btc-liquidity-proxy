import assert from 'node:assert/strict';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  COIN_HORIZON_SWEEP_TRANSITION_DISCORD_VERSION,
  CoinHorizonSweepTransitionNotifier,
  buildCoinHorizonSweepTransitionPayload,
  collectCoinHorizonSweepState,
  normalizeCoinHorizonSweepWebhookUrl,
} from '../src/coinHorizonSweepTransitionDiscord.js';

let now = Date.UTC(2026, 8, 12, 12, 0, 0);

function analysis(state = 'UP') {
  return {
    symbol: 'TAUSDT',
    generatedAt: new Date(now).toISOString(),
    market: { markPrice: 0.055994 },
    trend: {
      frames: [
        { interval: '1h', state, atr14: 0.0019, closeTime: now - 1 },
        { interval: '4h', state, atr14: 0.00386, closeTime: now - 1 },
      ],
    },
    zones: { supports: [], resistances: [] },
  };
}

function neutralAnalysis() {
  const value = analysis('UP');
  value.trend.frames[1].state = 'DOWN';
  return value;
}

assert.equal(
  COIN_HORIZON_SWEEP_TRANSITION_DISCORD_VERSION,
  'COIN_HORIZON_SWEEP_TRANSITION_DISCORD_V2_BINANCE_STATUS_20260913',
);
assert.equal(collectCoinHorizonSweepState(analysis('UP'), now).state, 'UPPER');
assert.equal(collectCoinHorizonSweepState(analysis('DOWN'), now).state, 'LOWER');
assert.equal(collectCoinHorizonSweepState(neutralAnalysis(), now).state, 'NEUTRAL');

const stale = analysis('UP');
stale.freshness = { stale: true };
assert.equal(collectCoinHorizonSweepState(stale, now), null);

const validUrl = 'https://discord.com/api/webhooks/123456789/token_ABC-123';
assert.ok(normalizeCoinHorizonSweepWebhookUrl(validUrl));
for (const invalid of [
  'http://discord.com/api/webhooks/123/token',
  'https://discord.com.evil.example/api/webhooks/123/token',
  'https://discord.com/channels/123/token',
]) assert.equal(normalizeCoinHorizonSweepWebhookUrl(invalid), '');

const sample = {
  ...collectCoinHorizonSweepState(analysis('UP'), now),
  previousState: 'NEUTRAL',
};
const payload = buildCoinHorizonSweepTransitionPayload(sample);
assert.equal(payload.embeds[0].color, 0x10b981);
assert.match(payload.embeds[0].title, /QUÉT LÊN/);
assert.match(payload.embeds[0].description, /CHƯA ĐỒNG THUẬN/);
assert.match(payload.embeds[0].description, /công tắc riêng.*OFF/i);
assert.deepEqual(payload.allowed_mentions, { parse: [] });
assert.ok(payload.embeds[0].fields.every((field) => field.value.length <= 1024));

const submittedPayload = buildCoinHorizonSweepTransitionPayload({ ...sample, binanceExecution: {
  status: 'submitted', side: 'LONG', marginUsdt: 5, leverage: 5,
  takeProfitPrice: 0.06, stopLossPrice: 0.05, takeProfitRoePct: 30,
  stopLossRoePct: 25, rewardRisk: 1.2,
} });
assert.match(submittedPayload.embeds[0].description, /ĐÃ GỬI LONG MARKET/);
assert.match(submittedPayload.embeds[0].description, /SL 0.05 \(−25% ROE\)/);

const temp = await mkdtemp(join(tmpdir(), 'coin-horizon-transition-'));
const stateFile = join(temp, 'state.json');
const calls = [];
const options = {
  stateFile,
  webhookUrl: () => validUrl,
  now: () => now,
  fetchImpl: async (_url, request) => {
    calls.push(JSON.parse(request.body));
    return { ok: true, status: 204 };
  },
};

let notifier = new CoinHorizonSweepTransitionNotifier(options);
assert.equal((await notifier.notify(neutralAnalysis())).reason, 'baseline_recorded');
assert.equal((await notifier.notify(neutralAnalysis())).reason, 'no_directional_transition');
assert.equal(calls.length, 0, 'baseline and unchanged neutral state do not send');

const concurrent = await Promise.all([
  notifier.notify(analysis('UP')),
  notifier.notify(analysis('UP')),
]);
assert.deepEqual(concurrent.map((result) => result.sent), [1, 0]);
assert.equal(calls.length, 1, 'NEUTRAL -> UPPER sends exactly once');
assert.equal(calls[0].embeds[0].color, 0x10b981);

notifier = new CoinHorizonSweepTransitionNotifier(options);
assert.equal((await notifier.notify(analysis('UP'))).reason, 'no_directional_transition');
assert.equal(calls.length, 1, 'restart does not repeat the same direction');

const down = await notifier.notify(analysis('DOWN'));
assert.equal(down.sent, 1);
assert.equal(down.state, 'LOWER');
assert.equal(calls[1].embeds[0].color, 0xef4444);
assert.match(calls[1].embeds[0].title, /QUÉT XUỐNG/);

assert.equal((await notifier.notify(neutralAnalysis())).sent, 0);
assert.equal((await notifier.notify(analysis('DOWN'))).sent, 1, 'NEUTRAL -> LOWER is a new transition');
assert.equal(calls.length, 3);

const saved = JSON.parse(await readFile(stateFile, 'utf8'));
assert.equal(saved.symbols.TAUSDT.state, 'LOWER');
assert.equal(saved.version, COIN_HORIZON_SWEEP_TRANSITION_DISCORD_VERSION);

console.log('Coin Horizon sweep transition Discord: baseline, neutral, up/down transition, restart and dedupe passed.');
