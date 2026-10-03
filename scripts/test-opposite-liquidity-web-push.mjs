import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  OppositeLiquidityWebPushService,
  buildOppositeLiquidityPushPayload,
  normalizeWebPushSubscription,
} from '../src/oppositeLiquidityWebPush.js';

const directory = await mkdtemp(join(tmpdir(), 'opposite-web-push-'));
let now = Date.UTC(2026, 9, 4, 1, 0);
const deliveries = [];
const mockWebPush = {
  generateVAPIDKeys: () => ({ publicKey: 'PUBLIC_VAPID_TEST_KEY', privateKey: 'PRIVATE_VAPID_TEST_KEY' }),
  setVapidDetails: (...args) => { mockWebPush.vapidDetails = args; },
  sendNotification: async (subscription, payload, options) => {
    deliveries.push({ subscription, payload: JSON.parse(payload), options });
    if (subscription.endpoint.endsWith('/gone')) {
      const error = new Error('expired');
      error.statusCode = 410;
      throw error;
    }
    return { statusCode: 201 };
  },
};
const makeSubscription = suffix => ({
  endpoint: `https://push.example.test/${suffix}`,
  expirationTime: null,
  keys: {
    p256dh: 'A'.repeat(88),
    auth: 'B'.repeat(24),
  },
});

try {
  assert.throws(() => normalizeWebPushSubscription({ endpoint:'http://bad.test', keys:{} }), /INVALID/);
  const service = new OppositeLiquidityWebPushService({
    stateFile: join(directory, 'subscriptions.json'),
    vapidFile: join(directory, 'vapid.json'),
    webPushImpl: mockWebPush,
    now: () => now,
  });
  const config = await service.publicConfig();
  assert.equal(config.publicKey, 'PUBLIC_VAPID_TEST_KEY');
  assert.equal(config.subscriptionCount, 0);
  assert.match(mockWebPush.vapidDetails[0], /^https:/);

  await service.subscribe(makeSubscription('phone'), { userAgent:'Mobile Test', deviceLabel:'Android' });
  await service.subscribe(makeSubscription('gone'), { userAgent:'Expired Test', deviceLabel:'iPhone' });
  assert.equal((await service.publicConfig()).subscriptionCount, 2);

  const event = {
    eventId: 'ZROUSDT|ABOVE|5m|1700000000000',
    side: 'LONG',
    symbol: 'ZROUSDT',
    interval: '5m',
    zone: { low:1.87739, high:1.883 },
    depth: { oppositeRatio:1.553 },
    binanceExecution: { status:'submitted' },
    notifiedAt: now,
  };
  const payload = buildOppositeLiquidityPushPayload(event);
  assert.equal(payload.signalType, 'LOCAL_AI_LIQUIDITY_BREAKOUT_OPPOSITE_DEPTH');
  assert.match(payload.title, /🔴 LONG · ZROUSDT/);
  const first = await service.send(event);
  assert.equal(first.attempted, 2);
  assert.equal(first.sent, 1);
  assert.equal(first.removed, 1);
  assert.equal(deliveries.length, 2);
  assert.equal(deliveries[0].options.urgency, 'high');
  assert.equal((await service.publicConfig()).subscriptionCount, 1);

  const duplicate = await service.send(event);
  assert.equal(duplicate.deduped, true);
  assert.equal(deliveries.length, 2);

  now += 1_000;
  const unsubscribed = await service.unsubscribe(makeSubscription('phone').endpoint);
  assert.equal(unsubscribed.unsubscribed, true);
  assert.equal(unsubscribed.subscriptionCount, 0);

  const reloaded = new OppositeLiquidityWebPushService({
    stateFile: join(directory, 'subscriptions.json'),
    vapidFile: join(directory, 'vapid.json'),
    webPushImpl: mockWebPush,
    now: () => now,
  });
  assert.equal((await reloaded.publicConfig()).publicKey, 'PUBLIC_VAPID_TEST_KEY');
  assert.equal((await reloaded.publicConfig()).subscriptionCount, 0);
} finally {
  await rm(directory, { recursive:true, force:true });
}

console.log('opposite liquidity true Web Push tests: OK');
