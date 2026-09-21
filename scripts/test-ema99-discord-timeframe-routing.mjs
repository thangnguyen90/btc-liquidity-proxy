#!/usr/bin/env node

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  EMA99_DISCORD_TIMEFRAME_SPLIT_VERSION,
  createEma99DiscordTimeframeRouter,
  ema99DiscordAnyWebhookConfigured,
  ema99DiscordChannelForInterval,
} from '../src/ema99DiscordRouting.js';

assert.equal(EMA99_DISCORD_TIMEFRAME_SPLIT_VERSION, 'EMA99_DISCORD_TIMEFRAME_SPLIT_V1_20260911');
assert.equal(ema99DiscordChannelForInterval('5m'), '5m');
assert.equal(ema99DiscordChannelForInterval(' 15M '), '15m');
assert.equal(ema99DiscordChannelForInterval('1h'), null);

const fiveMinuteEvents = [];
const fifteenMinuteEvents = [];
const notify = createEma99DiscordTimeframeRouter({
  fiveMinuteNotifier: {
    async notify(event) {
      fiveMinuteEvents.push(event);
      return { sent: 1, channel: '5m' };
    },
  },
  fifteenMinuteNotifier: {
    async notify(event) {
      fifteenMinuteEvents.push(event);
      return { sent: 1, channel: '15m' };
    },
  },
});

assert.deepEqual(await notify({ symbol: 'FIVEUSDT', interval: '5m' }), { sent: 1, channel: '5m' });
assert.deepEqual(await notify({ symbol: 'FIFTEENUSDT', interval: '15m' }), { sent: 1, channel: '15m' });
assert.deepEqual(await notify({ symbol: 'UNKNOWNUSDT', interval: '1h' }), { sent: 0, reason: 'unsupported_interval' });
assert.deepEqual(fiveMinuteEvents.map((event) => event.symbol), ['FIVEUSDT']);
assert.deepEqual(fifteenMinuteEvents.map((event) => event.symbol), ['FIFTEENUSDT']);

assert.equal(ema99DiscordAnyWebhookConfigured({
  POST_PUMP_EMA99_DISCORD_WEBHOOK_URL: 'https://five.example',
  POST_PUMP_EMA99_15M_DISCORD_WEBHOOK_URL: '',
}), true);
assert.equal(ema99DiscordAnyWebhookConfigured({
  POST_PUMP_EMA99_DISCORD_WEBHOOK_URL: '',
  POST_PUMP_EMA99_15M_DISCORD_WEBHOOK_URL: 'https://fifteen.example',
}), true);
assert.equal(ema99DiscordAnyWebhookConfigured({
  POST_PUMP_EMA99_DISCORD_WEBHOOK_URL: ' ',
  POST_PUMP_EMA99_15M_DISCORD_WEBHOOK_URL: '',
}), false);

const serverSource = await readFile(new URL('../src/server.js', import.meta.url), 'utf8');
assert.match(serverSource, /post-pump-ema99-15m-discord\.json/);
assert.match(serverSource, /POST_PUMP_EMA99_15M_DISCORD_WEBHOOK_URL/);
assert.match(serverSource, /enrichFiveMinuteEma99Context\(outgoing,klineCache,Date\.now\(\)\)/);
assert.match(serverSource, /notifyWithHtfContext\(event\)/);
assert.doesNotMatch(serverSource, /postPumpEma99Discord\.notify\(/);

console.log('EMA99 Discord timeframe routing tests passed.');
