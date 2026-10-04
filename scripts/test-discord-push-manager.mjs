import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  DiscordPushManager,
  buildDiscordPushRouteCatalog,
  buildDiscordRoutePushPayload,
} from '../src/discordPushManager.js';

const directory = await mkdtemp(join(tmpdir(), 'discord-push-manager-'));
let now = Date.UTC(2026, 9, 4, 10, 0);
const delivered = [];
const webPushService = {
  publicConfig: async () => ({ configured: true, subscriptionCount: 1, maxSubscriptions: 50, lastDelivery: null }),
  sendPayload: async payload => {
    delivered.push(payload);
    return { eventId: payload.eventId, attempted: 1, sent: 1, removed: 0, failed: 0, completedAt: now };
  },
};
const environment = {
  LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_DISCORD_WEBHOOK_URL:
    'https://discord.com/api/webhooks/100/secret-a',
  MARKET_BREADTH_SHOCK_DISCORD_WEBHOOK_URL:
    'https://discord.com/api/webhooks/200/secret-b',
  EMA99_MARKET_BREADTH_DISCORD_WEBHOOK_URL:
    'https://discord.com/api/webhooks/200/secret-b',
  NOT_A_WEBHOOK: 'https://example.test',
};

const flush = () => new Promise(resolve => setImmediate(resolve));

try {
  const routes = buildDiscordPushRouteCatalog(environment);
  assert.equal(routes.length, 2);
  const opposite = routes.find(route => route.keys.includes(
    'LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_DISCORD_WEBHOOK_URL',
  ));
  const shared = routes.find(route => route.sharedWebhook);
  assert.equal(opposite.defaultEnabled, true);
  assert.equal(shared.keys.length, 2);
  assert.equal(shared.defaultEnabled, false);

  const sample = buildDiscordRoutePushPayload({
    route: opposite,
    now,
    discordPayload: {
      username: 'AI Local',
      embeds: [{
        title: '🔴 GIÁ VƯỢT VÙNG TRÊN · LONG · ZROUSDT',
        description: '**NẾN 5M ĐÃ ĐÓNG.** Giá vượt vùng.',
        fields: [{ name: 'VÙNG', value: '**1.87 – 1.88**' }],
      }],
    },
  });
  assert.match(sample.signalType, /^DISCORD_ROUTE:/);
  assert.equal(sample.side, 'LONG');
  assert.equal(sample.symbol, 'ZROUSDT');
  assert.doesNotMatch(sample.body, /\*\*/);

  const manager = new DiscordPushManager({
    stateFile: join(directory, 'manager.json'),
    routes,
    webPushService,
    now: () => now,
  });
  const initial = await manager.snapshot();
  assert.equal(initial.configuredRoutes, 2);
  assert.equal(initial.enabledRoutes, 1);
  assert.equal(initial.webPush.subscriptionCount, 1);
  assert.equal(JSON.stringify(initial).includes('secret-a'), false, 'snapshot must not leak webhook secret');

  const requests = [];
  const wrappedFetch = manager.wrapFetch(async (url, init) => {
    requests.push({ url, init });
    return new Response(null, { status: String(url).includes('/fail') ? 500 : 204 });
  });
  const discordBody = JSON.stringify({ embeds: [{ title: '🔴 LONG · ZROUSDT', description: 'Đã đạt.' }] });
  await wrappedFetch(environment.LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH_DISCORD_WEBHOOK_URL, {
    method: 'POST', body: discordBody,
  });
  await flush();
  await flush();
  assert.equal(delivered.length, 1, 'default opposite route must push after Discord 2xx');

  await wrappedFetch(environment.MARKET_BREADTH_SHOCK_DISCORD_WEBHOOK_URL, {
    method: 'POST', body: JSON.stringify({ embeds: [{ title: 'BTC shock' }] }),
  });
  await flush();
  await flush();
  assert.equal(delivered.length, 1, 'new Discord routes must default OFF');

  await manager.updateRoute(shared.id, true);
  now += 60_000;
  await wrappedFetch(environment.MARKET_BREADTH_SHOCK_DISCORD_WEBHOOK_URL, {
    method: 'POST', body: JSON.stringify({ embeds: [{ title: 'BTC shock' }] }),
  });
  await flush();
  await flush();
  assert.equal(delivered.length, 2, 'enabled route must push after Discord 2xx');

  const final = await manager.snapshot();
  const finalShared = final.routes.find(route => route.id === shared.id);
  assert.equal(finalShared.enabled, true);
  assert.equal(finalShared.observedCount, 2);
  assert.equal(finalShared.pushedCount, 1);
  assert.equal(finalShared.deliveredCount, 1);
  assert.equal(requests.length, 3);
} finally {
  await rm(directory, { recursive: true, force: true });
}

console.log('Discord push manager bridge tests: OK');
